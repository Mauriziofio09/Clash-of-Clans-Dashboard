import type { Request, Response } from 'express';
import { config } from '../config/env.js';
import { cocApiService } from '../services/cocApi.service.js';
import { AppError } from '../utils/AppError.js';
import type { ApiEnvelope, DashboardConfigInfo, HealthInfo } from '../models/domain.types.js';

export const metaController = {
  /** Nicht-geheime Konfiguration, damit das Frontend z. B. das Refresh-Intervall kennt. */
  getConfig(_req: Request, res: Response<ApiEnvelope<DashboardConfigInfo>>): void {
    res.json({
      data: {
        playerTag: config.playerTag,
        clanTag: config.clanTag || null,
        refreshIntervalSeconds: config.refreshIntervalSeconds,
        cacheTtlSeconds: config.cacheTtlSeconds,
      },
      fetchedAt: new Date().toISOString(),
      cached: false,
    });
  },

  /** Prüft aktiv, ob die CoC API mit dem konfigurierten Key erreichbar ist. */
  async health(_req: Request, res: Response<ApiEnvelope<HealthInfo>>): Promise<void> {
    try {
      await cocApiService.getPlayer(config.playerTag);
      res.json({
        data: {
          status: 'ok',
          cocApiReachable: true,
          message: 'Verbindung zur Clash-of-Clans-API steht.',
          serverTime: new Date().toISOString(),
        },
        fetchedAt: new Date().toISOString(),
        cached: false,
      });
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Unbekannter Fehler.';
      res.status(200).json({
        data: {
          status: 'degraded',
          cocApiReachable: false,
          message,
          serverTime: new Date().toISOString(),
        },
        fetchedAt: new Date().toISOString(),
        cached: false,
      });
    }
  },

  /** Leert den Kurzzeit-Cache, damit ein manueller Refresh echte Daten holt. */
  clearCache(_req: Request, res: Response): void {
    cocApiService.clearCache();
    res.json({ data: { cleared: true }, fetchedAt: new Date().toISOString(), cached: false });
  },
};
