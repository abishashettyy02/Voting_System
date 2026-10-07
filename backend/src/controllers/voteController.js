const Candidate = require('../models/Candidate');
const Voter = require('../models/Voter');
const Vote = require('../models/Vote');

async function listCandidates(req, res, next) {
  try {
    const candidates = await Candidate.find().sort({ createdAt: 1 }).lean();
    res.json({
      candidates: candidates.map((c) => ({
        id: c._id.toString(),
        name: c.name,
        party: c.party,
        description: c.description,
        photoKey: c.photoKey,
        votes: c.votes,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function castVote(req, res, next) {
  try {
    const { candidateId } = req.body || {};
    if (!candidateId || typeof candidateId !== 'string') {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'candidateId is required' },
      });
    }

    if (!req.user || req.user.role !== 'voter' || req.user.authMethod !== 'dual_biometric_admin') {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Voting is allowed only after admin-enrolled face and fingerprint verification.',
        },
      });
    }

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Candidate not found' },
      });
    }

    // Prevent duplicate voting (atomic): only set hasVoted if all eligibility checks pass.
    const updatedVoter = await Voter.findOneAndUpdate(
      {
        _id: req.user.voterId,
        hasVoted: false,
        locked: false,
        biometricManagedByAdmin: true,
        $and: [
          { $or: [{ fingerprintTemplateHash: { $ne: '' } }, { fingerprintHash: { $ne: '' } }] },
          { $or: [{ faceEmbeddingHash: { $ne: '' } }, { faceDataHash: { $ne: '' } }] },
        ],
      },
      { $set: { hasVoted: true } },
      { new: true }
    );

    if (!updatedVoter) {
      const voter = await Voter.findById(req.user.voterId).lean();
      if (!voter) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Voter not found' },
        });
      }

      if (voter.hasVoted) {
        return res.status(409).json({
          error: { code: 'ALREADY_VOTED', message: 'You have already voted' },
        });
      }

      if (voter.locked) {
        return res.status(403).json({
          error: { code: 'LOCKED', message: 'This voter account is locked. Contact admin.' },
        });
      }

      const hasFingerprint = Boolean(voter.fingerprintTemplateHash || voter.fingerprintHash);
      const hasFace = Boolean(voter.faceEmbeddingHash || voter.faceDataHash);
      if (!voter.biometricManagedByAdmin || !hasFingerprint || !hasFace) {
        return res.status(403).json({
          error: {
            code: 'NOT_ELIGIBLE',
            message: 'Biometric profile is incomplete. Ask admin to upload face and fingerprint.',
          },
        });
      }

      return res.status(409).json({
        error: { code: 'VOTE_BLOCKED', message: 'Unable to cast vote for this voter state.' },
      });
    }

    try {
      await Vote.create({
        voterId: updatedVoter._id,
        candidateId: candidate._id,
        state: updatedVoter.state || 'Unknown',
        constituency: updatedVoter.constituency || 'Unknown',
      });
    } catch (err) {
      // Unique constraint prevents duplicates even if concurrent requests slip through.
      if (err && err.code === 11000) {
        return res.status(409).json({
          error: { code: 'ALREADY_VOTED', message: 'You have already voted' },
        });
      }

      // Roll back hasVoted when vote row creation fails for non-duplicate reasons.
      await Voter.updateOne({ _id: updatedVoter._id, hasVoted: true }, { $set: { hasVoted: false } });
      throw err;
    }

    await Candidate.updateOne({ _id: candidate._id }, { $inc: { votes: 1 } });

    return res.json({
      ok: true,
      message: 'Vote Successfully Recorded',
      candidate: { id: candidate._id.toString(), name: candidate.name, party: candidate.party },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listCandidates, castVote };
