const mongoose = require('mongoose');

const BiometricSubmissionSchema = new mongoose.Schema(
  {
    submissionId: { type: String, required: true, unique: true, index: true },
    fingerprintSample: { type: mongoose.Schema.Types.Mixed, required: true },
    faceDescriptor: { type: [Number], default: [] },
    source: { type: String, default: 'voter-portal-prototype' },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'uploaded', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BiometricSubmission', BiometricSubmissionSchema);
