const jwt = require('jsonwebtoken');

const Voter = require('../models/Voter');
const FraudLog = require('../models/FraudLog');
const {
  hashFingerprintSample,
  hashFaceDescriptor,
  hammingSimilarity,
  cosineSimilarity,
  normalizeVector,
} = require('../utils/biometricHash');

const FACE_HASH_MATCH_THRESHOLD = 0.45;
const FACE_VECTOR_MATCH_THRESHOLD = 0.8;

function normalizeName(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function validateVerifyPayload({ name, aadhaarNumber }) {
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    const err = new Error('Full Name is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!aadhaarNumber || typeof aadhaarNumber !== 'string' || !/^\d{12}$/.test(aadhaarNumber)) {
    const err = new Error('Aadhaar Number must be exactly 12 digits');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

function validateBiometricPayload({ fingerprintSample, faceDescriptor }) {
  if (!fingerprintSample || !faceDescriptor) {
    const err = new Error('fingerprintSample and faceDescriptor are required for biometric verification');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

function validateBiometricScanPayload({ fingerprintSample, faceDescriptor }) {
  if (!fingerprintSample) {
    const err = new Error('fingerprintSample is required for biometric verification');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (faceDescriptor !== undefined && (!Array.isArray(faceDescriptor) || faceDescriptor.length === 0)) {
    const err = new Error('faceDescriptor must be a non-empty array when provided');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const provider = fingerprintSample?.provider;
  const credentialId = fingerprintSample?.credentialId;

  if (provider !== 'platform-webauthn' || typeof credentialId !== 'string' || !credentialId.trim()) {
    const err = new Error('A valid platform fingerprint credential is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

function buildVoterAuthResponse(voter, options = {}) {
  const authMethod = options.authMethod || 'unknown';
  const token = jwt.sign(
    {
      role: 'voter',
      voterId: voter._id.toString(),
      aadhaarNumber: voter.aadhaarNumber,
      authMethod,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );

  return {
    token,
    voter: {
      voterId: voter._id.toString(),
      name: voter.name,
      aadhaarNumber: voter.aadhaarNumber,
      hasVoted: voter.hasVoted,
      canVote: !voter.hasVoted && !voter.locked,
      state: voter.state,
      constituency: voter.constituency,
      fraudFlag: voter.fraudFlag,
    },
  };
}

async function verifyVoter(req, res, next) {
  try {
    const { name, aadhaarNumber, fingerprintSample, faceDescriptor } = req.body || {};
    validateVerifyPayload({ name, aadhaarNumber });

    const voter = await Voter.findOne({ aadhaarNumber });
    if (!voter) {
      return res.status(401).json({
        error: { code: 'VERIFICATION_FAILED', message: 'Voter record not found' },
      });
    }

    if (voter.locked) {
      return res.status(403).json({
        error: { code: 'LOCKED', message: 'This voter account is locked. Contact admin.' },
      });
    }

    if (normalizeName(voter.name) !== normalizeName(name)) {
      return res.status(401).json({
        error: { code: 'VERIFICATION_FAILED', message: 'Name and Aadhaar do not match' },
      });
    }

    // Demo-only biometric flow:
    // - Fingerprint: hash of a simulated pattern sample (string/array). Compared by similarity.
    // - Face: face descriptor vector (from face-api.js in browser) hashed after quantization.
    // To keep the demo usable with mock datasets, we support first-time enrollment when templates are missing.

    validateBiometricPayload({ fingerprintSample, faceDescriptor });

    const incomingFingerprintHash = hashFingerprintSample(fingerprintSample);
    const incomingFaceHash = hashFaceDescriptor(faceDescriptor);

    const currentFingerprintHash = voter.fingerprintTemplateHash || voter.fingerprintHash || '';
    const currentFaceHash = voter.faceEmbeddingHash || voter.faceDataHash || '';
    const needsFingerprintEnroll = !currentFingerprintHash;
    const needsFaceEnroll = !currentFaceHash;

    if (needsFingerprintEnroll) {
      voter.fingerprintTemplateHash = incomingFingerprintHash;
      voter.fingerprintHash = incomingFingerprintHash;
    } else if (!voter.fingerprintTemplateHash && voter.fingerprintHash) {
      voter.fingerprintTemplateHash = voter.fingerprintHash;
    }

    if (needsFaceEnroll) {
      voter.faceEmbeddingHash = incomingFaceHash;
      voter.faceDataHash = incomingFaceHash;
    } else if (!voter.faceEmbeddingHash && voter.faceDataHash) {
      voter.faceEmbeddingHash = voter.faceDataHash;
    }

    if (needsFingerprintEnroll || needsFaceEnroll) {
      voter.lastVerifiedAt = new Date();
      await voter.save();
    }

    // Similarity checks (demo): compare hash strings as hex and compute bit similarity.
    // SHA-256 hex length = 64.
    const fpSimilarity = hammingSimilarity(voter.fingerprintTemplateHash || voter.fingerprintHash, incomingFingerprintHash);
    const faceSimilarity = hammingSimilarity(voter.faceEmbeddingHash || voter.faceDataHash, incomingFaceHash);

    const fingerprintOk = fpSimilarity >= 0.98;
    const faceOk = faceSimilarity >= 0.98;

    if (!fingerprintOk || !faceOk) {
      voter.fraudFlag = true;
      voter.fraudAttemptCount += 1;

      await Promise.all([
        voter.save(),
        FraudLog.create({
          aadhaarNumber,
          voterId: voter._id,
          ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
          reason: `Biometric mismatch: fp=${fpSimilarity.toFixed(3)} face=${faceSimilarity.toFixed(3)}`,
        }),
      ]);

      return res.status(401).json({
        error: {
          code: 'FRAUD_DETECTED',
          message: 'Biometric mismatch detected. Suspicious attempt logged (demo).',
        },
      });
    }

    voter.lastVerifiedAt = new Date();
    await voter.save();

    return res.json(buildVoterAuthResponse(voter, { authMethod: 'legacy_verify' }));
  } catch (err) {
    return next(err);
  }
}

async function verifyVoterByBiometrics(req, res, next) {
  try {
    const { fingerprintSample, faceDescriptor } = req.body || {};
    validateBiometricScanPayload({ fingerprintSample, faceDescriptor });

    const incomingFingerprintHash = hashFingerprintSample(fingerprintSample);
    const hasIncomingFace = Array.isArray(faceDescriptor) && faceDescriptor.length > 0;
    const incomingFaceHash = hasIncomingFace ? hashFaceDescriptor(faceDescriptor) : '';
    const incomingFaceVector = hasIncomingFace ? normalizeVector(faceDescriptor) : [];

    const exactMatches = await Voter.find({
      locked: false,
      biometricManagedByAdmin: true,
      $or: [{ fingerprintTemplateHash: incomingFingerprintHash }, { fingerprintHash: incomingFingerprintHash }],
    })
      .select('_id name aadhaarNumber state constituency hasVoted fraudFlag faceEmbeddingHash faceEmbeddingVector faceDataHash fingerprintTemplateHash fingerprintHash')
      .lean();

    if (!exactMatches.length) {
      return res.status(401).json({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found. Fingerprint is not mapped by admin for voting eligibility.',
        },
      });
    }

    if (exactMatches.length > 1) {
      return res.status(409).json({
        error: {
          code: 'AMBIGUOUS_BIOMETRICS',
          message: 'Fingerprint credential is mapped to multiple records. Contact admin.',
        },
      });
    }

    let best = exactMatches[0];

    if (hasIncomingFace) {
      const faceMatches = exactMatches.filter((v) => {
        const storedVector = Array.isArray(v.faceEmbeddingVector) ? v.faceEmbeddingVector : [];
        if (storedVector.length && incomingFaceVector.length) {
          return cosineSimilarity(storedVector, incomingFaceVector) >= FACE_VECTOR_MATCH_THRESHOLD;
        }

        const storedFaceHash = v.faceEmbeddingHash || v.faceDataHash;
        if (!storedFaceHash) return false;
        return hammingSimilarity(storedFaceHash, incomingFaceHash) >= FACE_HASH_MATCH_THRESHOLD;
      });

      if (!faceMatches.length) {
        return res.status(401).json({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found. Face ID and fingerprint must both match admin-enrolled biometrics.',
          },
        });
      }

      if (faceMatches.length > 1) {
        return res.status(409).json({
          error: {
            code: 'AMBIGUOUS_BIOMETRICS',
            message: 'Biometric scan matched multiple face records. Contact admin.',
          },
        });
      }

      best = faceMatches[0];
    }

    await Voter.updateOne({ _id: best._id }, { $set: { lastVerifiedAt: new Date() } });

    const freshVoter = await Voter.findById(best._id);
    return res.json(buildVoterAuthResponse(freshVoter, { authMethod: 'dual_biometric_admin' }));
  } catch (err) {
    return next(err);
  }
}

module.exports = { verifyVoter, verifyVoterByBiometrics };
