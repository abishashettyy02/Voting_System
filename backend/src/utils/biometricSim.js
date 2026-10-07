const { sha256 } = require('./crypto');

function getBiometricSalt() {
  return process.env.BIOMETRIC_SALT || 'demo-biometric-salt';
}

function fingerprintHashFor(aadhaarNumber) {
  return sha256(`${aadhaarNumber}:${getBiometricSalt()}:fingerprint`);
}

function faceHashFor(aadhaarNumber) {
  return sha256(`${aadhaarNumber}:${getBiometricSalt()}:face`);
}

module.exports = {
  fingerprintHashFor,
  faceHashFor,
};
