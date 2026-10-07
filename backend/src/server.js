require('dotenv').config();

const fastifyFactory = require('fastify');
const { createApp } = require('./app');
const { connectDb } = require('./config/db');

async function start() {
  await connectDb(process.env.MONGO_URI);

  const expressApp = createApp();
  const fastify = fastifyFactory({ logger: process.env.NODE_ENV !== 'test' });

  await fastify.register(require('@fastify/express'));
  fastify.use(expressApp);

  const port = Number(process.env.PORT || 5000);
  const host = process.env.HOST || '0.0.0.0';

  await fastify.listen({ port, host });

  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
