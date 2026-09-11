import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { UnitGroup } from '../../core/models/player.models';
import { DashboardStore } from '../../core/services/dashboard-store.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ErrorPanelComponent } from '../../shared/components/error-panel.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { formatNumber } from '../../core/services/format';

/**
 * Fortschritt aller Truppen, Zauber, Helden, Haustiere und Belagerungsmaschinen.
 *
 * Der Vergleichswert ist bewusst das beim aktuellen Rathaus erreichbare Maximum,
 * nicht das globale Maximum der API - nur so ist ablesbar, was tatsächlich noch
 * im Labor ansteht.
 */
@Component({
  selector: 'app-troops',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorPanelComponent,
    SkeletonComponent,
  ],
  templateUrl: './troops.component.html',
  styleUrl: './troops.component.scss',
})
export class TroopsComponent {
  protected readonly store = inject(DashboardStore);
  protected readonly troops = this.store.troops;

  protected readonly search = signal('');
  protected readonly hideLocked = signal(true);
  protected readonly hideMaxed = signal(false);

  protected readonly groups = computed<UnitGroup[]>(() => {
    const data = this.troops().data;
    if (!data) return [];

    const term = this.search().trim().toLowerCase();
    const hideLocked = this.hideLocked();
    const hideMaxed = this.hideMaxed();

    return data.groups
      .map((group) => ({
        ...group,
        units: group.units.filter((unit) => {
          if (term && !unit.name.toLowerCase().includes(term)) return false;
          if (hideLocked && unit.locked) return false;
          if (hideMaxed && unit.maxed && !unit.locked) return false;
          return true;
        }),
      }))
      .filter((group) => group.units.length > 0);
  });

  /** Anzahl der Einheiten, die noch nicht auf Rathaus-Maximum sind. */
  protected readonly openUpgrades = computed(() => {
    const data = this.troops().data;
    if (!data) return 0;
    return data.groups
      .flatMap((g) => g.units)
      .filter((u) => !u.locked && !u.maxed && u.category !== 'superTroop').length;
  });

  protected num(value: number): string {
    return formatNumber(value);
  }

  protected barColor(percent: number, maxed: boolean): string {
    if (maxed) return 'var(--coc-success)';
    if (percent >= 75) return 'var(--coc-gold)';
    if (percent >= 40) return 'var(--coc-warn)';
    return 'var(--coc-danger)';
  }

  protected retry(): void {
    this.store.forceRefresh();
  }
}
