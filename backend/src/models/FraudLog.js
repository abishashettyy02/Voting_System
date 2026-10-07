const mongoose = require('mongoose');

const FraudLogSchema = new mongoose.Schema(
  {
    aadhaarNumber: { type: String, required: true, match: [/^\d{12}$/, 'Aadhaar must be 12 digits'], index: true },
    voterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voter', default: null },
    ip: { type: String, required: true },
    reason: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('FraudLog', FraudLogSchema);
