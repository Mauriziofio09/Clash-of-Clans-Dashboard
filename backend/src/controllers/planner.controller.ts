import type { Request, Response } from 'express';
import { config } from '../config/env.js';
import { cocApiService } from '../services/cocApi.service.js';
import { plannerService } from '../services/planner.service.js';
import { upgradeTimeService } from '../services/upgradeTime.service.js';
import { AppError } from '../utils/AppError.js';
import type {
  ApiEnvelope,
  BuildingInventoryEntry,
  PlannerAssumptions,
  PlannerResult,
  PlannerTarget,
  TimeOverride,
} from '../models/domain.types.js';

function envelope<T>(data: T): ApiEnvelope<T> {
  return { data, fetchedAt: new Date().toISOString(), cached: false };
}

function requireId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw AppError.validation('Gebäude-Id fehlt im Pfad.');
  }
  return raw;
}

export const plannerController = {
  /** Der komplette Plan: Vorschläge, Restaufwand, Fertigdatum, Booster-Wirkung. */
  async plan(_req: Request, res: Response<ApiEnvelope<PlannerResult>>): Promise<void> {
    const { data, fetchedAt, cached } = await cocApiService.getPlayer(config.playerTag);
    res.json({ data: plannerService.compute(data), fetchedAt, cached });
  },

  /** Gebäudebestand, aufgelöst fürs aktuelle Rathaus-Level. */
  async inventory(_req: Request, res: Response<ApiEnvelope<BuildingInventoryEntry[]>>): Promise<void> {
    const { data, fetchedAt, cached } = await cocApiService.getPlayer(config.playerTag);
    res.json({ data: plannerService.inventory(data.townHallLevel), fetchedAt, cached });
  },

  /** Auswahlliste für den Bau-Tracker: alles, was als Nächstes dran sein kann. */
  async targets(_req: Request, res: Response<ApiEnvelope<PlannerTarget[]>>): Promise<void> {
    const { data, fetchedAt, cached } = await cocApiService.getPlayer(config.playerTag);
    res.json({ data: plannerService.targets(data), fetchedAt, cached });
  },

  async saveInventory(req: Request, res: Response<ApiEnvelope<BuildingInventoryEntry[]>>): Promise<void> {
    plannerService.saveInventory(requireId(req.params['buildingId']), req.body);
    const { data, fetchedAt, cached } = await cocApiService.getPlayer(config.playerTag);
    res.json({ data: plannerService.inventory(data.townHallLevel), fetchedAt, cached });
  },

  async resetInventory(_req: Request, res: Response<ApiEnvelope<BuildingInventoryEntry[]>>): Promise<void> {
    plannerService.resetInventory();
    const { data, fetchedAt, cached } = await cocApiService.getPlayer(config.playerTag);
    res.json({ data: plannerService.inventory(data.townHallLevel), fetchedAt, cached });
  },

  assumptions(_req: Request, res: Response<ApiEnvelope<PlannerAssumptions>>): void {
    res.json(envelope(plannerService.assumptions()));
  },

  saveAssumptions(req: Request, res: Response<ApiEnvelope<PlannerAssumptions>>): void {
    res.json(envelope(plannerService.saveAssumptions(req.body)));
  },

  listTimeOverrides(_req: Request, res: Response<ApiEnvelope<TimeOverride[]>>): void {
    res.json(envelope(upgradeTimeService.list()));
  },

  saveTimeOverride(req: Request, res: Response<ApiEnvelope<TimeOverride | null>>): void {
    res.json(envelope(upgradeTimeService.save(req.body)));
  },
};
