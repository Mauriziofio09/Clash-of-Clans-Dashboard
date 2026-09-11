import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  BehaviorSubject,
  EMPTY,
  Observable,
  catchError,
  combineLatest,
  distinctUntilChanged,
  map,
  of,
  scan,
  shareReplay,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import type { ApiError, Resource } from '../models/api.models';
import { idleResource } from '../models/api.models';
import type { ClanOverview, WarStatus } from '../models/clan.models';
import type { PlayerOverview, TroopsOverview, TrophyPoint } from '../models/player.models';
import type { DashboardConfigInfo } from '../models/strategy.models';
import { ApiService } from './api.service';

/**
 * Zentraler Datenspeicher für alle Live-Daten aus der Clash-of-Clans-API.
 *
 * Jede Ressource hängt am selben Reload-Trigger. Der Trigger wird entweder
 * manuell (Button) oder vom Auto-Refresh-Timer ausgelöst. Während eines Reloads
 * bleiben die zuletzt geladenen Daten sichtbar, damit die Oberfläche nicht
 * flackert - nur das Ladeflag wechselt.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly reload$ = new BehaviorSubject<number>(0);

  /** Auto-Refresh-Intervall in Sekunden, im UI einstellbar. */
  readonly refreshIntervalSeconds = signal<number>(environment.defaultRefreshSeconds);
  readonly autoRefreshEnabled = signal<boolean>(true);

  /** Zeitpunkt des letzten Reload-Auslösers - Basis für den Countdown im Header. */
  readonly lastTriggeredAt = signal<number>(Date.now());

  readonly player$ = this.resource<PlayerOverview>('/player');
  readonly troops$ = this.resource<TroopsOverview>('/troops');
  readonly war$ = this.resource<WarStatus>('/war');
  readonly clan$ = this.resource<ClanOverview>('/clan');
  readonly history$ = this.resource<TrophyPoint[]>('/history?limit=168');

  readonly player = toSignal(this.player$, { initialValue: idleResource<PlayerOverview>() });
  readonly troops = toSignal(this.troops$, { initialValue: idleResource<TroopsOverview>() });
  readonly war = toSignal(this.war$, { initialValue: idleResource<WarStatus>() });
  readonly clan = toSignal(this.clan$, { initialValue: idleResource<ClanOverview>() });
  readonly history = toSignal(this.history$, { initialValue: idleResource<TrophyPoint[]>() });

  /** true, solange irgendeine Ressource lädt. */
  readonly anyLoading = toSignal(
    combineLatest([this.player$, this.troops$, this.war$, this.clan$]).pipe(
      map((resources) => resources.some((r) => r.loading)),
      distinctUntilChanged(),
    ),
    { initialValue: false },
  );

  /**
   * Der erste blockierende Fehler. Fehler einzelner Bereiche (z. B. privater
   * Clan) werden dort angezeigt, hier landet nur das, was alles lahmlegt.
   */
  readonly globalError = toSignal<ApiError | null>(
    this.player$.pipe(map((resource) => resource.error)),
    { initialValue: null },
  );

  constructor() {
    // Konfiguriertes Intervall vom Backend übernehmen, sofern erreichbar.
    this.api
      .get<DashboardConfigInfo>('/config')
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((cfg) => this.refreshIntervalSeconds.set(cfg.refreshIntervalSeconds));

    // Auto-Refresh: Timer wird bei jeder Änderung von Intervall/Schalter neu aufgebaut.
    combineLatest([
      toObservable(this.autoRefreshEnabled),
      toObservable(this.refreshIntervalSeconds),
    ])
      .pipe(
        switchMap(([enabled, seconds]) =>
          enabled && seconds > 0 ? timer(seconds * 1000, seconds * 1000) : EMPTY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.refresh());
  }

  /** Lädt alle Live-Ressourcen neu. */
  refresh(): void {
    this.lastTriggeredAt.set(Date.now());
    this.reload$.next(this.reload$.value + 1);
  }

  /** Wie refresh(), leert aber vorher den Server-Cache - für den Button im Header. */
  forceRefresh(): void {
    this.api.post('/cache/clear').pipe(catchError(() => of(null))).subscribe(() => this.refresh());
  }

  private resource<T>(path: string): Observable<Resource<T>> {
    return this.reload$.pipe(
      switchMap(() =>
        this.api.getEnvelope<T>(path).pipe(
          map(
            (envelope): Partial<Resource<T>> => ({
              data: envelope.data,
              loading: false,
              error: null,
              fetchedAt: envelope.fetchedAt,
              cached: envelope.cached,
            }),
          ),
          catchError((error: ApiError) =>
            of<Partial<Resource<T>>>({ loading: false, error }),
          ),
          startWith<Partial<Resource<T>>>({ loading: true }),
        ),
      ),
      // Vorherige Daten während des Nachladens behalten.
      scan((previous: Resource<T>, patch: Partial<Resource<T>>) => ({ ...previous, ...patch }), idleResource<T>()),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
}
