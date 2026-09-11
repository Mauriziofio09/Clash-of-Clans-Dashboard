import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import type { ApiError } from '../models/api.models';
import type {
  BuildingInventoryEntry,
  InventoryLevelCount,
  PlannerAssumptions,
  PlannerResult,
  PlannerTarget,
} from '../models/planner.models';
import { ApiService } from './api.service';

/**
 * Lädt den Upgrade-Plan und pflegt den manuell erfassten Gebäudebestand.
 *
 * Der Plan kommt komplett gerechnet aus dem Backend, damit Annahmen und
 * Zeitmodell nur an einer Stelle liegen.
 */
@Injectable({ providedIn: 'root' })
export class PlannerService {
  private readonly api = inject(ApiService);

  readonly plan = signal<PlannerResult | null>(null);
  readonly inventory = signal<BuildingInventoryEntry[]>([]);
  /** Auswahlliste für den Bau-Tracker: alles, was als Nächstes dran sein kann. */
  readonly targets = signal<PlannerTarget[]>([]);
  readonly loading = signal(false);
  readonly savingInventory = signal(false);
  readonly error = signal<ApiError | null>(null);

  load(): void {
    this.loading.set(true);
    this.api.get<PlannerResult>('/planner').subscribe({
      next: (data) => {
        this.plan.set(data);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.error.set(err);
        this.loading.set(false);
      },
    });
  }

  /** Holt die Vorlagen für den Bau-Tracker. */
  loadTargets(): void {
    this.api.get<PlannerTarget[]>('/planner/targets').subscribe({
      next: (data) => this.targets.set(data),
      error: () => this.targets.set([]),
    });
  }

  loadInventory(): void {
    this.api.get<BuildingInventoryEntry[]>('/planner/inventory').subscribe({
      next: (data) => this.inventory.set(data),
      error: (err: ApiError) => this.error.set(err),
    });
  }

  /** Speichert den Bestand eines Gebäudetyps und lädt den Plan neu. */
  saveInventory(buildingId: string, levels: InventoryLevelCount[]): Observable<BuildingInventoryEntry[]> {
    this.savingInventory.set(true);
    return this.api
      .put<BuildingInventoryEntry[]>(`/planner/inventory/${buildingId}`, { levels })
      .pipe(
        tap({
          next: (data) => {
            this.inventory.set(data);
            this.savingInventory.set(false);
            this.load();
          },
          error: () => this.savingInventory.set(false),
        }),
      );
  }

  resetInventory(): Observable<BuildingInventoryEntry[]> {
    return this.api.deleteFor<BuildingInventoryEntry[]>('/planner/inventory').pipe(
      tap((data) => {
        this.inventory.set(data);
        this.load();
      }),
    );
  }

  saveAssumptions(patch: Partial<PlannerAssumptions>): Observable<PlannerAssumptions> {
    return this.api
      .put<PlannerAssumptions>('/planner/assumptions', patch)
      .pipe(tap(() => this.load()));
  }

  /** Korrigiert eine Aufwertungszeit. 0 Sekunden löscht die Korrektur. */
  saveTimeOverride(
    scope: 'building' | 'research' | 'hero',
    key: string,
    level: number,
    seconds: number,
  ): Observable<unknown> {
    return this.api
      .put('/planner/times', { scope, key, level, seconds })
      .pipe(tap(() => this.load()));
  }
}
