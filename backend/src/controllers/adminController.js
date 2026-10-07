const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Admin = require('../models/Admin');
const Candidate = require('../models/Candidate');
const Voter = require('../models/Voter');
const FraudLog = require('../models/FraudLog');
const Vote = require('../models/Vote');
const AdminUploadAudit = require('../models/AdminUploadAudit');
const { hashFingerprintSample, hashFaceDescriptor, normalizeVector } = require('../utils/biometricHash');
const { detectDuplicateWithRandomForest } = require('../utils/randomForestDuplicate');
const { sha256 } = require('../utils/crypto');

async function adminLogin(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'username and password are required' },
      });
    }

    const admin = await Admin.findOne({ username: String(username).trim() });
    if (!admin) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      });
    }

    const ok = await bcrypt.compare(String(password), admin.passwordHash);
    if (!ok) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      });
    }

    const token = jwt.sign(
      { role: 'admin', adminId: admin._id.toString(), username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
    );

    return res.json({ token, admin: { username: admin.username } });
  } catch (err) {
    return next(err);
  }
}

async function adminStats(req, res, next) {
  try {
    const [
      totalEligibleVoters,
      totalVerifiedVoters,
      totalVoted,
      totalFraudLogs,
      fraudFlaggedVoters,
      candidates,
      stateWise,
    ] = await Promise.all([
      Voter.countDocuments({}),
      Voter.countDocuments({ lastVerifiedAt: { $ne: null } }),
      Voter.countDocuments({ hasVoted: true }),
      FraudLog.countDocuments({}),
      Voter.countDocuments({ fraudFlag: true }),
      Candidate.find().sort({ createdAt: 1 }).lean(),
      Vote.aggregate([
        { $group: { _id: '$state', votes: { $sum: 1 } } },
        { $sort: { votes: -1 } },
        { $limit: 36 },
      ]),
    ]);

    const votesByCandidate = candidates.map((c) => ({
      candidateId: c._id.toString(),
      name: c.name,
      party: c.party,
      votes: c.votes,
    }));

    return res.json({
      totalEligibleVoters,
      totalVerifiedVoters,
      totalVoted,
      totalFraudLogs,
      fraudFlaggedVoters,
      votesByCandidate,
      stateWiseBreakdown: stateWise.map((s) => ({ state: s._id, votes: s.votes })),
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    return next(err);
  }
}

async function adminFindVoter(req, res, next) {
  try {
    const aadhaarNumber = String(req.params.aadhaarNumber || '').trim();
    if (!/^\d{12}$/.test(aadhaarNumber)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Aadhaar Number must be exactly 12 digits' },
      });
    }

    const voter = await Voter.findOne({ aadhaarNumber }).lean();
    if (!voter) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Voter not found' },
      });
    }

    return res.json({
      voter: {
        id: voter._id.toString(),
        name: voter.name,
        aadhaarNumber: voter.aadhaarNumber,
        voterId: `VOTER-${voter._id.toString().slice(-8).toUpperCase()}`,
        fingerprintTemplateHash: voter.fingerprintTemplateHash || voter.fingerprintHash || '',
        faceEmbeddingHash: voter.faceEmbeddingHash || voter.faceDataHash || '',
        state: voter.state,
        constituency: voter.constituency,
        biometricManagedByAdmin: Boolean(voter.biometricManagedByAdmin),
        lastBiometricUploadAt: voter.lastBiometricUploadAt,
        hasVoted: voter.hasVoted,
        locked: voter.locked,
        fraudFlag: voter.fraudFlag,
        fraudAttemptCount: voter.fraudAttemptCount,
        lastVerifiedAt: voter.lastVerifiedAt,
        createdAt: voter.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function adminListVoters(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 5000), 1), 5000);
    const voters = await Voter.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      voters: voters.map((voter) => ({
        id: voter._id.toString(),
        voterId: `VOTER-${voter._id.toString().slice(-8).toUpperCase()}`,
        name: voter.name,
        aadhaarNumber: voter.aadhaarNumber,
        fingerprintTemplateHash: voter.fingerprintTemplateHash || voter.fingerprintHash || '',
        faceEmbeddingHash: voter.faceEmbeddingHash || voter.faceDataHash || '',
        state: voter.state,
        constituency: voter.constituency,
        biometricManagedByAdmin: Boolean(voter.biometricManagedByAdmin),
        lastBiometricUploadAt: voter.lastBiometricUploadAt,
        hasVoted: voter.hasVoted,
        locked: voter.locked,
        fraudFlag: voter.fraudFlag,
        fraudAttemptCount: voter.fraudAttemptCount,
        lastVerifiedAt: voter.lastVerifiedAt,
        createdAt: voter.createdAt,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

async function adminSetLock(req, res, next) {
  try {
    const aadhaarNumber = String(req.params.aadhaarNumber || '').trim();
    const { locked } = req.body || {};
    if (!/^\d{12}$/.test(aadhaarNumber) || typeof locked !== 'boolean') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'aadhaarNumber and boolean locked are required' },
      });
    }

    const voter = await Voter.findOneAndUpdate(
      { aadhaarNumber },
      { $set: { locked } },
      { new: true }
    );
    if (!voter) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Voter not found' },
      });
    }

    return res.json({ ok: true, aadhaarNumber, locked: voter.locked });
  } catch (err) {
    return next(err);
  }
}

async function adminFraudLogs(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 1000), 1), 5000);
    const logs = await FraudLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({
      logs: logs.map((l) => ({
        id: l._id.toString(),
        aadhaarNumber: l.aadhaarNumber,
        ip: l.ip,
        reason: l.reason,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    return next(err);
  }
}

async function adminVoteRecords(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 5000), 1), 10000);
    const votes = await Vote.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('voterId', 'name aadhaarNumber state constituency')
      .populate('candidateId', 'name party')
      .lean();

    return res.json({
      votes: votes.map((vote) => {
        const voter = vote.voterId || {};
        const candidate = vote.candidateId || {};
        return {
          id: vote._id.toString(),
          votedAt: vote.createdAt,
          voterName: voter.name || 'Unknown',
          aadhaarNumber: voter.aadhaarNumber || 'Unknown',
          state: vote.state || voter.state || 'Unknown',
          constituency: vote.constituency || voter.constituency || 'Unknown',
          candidateName: candidate.name || 'Unknown',
          party: candidate.party || 'Unknown',
        };
      }),
    });
  } catch (err) {
    return next(err);
  }
}

async function adminUploadVoterBiometrics(req, res, next) {
  try {
    const aadhaarNumber = String(req.params.aadhaarNumber || '').trim();
    const { fingerprintSample, faceDescriptor } = req.body || {};

    if (!/^\d{12}$/.test(aadhaarNumber)) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Aadhaar Number must be exactly 12 digits' },
      });
    }

    if (!fingerprintSample) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'fingerprintSample is required' },
      });
    }

    const voter = await Voter.findOne({ aadhaarNumber });
    if (!voter) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Voter not found' },
      });
    }

    const fingerprintHash = hashFingerprintSample(fingerprintSample);
    const hasFace = Array.isArray(faceDescriptor) && faceDescriptor.length > 0;
    const faceVector = hasFace ? normalizeVector(faceDescriptor) : [];
    const faceHash = hasFace ? hashFaceDescriptor(faceDescriptor) : '';

    const existingBiometrics = await Voter.find({ _id: { $ne: voter._id } })
      .select('_id aadhaarNumber fingerprintTemplateHash faceEmbeddingHash')
      .lean();

    const rfDuplicate = detectDuplicateWithRandomForest({
      incomingFingerprintHash: fingerprintHash,
      incomingFaceHash: faceHash,
      records: existingBiometrics.filter((r) => r.fingerprintTemplateHash),
      requireFace: hasFace,
    });

    if (rfDuplicate.isDuplicate) {
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_BIOMETRIC',
          message: `RandomForest duplicate detection matched another voter (${rfDuplicate.match.aadhaarNumber}).`,
        },
      });
    }

    voter.fingerprintTemplateHash = fingerprintHash;
    voter.fingerprintHash = fingerprintHash;
    if (hasFace) {
      voter.faceEmbeddingHash = faceHash;
      voter.faceEmbeddingVector = faceVector;
      voter.faceDataHash = faceHash;
    }
    voter.biometricManagedByAdmin = true;
    voter.lastBiometricUploadAt = new Date();
    await voter.save();

    const voterId = `VOTER-${voter._id.toString().slice(-8).toUpperCase()}`;
    const payloadHash = sha256(
      JSON.stringify({
        aadhaarNumber,
        voterId,
        fingerprintHash,
        faceHash,
        uploadedAt: voter.lastBiometricUploadAt.toISOString(),
      })
    );

    const lastBlock = await AdminUploadAudit.findOne().sort({ createdAt: -1 }).lean();
    const prevHash = lastBlock?.blockHash || '';
    const blockHash = sha256(`${prevHash}|${payloadHash}|${voter._id.toString()}|${Date.now()}`);

    await AdminUploadAudit.create({
      adminId: String(req.user.adminId || ''),
      adminUsername: String(req.user.username || 'admin'),
      aadhaarNumber,
      voterId,
      action: 'UPLOAD_BIOMETRIC',
      payloadHash,
      prevHash,
      blockHash,
    });

    return res.json({
      ok: true,
      voter: {
        id: voter._id.toString(),
        aadhaarNumber: voter.aadhaarNumber,
        voterId,
        biometricManagedByAdmin: voter.biometricManagedByAdmin,
        lastBiometricUploadAt: voter.lastBiometricUploadAt,
      },
      audit: {
        payloadHash,
        prevHash,
        blockHash,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  adminLogin,
  adminStats,
  adminFindVoter,
  adminSetLock,
  adminFraudLogs,
  adminVoteRecords,
  adminListVoters,
  adminUploadVoterBiometrics,
};
