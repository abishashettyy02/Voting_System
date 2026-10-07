require('dotenv').config();

const mongoose = require('mongoose');

const { connectDb } = require('../src/config/db');
const Voter = require('../src/models/Voter');
const { hashFingerprintSample, hashFaceDescriptor } = require('../src/utils/biometricHash');

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Aarav',
  'Vivaan',
  'Aditya',
  'Vihaan',
  'Arjun',
  'Sai',
  'Reyansh',
  'Ishaan',
  'Ananya',
  'Diya',
  'Isha',
  'Aditi',
  'Meera',
  'Priya',
  'Nisha',
  'Kavya',
  'Neha',
  'Riya',
];

const LAST_NAMES = [
  'Sharma',
  'Singh',
  'Patel',
  'Gupta',
  'Kumar',
  'Nair',
  'Iyer',
  'Verma',
  'Reddy',
  'Mehta',
  'Chatterjee',
  'Das',
  'Jain',
  'Bose',
  'Rao',
];

const STATES = [
  'Maharashtra',
  'Karnataka',
  'Tamil Nadu',
  'Delhi',
  'Uttar Pradesh',
  'Gujarat',
  'West Bengal',
  'Rajasthan',
  'Kerala',
  'Telangana',
];

const CONSTITUENCIES = [
  'North',
  'South',
  'East',
  'West',
  'Central',
  'Urban',
  'Rural',
];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function randomAadhaar(rng, used) {
  while (true) {
    let s = '';
    for (let i = 0; i < 12; i += 1) s += Math.floor(rng() * 10);
    if (s[0] === '0') continue;
    if (!used.has(s)) {
      used.add(s);
      return s;
    }
  }
}

function randomFaceDescriptor(rng) {
  // 64-length vector for demo; will be quantized+hashed.
  const v = [];
  for (let i = 0; i < 64; i += 1) v.push((rng() - 0.5) * 2);
  return v;
}

async function generate({ count = 10000, seed = 42 } = {}) {
  await connectDb(process.env.MONGO_URI);

  const rng = mulberry32(seed);
  const usedAadhaar = new Set();

  const bulk = [];
  for (let i = 0; i < count; i += 1) {
    const first = pick(rng, FIRST_NAMES);
    const last = pick(rng, LAST_NAMES);
    const name = `${first} ${last}`;
    const aadhaarNumber = randomAadhaar(rng, usedAadhaar);
    const state = pick(rng, STATES);
    const constituency = `${state} ${pick(rng, CONSTITUENCIES)}`;

    bulk.push({
      name,
      aadhaarNumber,
      state,
      constituency,
      fingerprintTemplateHash: '',
      faceEmbeddingHash: '',
      hasVoted: false,
      lastVerifiedAt: null,
      fraudFlag: false,
      fraudAttemptCount: 0,
      locked: false,
    });

    if (bulk.length === 1000) {
      // eslint-disable-next-line no-await-in-loop
      await Voter.insertMany(bulk, { ordered: false });
      bulk.length = 0;
      // eslint-disable-next-line no-console
      console.log(`Inserted ${i + 1}/${count}`);
    }
  }

  if (bulk.length) {
    await Voter.insertMany(bulk, { ordered: false });
    // eslint-disable-next-line no-console
    console.log(`Inserted ${count}/${count}`);
  }

  await mongoose.connection.close();
}

const count = Number(process.argv[2] || 10000);
const seed = Number(process.argv[3] || 42);

generate({ count, seed }).catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Generator failed:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
