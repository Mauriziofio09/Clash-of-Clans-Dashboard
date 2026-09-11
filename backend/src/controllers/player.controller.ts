import type { Request, Response } from 'express';
import { config } from '../config/env.js';
import { cocApiService } from '../services/cocApi.service.js';
import { getHistory, recordSnapshot, toPlayerOverview } from '../services/player.service.js';
import { buildTroopsOverview } from '../services/troops.service.js';
import type { ApiEnvelope, PlayerOverview, TroopsOverview } from '../models/domain.types.js';
import type { TrophyPoint } from '../services/player.service.js';

export const playerController = {
  async getPlayer(_req: Request, res: Response<ApiEnvelope<PlayerOverview>>): Promise<void> {
    const { data, fetchedAt, cached } = await cocApiService.getPlayer(config.playerTag);
    if (!cached) recordSnapshot(data);
    res.json({ data: toPlayerOverview(data), fetchedAt, cached });
  },

  async getTroops(_req: Request, res: Response<ApiEnvelope<TroopsOverview>>): Promise<void> {
    const { data, fetchedAt, cached } = await cocApiService.getPlayer(config.playerTag);
    res.json({ data: buildTroopsOverview(data), fetchedAt, cached });
  },

  async getHistory(req: Request, res: Response<ApiEnvelope<TrophyPoint[]>>): Promise<void> {
    const limitRaw = Number(req.query['limit']);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 168;
    res.json({ data: getHistory(limit), fetchedAt: new Date().toISOString(), cached: false });
  },
};
