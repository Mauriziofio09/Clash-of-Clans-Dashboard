import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Leitet abgelehnte Promises aus async-Handlern an die Express-Fehlerkette weiter. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
