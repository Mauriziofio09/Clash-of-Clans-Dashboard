/** Maschinenlesbare Fehlercodes, die das Frontend zur Anzeige auswertet. */
export type AppErrorCode =
  | 'CONFIG_MISSING'
  | 'INVALID_API_KEY'
  | 'IP_NOT_WHITELISTED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'COC_MAINTENANCE'
  | 'COC_TIMEOUT'
  | 'COC_UNAVAILABLE'
  | 'VALIDATION'
  | 'INTERNAL';

/** Fehler mit HTTP-Status, Code und einer Klartext-Meldung für das UI. */
export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly status: number,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static validation(message: string): AppError {
    return new AppError('VALIDATION', 400, message);
  }

  static notFound(message: string): AppError {
    return new AppError('NOT_FOUND', 404, message);
  }
}
