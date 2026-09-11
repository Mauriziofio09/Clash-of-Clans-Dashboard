import type { Request, Response } from 'express';
import { config } from '../config/env.js';
import { cocApiService } from '../services/cocApi.service.js';
import { strategyService } from '../services/strategy.service.js';
import { AppError } from '../utils/AppError.js';
import type {
  ApiEnvelope,
  StrategyAdvice,
  StrategyFocus,
  StrategyNote,
  StrategyRule,
} from '../models/domain.types.js';

const FOCUS_VALUES: readonly string[] = ['krieg', 'farmen', 'alle'];

export const strategyController = {
  /** Bewertete Vorschläge für den konfigurierten Spieler. */
  async advise(req: Request, res: Response<ApiEnvelope<StrategyAdvice>>): Promise<void> {
    const limitRaw = Number(req.query['limit']);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 10) : 3;

    const focusRaw = String(req.query['focus'] ?? 'krieg');
    if (!FOCUS_VALUES.includes(focusRaw)) {
      throw AppError.validation(`"focus" muss einer von: ${FOCUS_VALUES.join(', ')} sein.`);
    }
    const focus = focusRaw as StrategyFocus | 'alle';

    const { data, fetchedAt, cached } = await cocApiService.getPlayer(config.playerTag);
    res.json({ data: strategyService.advise(data, limit, focus), fetchedAt, cached });
  },

  /** Die komplette Wissensdatenbank, unbewertet. */
  listRules(_req: Request, res: Response<ApiEnvelope<readonly StrategyRule[]>>): void {
    res.json({
      data: strategyService.listRules(),
      fetchedAt: new Date().toISOString(),
      cached: false,
    });
  },

  listNotes(_req: Request, res: Response<ApiEnvelope<StrategyNote[]>>): void {
    res.json({ data: strategyService.listNotes(), fetchedAt: new Date().toISOString(), cached: false });
  },

  saveNote(req: Request, res: Response<ApiEnvelope<StrategyNote>>): void {
    const id = req.params['id'];
    if (typeof id !== 'string' || id === '') {
      throw AppError.validation('Strategie-ID fehlt im Pfad.');
    }
    res.json({
      data: strategyService.saveNote(id, req.body),
      fetchedAt: new Date().toISOString(),
      cached: false,
    });
  },
};
