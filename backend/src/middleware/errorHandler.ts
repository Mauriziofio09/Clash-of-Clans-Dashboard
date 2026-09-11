import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import type { ApiErrorBody } from '../models/domain.types.js';

/** Einheitliche JSON-Fehlerantwort. Das Frontend wertet `error.code` aus. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.message, ...(err.hint ? { hint: err.hint } : {}) },
    };
    res.status(err.status).json(body);
    return;
  }

  console.error('[unerwarteter Fehler]', err);
  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL',
      message: 'Im Backend ist ein unerwarteter Fehler aufgetreten.',
      hint: err instanceof Error ? err.message : undefined,
    },
  };
  res.status(500).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: `Kein Endpunkt unter ${req.method} ${req.originalUrl}.` },
  };
  res.status(404).json(body);
}
