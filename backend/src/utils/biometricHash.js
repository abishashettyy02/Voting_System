const { sha256 } = require('./crypto');

function normalizeVector(vec) {
  if (!Array.isArray(vec)) return [];
  const cleaned = vec
    .map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0))
    .slice(0, 128);
  return cleaned;
}

function cosineSimilarity(vecA, vecB) {
  const a = normalizeVector(vecA);
  const b = normalizeVector(vecB);
  const len = Math.min(a.length, b.length);
  if (!len) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function hashFingerprintSample(sample) {
  // For WebAuthn/system biometric scans, hash only stable credential identity fields.
  if (sample && typeof sample === 'object' && sample.provider === 'platform-webauthn') {
    const credentialId = typeof sample.credentialId === 'string' ? sample.credentialId : '';
    return sha256(`fp:platform-webauthn:${credentialId}`);
  }

  // sample can be any string/array representing a demo fingerprint scan.
  return sha256(`fp:${typeof sample === 'string' ? sample : JSON.stringify(sample)}`);
}

function hashFaceDescriptor(descriptor) {
  const normalized = normalizeVector(descriptor);
  // Quantize to reduce tiny float diffs, then hash.
  const quantized = normalized.map((n) => Math.round(n * 1000));
  return sha256(`face:${JSON.stringify(quantized)}`);
}

function hammingSimilarity(hexA, hexB) {
  if (!hexA || !hexB || typeof hexA !== 'string' || typeof hexB !== 'string') return 0;
  const a = Buffer.from(hexA, 'hex');
  const b = Buffer.from(hexB, 'hex');
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let sameBits = 0;
  let totalBits = len * 8;

  for (let i = 0; i < len; i += 1) {
    const x = a[i] ^ b[i];
    // Count differing bits
    let diff = x;
    let diffBits = 0;
    while (diff) {
      diff &= diff - 1;
      diffBits += 1;
    }
    sameBits += 8 - diffBits;
  }

  return sameBits / totalBits;
}

module.exports = {
  normalizeVector,
  cosineSimilarity,
  hashFingerprintSample,
  hashFaceDescriptor,
  hammingSimilarity,
};
