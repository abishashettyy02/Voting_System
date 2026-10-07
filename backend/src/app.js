const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { verifyRateLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const voteRoutes = require('./routes/vote');
const adminRoutes = require('./routes/admin');
const biometricRoutes = require('./routes/biometric');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '200kb' }));
  app.use(mongoSanitize());
  app.use(hpp());

  const corsOriginsRaw = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const allowedOrigins = corsOriginsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow same-origin / server-to-server / tools without an Origin header.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS not allowed'));
      },
      credentials: true,
    })
  );

  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/api/v1/health', (req, res) => {
    res.json({ ok: true, name: 'secure-voting-backend' });
  });

  app.use('/api/v1', authRoutes);
  app.use('/api/v1', voteRoutes);
  app.use('/api/v1', adminRoutes);
  app.use('/api/v1', biometricRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
