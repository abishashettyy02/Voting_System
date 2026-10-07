const express = require('express');
const { verifyVoter, verifyVoterByBiometrics } = require('../controllers/authController');
const { verifyRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/verify', verifyRateLimiter, verifyVoter);
router.post('/verify/biometric', verifyRateLimiter, verifyVoterByBiometrics);

module.exports = router;
