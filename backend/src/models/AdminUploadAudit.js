const mongoose = require('mongoose');

const AdminUploadAuditSchema = new mongoose.Schema(
  {
    adminId: { type: String, required: true, index: true },
    adminUsername: { type: String, required: true, index: true },
    aadhaarNumber: { type: String, required: true, index: true },
    voterId: { type: String, required: true, index: true },
    action: { type: String, required: true, default: 'UPLOAD_BIOMETRIC' },
    payloadHash: { type: String, required: true },
    prevHash: { type: String, default: '' },
    blockHash: { type: String, required: true, unique: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminUploadAudit', AdminUploadAuditSchema);
