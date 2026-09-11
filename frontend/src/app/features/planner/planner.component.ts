import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ApiError } from '../../core/models/api.models';
import type {
  BuildingCategory,
  BuildingInventoryEntry,
  InventoryLevelCount,
  PlannerAssumptions,
  PlannerResult,
  PlannerTask,
} from '../../core/models/planner.models';
import { BUILDING_CATEGORY_LABELS } from '../../core/models/planner.models';
import { DashboardStore } from '../../core/services/dashboard-store.service';
import { PlannerService } from '../../core/services/planner.service';
import { formatDate, formatNumber, formatRoughDuration } from '../../core/services/format';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ErrorPanelComponent } from '../../shared/components/error-panel.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

/** Ein Gebäudetyp mit aufgeklapptem Bearbeitungszustand. */
interface EditableLevels {
  buildingId: string;
  rows: InventoryLevelCount[];
  bulkLevel: number;
}

/**
 * Upgrade-Planer.
 *
 * Zeigt, was als Nächstes dran ist und wie lange es bis zum nächsten Rathaus
 * dauert. Truppen-, Zauber- und Heldenlevel kommen aus der Spiele-API, der
 * Gebäudebestand wird hier von Hand gepflegt, weil die API ihn nicht liefert.
 */
@Component({
  selector: 'app-planner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorPanelComponent,
    SkeletonComponent,
  ],
  templateUrl: './planner.component.html',
  styleUrl: './planner.component.scss',
})
export class PlannerComponent {
  protected readonly service = inject(PlannerService);
  private readonly store = inject(DashboardStore);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly categoryLabels = BUILDING_CATEGORY_LABELS;
  protected readonly editing = signal<EditableLevels | null>(null);
  protected readonly showInventory = signal(false);

  /** Bestand nach Kategorie gruppiert, für die Erfassungstabelle. */
  protected readonly grouped = computed(() => {
    const order: BuildingCategory[] = ['kern', 'verteidigung', 'armee', 'ressourcen', 'falle', 'mauer'];
    const byCategory = new Map<BuildingCategory, BuildingInventoryEntry[]>();
    for (const entry of this.service.inventory()) {
      const list = byCategory.get(entry.category) ?? [];
      list.push(entry);
      byCategory.set(entry.category, list);
    }
    return order
      .filter((category) => byCategory.has(category))
      .map((category) => ({ category, entries: byCategory.get(category)! }));
  });

  protected readonly pendingInventory = computed(
    () => this.service.inventory().filter((entry) => entry.usesDefault && entry.id !== 'town-hall').length,
  );

  constructor() {
    this.service.load();
    this.service.loadInventory();

    // Nach jedem globalen Refresh den Plan mitziehen.
    effect(() => {
      const player = this.store.player();
      if (player.data) this.service.load();
    });
  }

  /* Formatierung ----------------------------------------------------------- */

  protected rough(seconds: number): string {
    return formatRoughDuration(seconds);
  }

  protected day(iso: string | null): string {
    return formatDate(iso);
  }

  protected num(value: number): string {
    return formatNumber(value);
  }

  /** "1 Platz" bzw. "3 Plätze". */
  protected heroSlotLabel(plan: PlannerResult): string {
    const slots = plan.assumptions.heldenGleichzeitig;
    return `${slots} ${slots === 1 ? 'Platz' : 'Plätze'}`;
  }

  protected slotLabel(task: PlannerTask): string {
    switch (task.slot) {
      case 'lab':
        return 'Labor';
      case 'pet':
        return 'Haustierhaus';
      case 'hero':
        return 'Held';
      default:
        return 'Bauarbeiter';
    }
  }

  protected slotIcon(task: PlannerTask): string {
    switch (task.slot) {
      case 'lab':
        return 'science';
      case 'pet':
        return 'pets';
      case 'hero':
        return 'shield_person';
      default:
        return 'construction';
    }
  }

  /* Annahmen ---------------------------------------------------------------- */

  protected updateAssumption(patch: Partial<PlannerAssumptions>): void {
    this.service.saveAssumptions(patch).subscribe({
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  protected onNumberAssumption(key: keyof PlannerAssumptions, raw: string): void {
    const value = Number(raw);
    if (Number.isFinite(value)) this.updateAssumption({ [key]: value } as Partial<PlannerAssumptions>);
  }

  /* Gebäudebestand --------------------------------------------------------- */

  protected startEdit(entry: BuildingInventoryEntry): void {
    this.editing.set({
      buildingId: entry.id,
      rows: entry.levels.length > 0 ? entry.levels.map((l) => ({ ...l })) : [{ level: entry.maxLevel, count: entry.available }],
      bulkLevel: entry.maxLevel,
    });
  }

  protected cancelEdit(): void {
    this.editing.set(null);
  }

  protected addRow(): void {
    const current = this.editing();
    if (!current) return;
    this.editing.set({ ...current, rows: [...current.rows, { level: 1, count: 1 }] });
  }

  protected removeRow(index: number): void {
    const current = this.editing();
    if (!current) return;
    this.editing.set({ ...current, rows: current.rows.filter((_, i) => i !== index) });
  }

  protected patchRow(index: number, patch: Partial<InventoryLevelCount>): void {
    const current = this.editing();
    if (!current) return;
    this.editing.set({
      ...current,
      rows: current.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  protected setBulkLevel(raw: string): void {
    const current = this.editing();
    const level = Number(raw);
    if (!current || !Number.isFinite(level)) return;
    this.editing.set({ ...current, bulkLevel: level });
  }

  /** Setzt alle Exemplare eines Typs auf ein Level - der schnelle Weg. */
  protected applyBulk(entry: BuildingInventoryEntry): void {
    const current = this.editing();
    if (!current) return;
    const level = Math.min(entry.maxLevel, Math.max(1, Math.round(current.bulkLevel)));
    this.editing.set({ ...current, rows: [{ level, count: entry.available }] });
  }

  protected saveEdit(entry: BuildingInventoryEntry): void {
    const current = this.editing();
    if (!current) return;

    const rows = current.rows
      .map((row) => ({ level: Math.round(row.level), count: Math.round(row.count) }))
      .filter((row) => row.count > 0 && row.level >= 1 && row.level <= entry.maxLevel);

    const total = rows.reduce((sum, row) => sum + row.count, 0);
    if (total > entry.available) {
      this.snackBar.open(
        `Bei Rathaus ${this.service.plan()?.townHallLevel ?? ''} gibt es höchstens ${entry.available} Stück.`,
        'OK',
        { duration: 5000 },
      );
      return;
    }

    this.service.saveInventory(entry.id, rows).subscribe({
      next: () => {
        this.snackBar.open(`${entry.name} gespeichert.`, 'OK', { duration: 2500 });
        this.cancelEdit();
      },
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  protected resetInventory(): void {
    this.service.resetInventory().subscribe({
      next: () => this.snackBar.open('Bestand zurückgesetzt, es gilt wieder die Annahme.', 'OK', { duration: 4000 }),
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  protected reload(): void {
    this.service.load();
    this.service.loadInventory();
    this.service.loadTargets();
  }
}
