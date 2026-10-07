const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { listCandidates, castVote } = require('../controllers/voteController');

const router = express.Router();

router.get('/candidates', requireAuth, requireRole('voter'), listCandidates);
router.post('/vote', requireAuth, requireRole('voter'), castVote);

module.exports = router;
