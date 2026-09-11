import cors from 'cors';
import express, { type Express } from 'express';
import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? [...config.corsOrigins] : true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.use('/api', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
