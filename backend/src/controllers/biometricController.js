const AnonymousBiometric = require('../models/AnonymousBiometric');
const BiometricSubmission = require('../models/BiometricSubmission');
const Voter = require('../models/Voter');
const {
  hashFingerprintSample,
  hashFaceDescriptor,
  hammingSimilarity,
  normalizeVector,
  cosineSimilarity,
} = require('../utils/biometricHash');
const { detectDuplicateWithRandomForest } = require('../utils/randomForestDuplicate');

const FINGERPRINT_MATCH_THRESHOLD = 0.98;
const FACE_HASH_MATCH_THRESHOLD = 0.45;
const FACE_VECTOR_MATCH_THRESHOLD = 0.8;

function validateBiometricPayload({ fingerprintSample, faceDescriptor }) {
  if (!fingerprintSample || !Array.isArray(faceDescriptor) || faceDescriptor.length === 0) {
    const err = new Error('fingerprintSample and faceDescriptor are required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

function validatePrototypeBiometricPayload({ fingerprintSample }) {
  if (!fingerprintSample) {
    const err = new Error('fingerprintSample is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

function validateIdentityPayload({ aadhaarNumber, voterId }) {
  if (!aadhaarNumber || typeof aadhaarNumber !== 'string' || !/^\d{12}$/.test(aadhaarNumber)) {
    const err = new Error('aadhaarNumber must be exactly 12 digits');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!voterId || typeof voterId !== 'string' || voterId.trim().length < 8) {
    const err = new Error('voterId is required');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
}

function buildAnonId() {
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `ANON-${random}`;
}

function buildSubmissionId() {
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `SUB-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function resolveEligibility(profile) {
  return Boolean(profile.canVote) && !profile.hasVoted;
}

async function fetchVoterEligibility(aadhaarNumber, voterId) {
  const voter = await Voter.findOne({ aadhaarNumber }).select('_id hasVoted locked').lean();
  if (!voter) return { found: false };

  const normalizedVoterId = String(voterId || '').trim();
  const dbVoterId = String(voter._id);
  if (normalizedVoterId && normalizedVoterId !== dbVoterId) {
    return { found: true, identityMismatch: true, dbVoterId };
  }

  const hasVoted = Boolean(voter.hasVoted);
  const canVote = !hasVoted && !Boolean(voter.locked);
  return { found: true, identityMismatch: false, dbVoterId, hasVoted, canVote };
}

async function enrollAnonymousBiometric(req, res, next) {
  try {
    const { fingerprintSample, faceDescriptor, aadhaarNumber, voterId } = req.body || {};
    validateBiometricPayload({ fingerprintSample, faceDescriptor });
    validateIdentityPayload({ aadhaarNumber, voterId });

    const voterStatus = await fetchVoterEligibility(aadhaarNumber, voterId);
    if (!voterStatus.found) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Voter not found for the provided Aadhaar number' },
      });
    }
    if (voterStatus.identityMismatch) {
      return res.status(409).json({
        error: { code: 'IDENTITY_MISMATCH', message: 'Provided voterId does not match the Aadhaar record' },
      });
    }

    const incomingFingerprintHash = hashFingerprintSample(fingerprintSample);
    const incomingFaceHash = hashFaceDescriptor(faceDescriptor);
    const incomingFaceVector = normalizeVector(faceDescriptor);

    const existing = await AnonymousBiometric.find({}).select(
      'anonId aadhaarNumber voterId faceEmbeddingHash faceEmbeddingVector fingerprintTemplateHash canVote hasVoted'
    );

    const sameIdentity = existing.find((row) => row.aadhaarNumber === aadhaarNumber && row.voterId === voterId);

    if (sameIdentity) {
      await AnonymousBiometric.updateOne(
        { anonId: sameIdentity.anonId },
        {
          $set: {
            fingerprintTemplateHash: incomingFingerprintHash,
            faceEmbeddingHash: incomingFaceHash,
            faceEmbeddingVector: incomingFaceVector,
            canVote: voterStatus.canVote,
            hasVoted: voterStatus.hasVoted,
          },
        }
      );

      return res.status(200).json({
        ok: true,
        created: false,
        profile: {
          anonId: sameIdentity.anonId,
          aadhaarNumber,
          voterId,
          canVote: voterStatus.canVote,
          hasVoted: voterStatus.hasVoted,
        },
      });
    }

    const sameAadhaar = existing.find((row) => row.aadhaarNumber === aadhaarNumber);
    const sameVoterId = existing.find((row) => row.voterId === voterId);
    const rfDuplicate = detectDuplicateWithRandomForest({
      incomingFingerprintHash,
      incomingFaceHash,
      records: existing,
      requireFace: true,
    });

    const conflict = sameAadhaar || sameVoterId || (rfDuplicate.isDuplicate ? rfDuplicate.match : null);

    if (conflict) {
      const allSameIdentityAndBiometric =
        conflict.aadhaarNumber === aadhaarNumber &&
        conflict.voterId === voterId &&
        conflict.fingerprintTemplateHash === incomingFingerprintHash &&
        conflict.faceEmbeddingHash === incomingFaceHash;

      if (!allSameIdentityAndBiometric) {
        return res.status(409).json({
          error: {
            code: 'DUPLICATE_BIOMETRIC',
            message: 'Duplicate Aadhaar, voter ID, face, or fingerprint detected. Enrollment blocked.',
          },
        });
      }

      return res.status(200).json({
        ok: true,
        created: false,
        profile: {
          anonId: conflict.anonId,
          aadhaarNumber: conflict.aadhaarNumber,
          voterId: conflict.voterId,
          canVote: voterStatus.canVote,
          hasVoted: voterStatus.hasVoted,
        },
      });
    }

    const nearMatch = existing.find((row) => {
      const fp = hammingSimilarity(row.fingerprintTemplateHash, incomingFingerprintHash);
      const rowVector = Array.isArray(row.faceEmbeddingVector) ? row.faceEmbeddingVector : [];
      const face = rowVector.length
        ? cosineSimilarity(rowVector, incomingFaceVector)
        : hammingSimilarity(row.faceEmbeddingHash, incomingFaceHash);
      return fp >= 0.995 && face >= 0.995;
    });

    if (nearMatch) {
      if (nearMatch.aadhaarNumber !== aadhaarNumber || nearMatch.voterId !== voterId) {
        return res.status(409).json({
          error: {
            code: 'DUPLICATE_BIOMETRIC',
            message: 'This biometric is already linked to a different identity.',
          },
        });
      }

      return res.status(200).json({
        ok: true,
        created: false,
        profile: {
          anonId: nearMatch.anonId,
          aadhaarNumber: nearMatch.aadhaarNumber,
          voterId: nearMatch.voterId,
          canVote: voterStatus.canVote,
          hasVoted: voterStatus.hasVoted,
        },
      });
    }

    const doc = await AnonymousBiometric.create({
      anonId: buildAnonId(),
      aadhaarNumber,
      voterId,
      faceEmbeddingHash: incomingFaceHash,
      faceEmbeddingVector: incomingFaceVector,
      fingerprintTemplateHash: incomingFingerprintHash,
      canVote: voterStatus.canVote,
      hasVoted: voterStatus.hasVoted,
    });

    return res.status(201).json({
      ok: true,
      created: true,
      profile: {
        anonId: doc.anonId,
        aadhaarNumber: doc.aadhaarNumber,
        voterId: doc.voterId,
        canVote: resolveEligibility(doc),
        hasVoted: doc.hasVoted,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function checkAnonymousEligibility(req, res, next) {
  try {
    const { fingerprintSample, faceDescriptor, aadhaarNumber, voterId } = req.body || {};
    validateBiometricPayload({ fingerprintSample, faceDescriptor });
    validateIdentityPayload({ aadhaarNumber, voterId });

    const voterStatus = await fetchVoterEligibility(aadhaarNumber, voterId);
    if (!voterStatus.found) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Voter not found for the provided Aadhaar number' },
      });
    }
    if (voterStatus.identityMismatch) {
      return res.status(409).json({
        error: { code: 'IDENTITY_MISMATCH', message: 'Provided voterId does not match the Aadhaar record' },
      });
    }

    const incomingFingerprintHash = hashFingerprintSample(fingerprintSample);
    const incomingFaceHash = hashFaceDescriptor(faceDescriptor);
    const incomingFaceVector = normalizeVector(faceDescriptor);

    const profile = await AnonymousBiometric.findOne({ aadhaarNumber, voterId })
      .select('anonId aadhaarNumber voterId faceEmbeddingHash faceEmbeddingVector fingerprintTemplateHash canVote hasVoted matchedCount')
      .lean();

    if (!profile) {
      return res.status(404).json({
        error: {
          code: 'NO_ANON_DATA',
          message: 'No anonymous biometric profile found for this voter. Store in Anonymous DB first.',
        },
      });
    }

    const fpSimilarity = hammingSimilarity(profile.fingerprintTemplateHash, incomingFingerprintHash);
    const faceSimilarity = Array.isArray(profile.faceEmbeddingVector) && profile.faceEmbeddingVector.length
      ? cosineSimilarity(profile.faceEmbeddingVector, incomingFaceVector)
      : hammingSimilarity(profile.faceEmbeddingHash, incomingFaceHash);

    const faceThreshold = Array.isArray(profile.faceEmbeddingVector) && profile.faceEmbeddingVector.length
      ? FACE_VECTOR_MATCH_THRESHOLD
      : FACE_HASH_MATCH_THRESHOLD;

    if (fpSimilarity < FINGERPRINT_MATCH_THRESHOLD || faceSimilarity < faceThreshold) {
      return res.status(401).json({
        error: {
          code: 'VERIFICATION_FAILED',
          message: 'No matching anonymous biometric profile found',
        },
      });
    }

    await AnonymousBiometric.updateOne(
      { anonId: profile.anonId },
      {
        $set: {
          lastCheckedAt: new Date(),
          canVote: voterStatus.canVote,
          hasVoted: voterStatus.hasVoted,
        },
        $inc: { matchedCount: 1 },
      }
    );

    return res.json({
      ok: true,
      profile: {
        anonId: profile.anonId,
        aadhaarNumber: profile.aadhaarNumber,
        voterId: profile.voterId,
        canVote: voterStatus.canVote,
        hasVoted: voterStatus.hasVoted,
      },
      similarity: {
        fingerprint: Number(fpSimilarity.toFixed(4)),
        face: Number(faceSimilarity.toFixed(4)),
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function submitPrototypeBiometric(req, res, next) {
  try {
    const { fingerprintSample, faceDescriptor } = req.body || {};
    validatePrototypeBiometricPayload({ fingerprintSample });

    const hasFace = Array.isArray(faceDescriptor) && faceDescriptor.length > 0;

    const doc = await BiometricSubmission.create({
      submissionId: buildSubmissionId(),
      fingerprintSample,
      faceDescriptor: hasFace ? faceDescriptor : [],
      source: 'voter-portal-prototype',
      status: 'pending',
    });

    return res.status(201).json({
      ok: true,
      submission: {
        id: doc.submissionId,
        status: doc.status,
        hasFace: doc.faceDescriptor.length > 0,
        submittedAt: doc.createdAt,
      },
      message: 'Biometric data submitted to admin for review (prototype).',
    });
  } catch (err) {
    return next(err);
  }
}

async function listPrototypeSubmissions(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const submissions = await BiometricSubmission.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      submissions: submissions.map((s) => ({
        id: s.submissionId,
        status: s.status,
        hasFace: Array.isArray(s.faceDescriptor) && s.faceDescriptor.length > 0,
        fingerprintPreview:
          typeof s.fingerprintSample?.credentialId === 'string'
            ? s.fingerprintSample.credentialId
            : JSON.stringify(s.fingerprintSample || {}).slice(0, 48),
        submittedAt: s.createdAt,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  enrollAnonymousBiometric,
  checkAnonymousEligibility,
  submitPrototypeBiometric,
  listPrototypeSubmissions,
};
