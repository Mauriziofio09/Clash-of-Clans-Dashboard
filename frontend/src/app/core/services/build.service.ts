import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, interval, tap } from 'rxjs';
import type { ApiError } from '../models/api.models';
import type { BoostDefinition } from '../models/boost.models';
import type { BuildEntry, BuildPayload } from '../models/build.models';
import { ApiService } from './api.service';

/** BuildEntry mit im Browser fortlaufend berechneter Restzeit. */
export interface BuildCountdown extends BuildEntry {
  /** Sekunden bis zur Fertigstellung, jede Sekunde neu berechnet. */
  secondsLeft: number;
  /** Fortschritt 0-100, jede Sekunde neu berechnet. */
  livePercent: number;
  /** true, sobald der Countdown abgelaufen ist. */
  ready: boolean;
}

/**
 * Verwaltet den manuell gepflegten Bau-Tracker.
 *
 * Die Restzeit läuft rein im Browser weiter (Sekundentakt auf Basis von
 * finishesAt), damit der Countdown flüssig ist, ohne das Backend zu belasten.
 */
@Injectable({ providedIn: 'root' })
export class BuildService {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly entries = signal<BuildEntry[]>([]);
  private readonly now = signal<number>(Date.now());

  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  /** Ids, für die die Fertig-Meldung in dieser Sitzung schon gezeigt wurde. */
  private readonly notified = new Set<number>();

  /** Alle bekannten Beschleuniger, einmal vom Backend geholt. */
  readonly boostCatalog = signal<BoostDefinition[]>([]);

  /** Einträge mit laufendem Countdown, unerledigte zuerst. */
  readonly builds = computed<BuildCountdown[]>(() => {
    const nowMs = this.now();
    return this.entries()
      .map((entry) => {
        const endMs = Date.parse(entry.finishesAt);
        const startMs = Date.parse(entry.startedAt);
        const secondsLeft = Math.max(0, Math.round((endMs - nowMs) / 1000));
        const total = Math.max(1, endMs - startMs);
        const livePercent = Math.min(100, Math.max(0, Math.round(((nowMs - startMs) / total) * 100)));
        return { ...entry, secondsLeft, livePercent, ready: secondsLeft === 0 };
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.secondsLeft - b.secondsLeft;
      });
  });

  readonly active = computed(() => this.builds().filter((b) => !b.completed));
  readonly running = computed(() => this.active().filter((b) => !b.ready));
  /** Fertige, aber noch nicht abgehakte Upgrades - Grundlage der UI-Benachrichtigung. */
  readonly finishedUnacknowledged = computed(() =>
    this.active().filter((b) => b.ready && !b.acknowledged),
  );
  readonly completed = computed(() => this.builds().filter((b) => b.completed));

  /** Nächstes fertig werdendes Upgrade - für die Kachel auf dem Dashboard. */
  readonly next = computed<BuildCountdown | null>(() => this.running()[0] ?? null);

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
    this.reload();
    this.loadBoostCatalog();
  }

  reload(): void {
    this.loading.set(true);
    this.api.get<BuildEntry[]>('/builds').subscribe({
      next: (data) => {
        this.entries.set(data);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.error.set(err);
        this.loading.set(false);
      },
    });
  }

  create(payload: BuildPayload): Observable<BuildEntry> {
    return this.api.post<BuildEntry>('/builds', payload).pipe(tap(() => this.reload()));
  }

  update(id: number, payload: BuildPayload): Observable<BuildEntry> {
    return this.api.put<BuildEntry>(`/builds/${id}`, payload).pipe(tap(() => this.reload()));
  }

  /** Hakt ein Upgrade als erledigt ab (oder macht das rückgängig). */
  setCompleted(id: number, completed: boolean): Observable<BuildEntry> {
    return this.api
      .patch<BuildEntry>(`/builds/${id}`, { completed, acknowledged: true })
      .pipe(tap(() => this.reload()));
  }

  /** Quittiert die Fertig-Meldung, ohne den Eintrag abzuschließen. */
  acknowledge(id: number): Observable<BuildEntry> {
    return this.api.patch<BuildEntry>(`/builds/${id}`, { acknowledged: true }).pipe(tap(() => this.reload()));
  }

  remove(id: number): Observable<void> {
    return this.api.delete(`/builds/${id}`).pipe(tap(() => this.reload()));
  }

  removeCompleted(): Observable<{ deleted: number }> {
    return this.api
      .deleteFor<{ deleted: number }>('/builds/completed')
      .pipe(tap(() => this.reload()));
  }

  /** Trägt einen angewandten Beschleuniger nach. */
  applyBoost(
    buildId: number,
    boostId: string,
    options: { appliedAt?: string; amountSeconds?: number } = {},
  ): Observable<BuildEntry> {
    return this.api
      .post<BuildEntry>(`/builds/${buildId}/boosts`, { boostId, ...options })
      .pipe(tap(() => this.reload()));
  }

  /** Nimmt einen angewandten Beschleuniger wieder zurück. */
  removeBoost(buildId: number, appliedBoostId: number): Observable<BuildEntry> {
    return this.api
      .delete(`/builds/${buildId}/boosts/${appliedBoostId}`)
      .pipe(tap(() => this.reload())) as unknown as Observable<BuildEntry>;
  }

  /** Katalog aller Beschleuniger, einmalig geladen. */
  loadBoostCatalog(): void {
    if (this.boostCatalog().length > 0) return;
    this.api.get<BoostDefinition[]>('/boosts').subscribe({
      next: (data) => this.boostCatalog.set(data),
      error: () => this.boostCatalog.set([]),
    });
  }

  /** Merkt sich, dass für eine Id bereits eine Meldung angezeigt wurde. */
  markNotified(id: number): boolean {
    if (this.notified.has(id)) return false;
    this.notified.add(id);
    return true;
  }
}
