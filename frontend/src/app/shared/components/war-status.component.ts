import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { interval } from 'rxjs';
import type { WarState, WarStatus } from '../../core/models/clan.models';
import { formatDuration } from '../../core/services/format';

const STATE_LABELS: Record<WarState, string> = {
  notInWar: 'Kein Krieg aktiv',
  preparation: 'Vorbereitungstag',
  inWar: 'Kampftag läuft',
  warEnded: 'Krieg beendet',
};

/** Kriegsstatus als Karte: Stand, Gegner, eigene offene Angriffe, Restzeit. */
@Component({
  selector: 'app-war-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatTooltipModule],
  template: `
    @if (war().warLogPrivate) {
      <p class="muted">
        Das Kriegslog dieses Clans ist privat. Die Clash-of-Clans-API gibt den aktuellen Krieg
        deshalb nicht heraus. In den Clan-Einstellungen im Spiel lässt sich das Kriegslog
        öffentlich schalten.
      </p>
    } @else if (war().state === 'notInWar') {
      <p class="muted">Aktuell läuft kein Clankrieg.</p>
    } @else {
      <div class="war">
        <div class="war__head">
          <span class="chip" [class]="stateChipClass()">{{ stateLabel() }}</span>
          @if (countdownLabel(); as label) {
            <span class="chip chip--info mono">{{ label }}</span>
          }
          @if (war().teamSize) {
            <span class="chip">{{ war().teamSize }} gegen {{ war().teamSize }}</span>
          }
        </div>

        <div class="score">
          <div class="score__side">
            @if (war().clan?.badgeUrl) {
              <img [src]="war().clan!.badgeUrl!" alt="" />
            }
            <div class="score__text">
              <span class="score__name">{{ war().clan?.name }}</span>
              <span class="muted mono">{{ war().clan?.destructionPercentage }} %</span>
            </div>
          </div>

          <div class="score__stars mono">
            <span [class.score__lead]="leading() === 'clan'">{{ war().clan?.stars ?? 0 }}</span>
            <span class="score__sep">:</span>
            <span [class.score__lead]="leading() === 'opponent'">{{ war().opponent?.stars ?? 0 }}</span>
          </div>

          <div class="score__side score__side--right">
            <div class="score__text">
              <span class="score__name">{{ war().opponent?.name }}</span>
              <span class="muted mono">{{ war().opponent?.destructionPercentage }} %</span>
            </div>
            @if (war().opponent?.badgeUrl) {
              <img [src]="war().opponent!.badgeUrl!" alt="" />
            }
          </div>
        </div>

        <div class="attacks">
          <div class="attacks__row">
            <span class="muted">Angriffe Clan</span>
            <span class="mono">{{ war().clan?.attacksUsed ?? 0 }} / {{ war().clan?.attacksTotal ?? '?' }}</span>
          </div>
          <div class="attacks__row">
            <span class="muted">Angriffe Gegner</span>
            <span class="mono">{{ war().opponent?.attacksUsed ?? 0 }} / {{ war().opponent?.attacksTotal ?? '?' }}</span>
          </div>
        </div>

        <div class="me" [class.me--open]="war().me.attacksRemaining > 0">
          <mat-icon>{{ war().me.inWar ? 'bolt' : 'person_off' }}</mat-icon>
          <div class="me__text">
            @if (!war().me.inWar) {
              <strong>Du bist in diesem Krieg nicht dabei.</strong>
            } @else if (war().me.attacksRemaining > 0) {
              <strong>{{ war().me.attacksRemaining }} eigener Angriff offen</strong>
              <span class="muted">
                Platz {{ war().me.mapPosition }} · {{ war().me.attacksUsed }} von
                {{ war().attacksPerMember }} genutzt
              </span>
            } @else {
              <strong>Alle eigenen Angriffe genutzt</strong>
              <span class="muted">Platz {{ war().me.mapPosition }}</span>
            }
          </div>
        </div>

        @if (war().me.attacks.length > 0) {
          <ul class="my-attacks">
            @for (attack of war().me.attacks; track attack.order) {
              <li>
                <span class="muted">Gegen Platz {{ attack.defenderMapPosition ?? '?' }}</span>
                <span class="my-attacks__stars">
                  @for (star of [1, 2, 3]; track star) {
                    <mat-icon [class.on]="attack.stars >= star">star</mat-icon>
                  }
                </span>
                <span class="mono">{{ attack.destructionPercentage }} %</span>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
  styles: `
    .war { display: flex; flex-direction: column; gap: 15px; }
    .war__head { display: flex; flex-wrap: wrap; gap: 8px; }

    .score {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 12px;
      padding: 14px;
      border: 1px solid var(--coc-border);
      border-radius: var(--coc-radius-sm);
      background: rgba(255, 255, 255, 0.02);
    }

    .score__side { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .score__side--right { justify-content: flex-end; text-align: right; }
    .score__side img { width: 38px; height: 38px; object-fit: contain; }
    .score__text { display: flex; flex-direction: column; min-width: 0; }

    .score__name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .score__stars { display: flex; align-items: baseline; gap: 7px; font-size: 1.75rem; font-weight: 700; }
    .score__sep { color: var(--coc-text-muted); font-size: 1.2rem; }
    .score__lead { color: var(--coc-gold); }

    .attacks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; font-size: 0.88rem; }
    .attacks__row { display: flex; justify-content: space-between; gap: 10px; }

    .me {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 12px 14px;
      border-radius: var(--coc-radius-sm);
      border: 1px solid var(--coc-border);
      background: rgba(255, 255, 255, 0.02);
    }

    .me--open {
      border-color: rgba(245, 181, 68, 0.45);
      background: var(--coc-gold-soft);
    }

    .me mat-icon { color: var(--coc-gold); }
    .me__text { display: flex; flex-direction: column; font-size: 0.9rem; }
    .me__text .muted { font-size: 0.82rem; }

    .my-attacks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }

    .my-attacks li {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: 12px;
      font-size: 0.86rem;
    }

    .my-attacks__stars { display: flex; }

    .my-attacks__stars mat-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
      color: var(--coc-border);
    }

    .my-attacks__stars mat-icon.on { color: var(--coc-gold); }

    @media (max-width: 620px) {
      .score { grid-template-columns: 1fr; text-align: center; }
      .score__side, .score__side--right { justify-content: center; text-align: center; }
      .score__stars { justify-content: center; }
      .attacks { grid-template-columns: 1fr; }
    }
  `,
})
export class WarStatusComponent {
  readonly war = input.required<WarStatus>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly now = signal(Date.now());

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(Date.now()));
  }

  protected readonly stateLabel = computed(() => STATE_LABELS[this.war().state]);

  protected readonly stateChipClass = computed(() => {
    switch (this.war().state) {
      case 'inWar':
        return 'chip--danger';
      case 'preparation':
        return 'chip--warn';
      case 'warEnded':
        return 'chip--info';
      default:
        return '';
    }
  });

  protected readonly leading = computed<'clan' | 'opponent' | null>(() => {
    const war = this.war();
    const mine = war.clan?.stars ?? 0;
    const theirs = war.opponent?.stars ?? 0;
    if (mine === theirs) return null;
    return mine > theirs ? 'clan' : 'opponent';
  });

  /** Restzeit bis Kampfbeginn bzw. Kriegsende. */
  protected readonly countdownLabel = computed<string | null>(() => {
    const war = this.war();
    const target =
      war.state === 'preparation' ? war.startTime : war.state === 'inWar' ? war.endTime : null;
    if (!target) return null;

    const seconds = Math.round((Date.parse(target) - this.now()) / 1000);
    if (Number.isNaN(seconds) || seconds <= 0) return null;

    const prefix = war.state === 'preparation' ? 'Start in' : 'Endet in';
    return `${prefix} ${formatDuration(seconds)}`;
  });
}
