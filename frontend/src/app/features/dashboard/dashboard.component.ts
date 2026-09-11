import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BuildService } from '../../core/services/build.service';
import { DashboardStore } from '../../core/services/dashboard-store.service';
import { PlannerService } from '../../core/services/planner.service';
import { formatDuration, formatNumber, formatRoughDuration } from '../../core/services/format';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ErrorPanelComponent } from '../../shared/components/error-panel.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { StatCardComponent } from '../../shared/components/stat-card.component';
import { TrophyChartComponent } from '../../shared/components/trophy-chart.component';
import { WarStatusComponent } from '../../shared/components/war-status.component';

/** Eine Karte in der Leiste "Jetzt wichtig" ganz oben. */
interface FocusCard {
  icon: string;
  label: string;
  value: string;
  detail: string;
  link: string;
  tone: 'neutral' | 'gold' | 'success' | 'danger';
}

/**
 * Startseite.
 *
 * Ganz oben steht, was jetzt eine Handlung verlangt: offene Kriegsangriffe,
 * fertige Upgrades, der nächste Countdown und der nächste Schritt aus dem
 * Planer. Alles Weitere folgt darunter.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorPanelComponent,
    SkeletonComponent,
    StatCardComponent,
    TrophyChartComponent,
    WarStatusComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly builds = inject(BuildService);
  protected readonly planner = inject(PlannerService);

  protected readonly player = this.store.player;
  protected readonly troops = this.store.troops;
  protected readonly war = this.store.war;
  protected readonly history = this.store.history;

  protected readonly readyBuilds = this.builds.finishedUnacknowledged;
  protected readonly nextBuild = this.builds.next;

  constructor() {
    this.planner.load();
    effect(() => {
      const player = this.store.player();
      if (player.data) this.planner.load();
    });
  }

  /** Spendenverhältnis - im Clan ein üblicher Gradmesser. */
  protected readonly donationRatio = computed(() => {
    const data = this.player().data;
    if (!data) return '–';
    if (data.donationsReceived === 0) return formatNumber(data.donations);
    return (data.donations / data.donationsReceived).toFixed(2).replace('.', ',');
  });

  /** Die vier Karten der Leiste "Jetzt wichtig". */
  protected readonly focus = computed<FocusCard[]>(() => {
    const cards: FocusCard[] = [];

    const war = this.war().data;
    if (war && war.state === 'inWar' && war.me.inWar) {
      const open = war.me.attacksRemaining;
      cards.push({
        icon: open > 0 ? 'bolt' : 'check_circle',
        label: 'Kriegsangriffe',
        value: open > 0 ? `${open} offen` : 'alle genutzt',
        detail: open > 0 ? `Platz ${war.me.mapPosition} · Kampftag läuft` : `Platz ${war.me.mapPosition}`,
        link: '/clan',
        tone: open > 0 ? 'danger' : 'success',
      });
    } else {
      cards.push({
        icon: 'shield',
        label: 'Krieg',
        value: war?.state === 'preparation' ? 'Vorbereitung' : 'kein Krieg',
        detail: war?.warLogPrivate ? 'Kriegslog ist privat' : 'nichts zu tun',
        link: '/clan',
        tone: 'neutral',
      });
    }

    const ready = this.readyBuilds();
    cards.push({
      icon: ready.length > 0 ? 'notifications_active' : 'construction',
      label: 'Fertige Upgrades',
      value: ready.length > 0 ? `${ready.length} fertig` : 'keine',
      detail: ready.length > 0 ? ready.map((b) => b.name).join(', ') : 'nichts abzuhaken',
      link: '/bau',
      tone: ready.length > 0 ? 'success' : 'neutral',
    });

    const next = this.nextBuild();
    cards.push({
      icon: 'hourglass_top',
      label: 'Nächster Bau',
      value: next ? formatDuration(next.secondsLeft) : 'nichts läuft',
      detail: next
        ? `${next.name}${next.targetLevel ? ` · Level ${next.targetLevel}` : ''}`
        : 'Upgrade im Bau-Tracker eintragen',
      link: '/bau',
      tone: next ? 'gold' : 'neutral',
    });

    const task = this.planner.plan()?.tasks[0];
    cards.push({
      icon: 'playlist_add_check',
      label: 'Nächster Schritt',
      value: task ? task.name : 'alles fertig',
      detail: task
        ? `${task.fromLevel} → ${task.toLevel} · ${formatRoughDuration(task.seconds)}`
        : 'auf diesem Rathaus ist alles auf Maximum',
      link: '/planer',
      tone: 'neutral',
    });

    return cards;
  });

  /** "1 Messpunkt" bzw. "12 Messpunkte". */
  protected readonly messpunkte = computed(() => {
    const count = this.history().data?.length ?? 0;
    return `${formatNumber(count)} ${count === 1 ? 'Messpunkt' : 'Messpunkte'}`;
  });

  protected format(seconds: number): string {
    return formatDuration(seconds);
  }

  protected num(value: number): string {
    return formatNumber(value);
  }

  protected retry(): void {
    this.store.forceRefresh();
  }
}
