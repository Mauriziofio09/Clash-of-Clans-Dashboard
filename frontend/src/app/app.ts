import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { interval } from 'rxjs';
import { BuildService } from './core/services/build.service';
import { DashboardStore } from './core/services/dashboard-store.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatBadgeModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly store = inject(DashboardStore);
  protected readonly builds = inject(BuildService);

  protected readonly nav: readonly NavItem[] = [
    { path: '/uebersicht', label: 'Übersicht', icon: 'dashboard' },
    { path: '/truppen', label: 'Truppen', icon: 'military_tech' },
    { path: '/bau', label: 'Bau-Tracker', icon: 'construction' },
    { path: '/planer', label: 'Planer', icon: 'playlist_add_check' },
    { path: '/strategie', label: 'Strategie', icon: 'lightbulb' },
    { path: '/clan', label: 'Clan & Krieg', icon: 'shield' },
  ];

  protected readonly intervalOptions = [60, 120, 300, 600, 900, 1800];

  /** Sekunden seit dem letzten Reload - treibt die "vor X" Anzeige im Header. */
  private readonly tick = signal(Date.now());

  protected readonly secondsSinceRefresh = computed(() =>
    Math.max(0, Math.round((this.tick() - this.store.lastTriggeredAt()) / 1000)),
  );

  protected readonly secondsUntilRefresh = computed(() => {
    if (!this.store.autoRefreshEnabled()) return null;
    return Math.max(0, this.store.refreshIntervalSeconds() - this.secondsSinceRefresh());
  });

  protected readonly readyCount = computed(() => this.builds.finishedUnacknowledged().length);

  constructor() {
    interval(1000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.tick.set(Date.now()));

    // Fertige Upgrades einmalig als Snackbar melden.
    effect(() => {
      for (const build of this.builds.finishedUnacknowledged()) {
        if (!this.builds.markNotified(build.id)) continue;
        const ref = this.snackBar.open(
          `Fertig: ${build.name}${build.targetLevel ? ` (Level ${build.targetLevel})` : ''}`,
          'Anzeigen',
          { duration: 12000, panelClass: 'snack--ready', horizontalPosition: 'right' },
        );
        ref.onAction().subscribe(() => void this.router.navigate(['/bau']));
      }
    });
  }

  protected formatAgo(seconds: number): string {
    if (seconds < 60) return `vor ${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `vor ${minutes} min`;
    return `vor ${Math.floor(minutes / 60)} h`;
  }

  protected formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  protected formatInterval(seconds: number): string {
    return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`;
  }

  protected onIntervalChange(value: string): void {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) this.store.refreshIntervalSeconds.set(seconds);
  }
}
