import type { Request, Response } from 'express';
import { config } from '../config/env.js';
import { cocApiService } from '../services/cocApi.service.js';
import { emptyWarStatus, toClanOverview, toWarStatus } from '../services/player.service.js';
import { AppError } from '../utils/AppError.js';
import type { ApiEnvelope, ClanOverview, WarStatus } from '../models/domain.types.js';

/**
 * Ermittelt den zu verwendenden Clan-Tag: bevorzugt aus der .env, sonst aus dem
 * Clan des konfigurierten Spielers.
 */
async function resolveClanTag(): Promise<string> {
  if (config.clanTag) return config.clanTag;

  const { data: player } = await cocApiService.getPlayer(config.playerTag);
  if (!player.clan) {
    throw new AppError(
      'NOT_FOUND',
      404,
      `${player.name} ist aktuell in keinem Clan.`,
      'Alternativ COC_CLAN_TAG in backend/.env setzen, um einen festen Clan anzuzeigen.',
    );
  }
  return player.clan.tag;
}

export const clanController = {
  async getClan(_req: Request, res: Response<ApiEnvelope<ClanOverview>>): Promise<void> {
    const tag = await resolveClanTag();
    const { data, fetchedAt, cached } = await cocApiService.getClan(tag);
    res.json({ data: toClanOverview(data, config.playerTag), fetchedAt, cached });
  },

  async getWar(_req: Request, res: Response<ApiEnvelope<WarStatus>>): Promise<void> {
    const tag = await resolveClanTag();
    try {
      const { data, fetchedAt, cached } = await cocApiService.getCurrentWar(tag);
      res.json({ data: toWarStatus(data, config.playerTag), fetchedAt, cached });
    } catch (error) {
      // Ein privates Kriegslog beantwortet die API ebenfalls mit 403. Um das von
      // einem echten Key-/IP-Problem zu unterscheiden, wird ein harmloser
      // Clan-Abruf als Gegenprobe gemacht: klappt der, liegt es am Kriegslog.
      if (error instanceof AppError && error.status === 403) {
        await cocApiService.getClan(tag);
        res.json({
          data: emptyWarStatus(true),
          fetchedAt: new Date().toISOString(),
          cached: false,
        });
        return;
      }
      throw error;
    }
  },
};
