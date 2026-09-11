import type { Request, Response } from 'express';
import { boostService } from '../services/boost.service.js';
import { buildService } from '../services/build.service.js';
import { AppError } from '../utils/AppError.js';
import type { ApiEnvelope, BoostDefinition, BuildEntryView } from '../models/domain.types.js';

function parseId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.validation(`"${raw}" ist keine gültige Bau-ID.`);
  }
  return id;
}

function envelope<T>(data: T): ApiEnvelope<T> {
  return { data, fetchedAt: new Date().toISOString(), cached: false };
}

export const buildController = {
  list(_req: Request, res: Response<ApiEnvelope<BuildEntryView[]>>): void {
    res.json(envelope(buildService.list()));
  },

  create(req: Request, res: Response<ApiEnvelope<BuildEntryView>>): void {
    res.status(201).json(envelope(buildService.create(req.body)));
  },

  update(req: Request, res: Response<ApiEnvelope<BuildEntryView>>): void {
    res.json(envelope(buildService.update(parseId(req.params['id']), req.body)));
  },

  patchFlags(req: Request, res: Response<ApiEnvelope<BuildEntryView>>): void {
    const body = (req.body ?? {}) as { completed?: unknown; acknowledged?: unknown };
    res.json(envelope(buildService.patchFlags(parseId(req.params['id']), body)));
  },

  remove(req: Request, res: Response): void {
    buildService.remove(parseId(req.params['id']));
    res.status(204).send();
  },

  removeCompleted(_req: Request, res: Response<ApiEnvelope<{ deleted: number }>>): void {
    res.json(envelope({ deleted: buildService.removeCompleted() }));
  },

  /** Alle bekannten Beschleuniger aus der Wissensdatenbank. */
  listBoosts(_req: Request, res: Response<ApiEnvelope<readonly BoostDefinition[]>>): void {
    res.json(envelope(boostService.list()));
  },

  addBoost(req: Request, res: Response<ApiEnvelope<BuildEntryView>>): void {
    res.status(201).json(envelope(buildService.addBoost(parseId(req.params['id']), req.body)));
  },

  removeBoost(req: Request, res: Response<ApiEnvelope<BuildEntryView>>): void {
    const buildId = parseId(req.params['id']);
    const boostRowId = parseId(req.params['boostId']);
    res.json(envelope(buildService.removeBoost(buildId, boostRowId)));
  },
};
