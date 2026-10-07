const mongoose = require('mongoose');

const VoterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    aadhaarNumber: {
      type: String,
      required: true,
      unique: true,
      match: [/^\d{12}$/, 'Aadhaar number must be 12 digits'],
      index: true,
    },
    // Demo biometric templates (hashed). These are NOT real biometrics.
    fingerprintTemplateHash: { type: String, default: '' },
    faceEmbeddingHash: { type: String, default: '' },
    faceEmbeddingVector: { type: [Number], default: [] },
    biometricManagedByAdmin: { type: Boolean, default: false, index: true },
    lastBiometricUploadAt: { type: Date, default: null },

    // Optional legacy fields (kept for compatibility with older seeds)
    fingerprintHash: { type: String, default: '' },
    faceDataHash: { type: String, default: '' },

    state: { type: String, default: 'Unknown', trim: true, index: true },
    constituency: { type: String, default: 'Unknown', trim: true, index: true },

    hasVoted: { type: Boolean, default: false },
    lastVerifiedAt: { type: Date, default: null },

    fraudFlag: { type: Boolean, default: false, index: true },
    fraudAttemptCount: { type: Number, default: 0 },
    locked: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Voter', VoterSchema);
