import { createApp } from './app';

const host = process.env.GENERATOR_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.GENERATOR_PORT ?? '4310', 10);
const app = createApp({ logger: true });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
