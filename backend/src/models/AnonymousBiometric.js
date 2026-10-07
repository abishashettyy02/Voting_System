const mongoose = require('mongoose');

const AnonymousBiometricSchema = new mongoose.Schema(
  {
    anonId: { type: String, required: true, unique: true, index: true },
    aadhaarNumber: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      match: [/^\d{12}$/, 'Aadhaar number must be 12 digits'],
      index: true,
    },
    voterId: { type: String, required: true, unique: true, sparse: true, index: true },
    faceEmbeddingHash: { type: String, default: '' },
    faceEmbeddingVector: { type: [Number], default: [] },
    fingerprintTemplateHash: { type: String, required: true },
    canVote: { type: Boolean, default: true, index: true },
    hasVoted: { type: Boolean, default: false, index: true },
    matchedCount: { type: Number, default: 0 },
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AnonymousBiometricSchema.index({ faceEmbeddingHash: 1 }, { unique: true, sparse: true });
AnonymousBiometricSchema.index({ fingerprintTemplateHash: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('AnonymousBiometric', AnonymousBiometricSchema);
