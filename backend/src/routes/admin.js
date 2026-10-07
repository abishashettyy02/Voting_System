const express = require('express');
const {
	adminLogin,
	adminStats,
	adminFindVoter,
	adminSetLock,
	adminFraudLogs,
	adminVoteRecords,
	adminListVoters,
	adminUploadVoterBiometrics,
} = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/admin/login', adminLogin);
router.get('/admin/stats', requireAuth, requireRole('admin'), adminStats);
router.get('/admin/fraud/logs', requireAuth, requireRole('admin'), adminFraudLogs);
router.get('/admin/votes', requireAuth, requireRole('admin'), adminVoteRecords);
router.get('/admin/voters', requireAuth, requireRole('admin'), adminListVoters);
router.get('/admin/voter/:aadhaarNumber', requireAuth, requireRole('admin'), adminFindVoter);
router.post('/admin/voter/:aadhaarNumber/lock', requireAuth, requireRole('admin'), adminSetLock);
router.post('/admin/voter/:aadhaarNumber/biometric', requireAuth, requireRole('admin'), adminUploadVoterBiometrics);

module.exports = router;
