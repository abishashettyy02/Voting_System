const mongoose = require('mongoose');

const CandidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    party: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    photoKey: { type: String, required: true },
    votes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Candidate', CandidateSchema);
