require('dotenv').config();

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const { connectDb } = require('../src/config/db');
const Voter = require('../src/models/Voter');
const Candidate = require('../src/models/Candidate');
const Admin = require('../src/models/Admin');
const Vote = require('../src/models/Vote');
const FraudLog = require('../src/models/FraudLog');
const { hashFingerprintSample, hashFaceDescriptor } = require('../src/utils/biometricHash');

async function seed() {
  await connectDb(process.env.MONGO_URI);

  const reset = String(process.env.SEED_RESET || '').toLowerCase() === 'true';

  if (reset) {
    await Promise.all([
      Voter.deleteMany({}),
      Candidate.deleteMany({}),
      Admin.deleteMany({}),
      Vote.deleteMany({}),
      FraudLog.deleteMany({}),
    ]);
  }

  const candidateSeeds = [
    {
      name: 'Asha Verma',
      party: 'Progress Alliance',
      description: 'Focused on transparent governance and digital public services.',
      photoKey: 'candidate-1.svg',
      votes: 0,
    },
    {
      name: 'Rohan Mehta',
      party: 'Green Future Party',
      description: 'Prioritizes sustainability, clean energy, and resilient cities.',
      photoKey: 'candidate-2.svg',
      votes: 0,
    },
    {
      name: 'Neelam Iyer',
      party: 'People First Front',
      description: 'Advocates for inclusive growth, education, and healthcare access.',
      photoKey: 'candidate-3.svg',
      votes: 0,
    },
  ];

  await Promise.all(
    candidateSeeds.map((candidate) =>
      Candidate.updateOne(
        { name: candidate.name, party: candidate.party },
        { $setOnInsert: candidate },
        { upsert: true }
      )
    )
  );

  const voterSeeds = [
    {
      name: 'Priya Sharma',
      aadhaarNumber: '123456789012',
      state: 'Maharashtra',
      constituency: 'Pune',
      enrolled: false,
      hasVoted: false,
      fraudFlag: false,
      fraudAttemptCount: 0,
      locked: false,
    },
    {
      name: 'Arjun Singh',
      aadhaarNumber: '234567890123',
      state: 'Karnataka',
      constituency: 'Bengaluru Central',
      enrolled: false,
      hasVoted: false,
      fraudFlag: false,
      fraudAttemptCount: 0,
      locked: false,
    },
    {
      name: 'Meera Nair',
      aadhaarNumber: '345678901234',
      state: 'Tamil Nadu',
      constituency: 'Chennai South',
      enrolled: false,
      hasVoted: false,
      fraudFlag: false,
      fraudAttemptCount: 0,
      locked: false,
    },
    {
      name: 'Rahul Kapoor',
      aadhaarNumber: '456789012345',
      state: 'Delhi',
      constituency: 'New Delhi',
      enrolled: true,
      hasVoted: true,
      fraudFlag: false,
      fraudAttemptCount: 1,
      locked: false,
    },
    {
      name: 'Sana Ahmed',
      aadhaarNumber: '567890123456',
      state: 'Gujarat',
      constituency: 'Ahmedabad East',
      enrolled: true,
      hasVoted: true,
      fraudFlag: false,
      fraudAttemptCount: 0,
      locked: false,
    },
    {
      name: 'Karthik Rao',
      aadhaarNumber: '678901234567',
      state: 'Telangana',
      constituency: 'Hyderabad',
      enrolled: true,
      hasVoted: false,
      fraudFlag: true,
      fraudAttemptCount: 3,
      locked: true,
    },
    {
      name: 'Nisha Patel',
      aadhaarNumber: '789012345678',
      state: 'Rajasthan',
      constituency: 'Jaipur',
      enrolled: true,
      hasVoted: false,
      fraudFlag: false,
      fraudAttemptCount: 0,
      locked: false,
    },
    {
      name: 'Aman Verma',
      aadhaarNumber: '890123456789',
      state: 'Uttar Pradesh',
      constituency: 'Lucknow',
      enrolled: true,
      hasVoted: true,
      fraudFlag: false,
      fraudAttemptCount: 1,
      locked: false,
    },
    {
      name: 'Deepa Menon',
      aadhaarNumber: '901234567890',
      state: 'Kerala',
      constituency: 'Kochi',
      enrolled: false,
      hasVoted: false,
      fraudFlag: false,
      fraudAttemptCount: 0,
      locked: false,
    },
    {
      name: 'Vikram Das',
      aadhaarNumber: '112233445566',
      state: 'West Bengal',
      constituency: 'Kolkata North',
      enrolled: true,
      hasVoted: true,
      fraudFlag: false,
      fraudAttemptCount: 0,
      locked: false,
    },
  ];

  const now = new Date();
  await Promise.all(
    voterSeeds.map((voter, idx) => {
      const fingerprintTemplateHash = voter.enrolled
        ? hashFingerprintSample({ provider: 'seed', credentialId: `seed-fp-${idx + 1}` })
        : '';
      const faceEmbeddingHash = voter.enrolled
        ? hashFaceDescriptor([0.11 + idx / 100, -0.08 + idx / 150, 0.23 + idx / 200, 0.45])
        : '';

      const doc = {
        name: voter.name,
        aadhaarNumber: voter.aadhaarNumber,
        state: voter.state,
        constituency: voter.constituency,
        fingerprintTemplateHash,
        faceEmbeddingHash,
        hasVoted: voter.hasVoted,
        lastVerifiedAt: voter.enrolled ? new Date(now.getTime() - (idx + 1) * 3600 * 1000) : null,
        fraudFlag: voter.fraudFlag,
        fraudAttemptCount: voter.fraudAttemptCount,
        locked: voter.locked,
        biometricManagedByAdmin: voter.enrolled,
        lastBiometricUploadAt: voter.enrolled ? new Date(now.getTime() - (idx + 2) * 7200 * 1000) : null,
      };

      return Voter.updateOne({ aadhaarNumber: voter.aadhaarNumber }, { $setOnInsert: doc }, { upsert: true });
    })
  );

  const voters = await Voter.find({ aadhaarNumber: { $in: voterSeeds.map((v) => v.aadhaarNumber) } })
    .sort({ createdAt: 1 })
    .lean();

  const candidates = await Candidate.find().sort({ createdAt: 1 }).lean();
  const candidateByIndex = (index) => candidates[index % candidates.length];

  for (const [index, voter] of voters.filter((v) => v.hasVoted).entries()) {
    const candidate = candidateByIndex(index);
    const existingVote = await Vote.findOne({ voterId: voter._id }).lean();
    if (!existingVote) {
      await Vote.create({
        voterId: voter._id,
        candidateId: candidate._id,
        state: voter.state,
        constituency: voter.constituency,
      });
      await Candidate.updateOne({ _id: candidate._id }, { $inc: { votes: 1 } });
    }
  }

  const fraudSeeds = [
    {
      aadhaarNumber: '678901234567',
      ip: '192.168.1.41',
      reason: 'Fingerprint mismatch detected on repeated verification attempts',
    },
    {
      aadhaarNumber: '890123456789',
      ip: '192.168.1.55',
      reason: 'Face descriptor similarity below threshold during login',
    },
    {
      aadhaarNumber: '123456789012',
      ip: '10.0.0.12',
      reason: 'Rate-limit triggered after multiple rapid verification requests',
    },
  ];

  for (const seedLog of fraudSeeds) {
    const voter = voters.find((v) => v.aadhaarNumber === seedLog.aadhaarNumber);
    if (!voter) continue;
    const exists = await FraudLog.findOne({
      aadhaarNumber: seedLog.aadhaarNumber,
      ip: seedLog.ip,
      reason: seedLog.reason,
    }).lean();
    if (!exists) {
      await FraudLog.create({
        aadhaarNumber: seedLog.aadhaarNumber,
        voterId: voter._id,
        ip: seedLog.ip,
        reason: seedLog.reason,
      });
    }
  }

  const username = 'admin';
  const password = 'admin123';
  const passwordHash = await bcrypt.hash(password, 12);

  const adminExists = await Admin.findOne({ username }).lean();
  if (!adminExists) {
    await Admin.create({ username, passwordHash });
  }

  // eslint-disable-next-line no-console
  console.log(`Seed complete${reset ? ' (reset mode)' : ' (preserve mode)'} . Demo accounts:`);
  // eslint-disable-next-line no-console
  console.log('- Admin:', { username, password });
  // eslint-disable-next-line no-console
  console.log('- Voters:', voters.map((v) => ({ name: v.name, aadhaarNumber: v.aadhaarNumber })));

  await mongoose.connection.close();
}

seed().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
