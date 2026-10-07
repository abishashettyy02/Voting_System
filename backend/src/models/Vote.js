const mongoose = require('mongoose');

const VoteSchema = new mongoose.Schema(
  {
    voterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voter', required: true, unique: true, index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    state: { type: String, required: true, index: true },
    constituency: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vote', VoteSchema);
