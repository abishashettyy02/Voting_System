const express = require('express');
const {
  enrollAnonymousBiometric,
  checkAnonymousEligibility,
  submitPrototypeBiometric,
  listPrototypeSubmissions,
} = require('../controllers/biometricController');
const { verifyRateLimiter } = require('../middleware/rateLimit');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/biometric/anonymous/enroll', verifyRateLimiter, enrollAnonymousBiometric);
router.post('/biometric/anonymous/check', verifyRateLimiter, checkAnonymousEligibility);
router.post('/biometric/prototype/submit', verifyRateLimiter, submitPrototypeBiometric);
router.get('/admin/biometric/submissions', requireAuth, requireRole('admin'), listPrototypeSubmissions);

module.exports = router;
