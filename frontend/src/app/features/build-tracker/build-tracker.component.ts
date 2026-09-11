import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ApiError } from '../../core/models/api.models';
import type { BuildCategory, BuildPayload, Village } from '../../core/models/build.models';
import { BUILD_CATEGORY_LABELS, VILLAGE_LABELS } from '../../core/models/build.models';
import { BuildService, type BuildCountdown } from '../../core/services/build.service';
import { PlannerService } from '../../core/services/planner.service';
import type { PlannerTarget } from '../../core/models/planner.models';
import { formatDateTime, formatDuration, formatRoughDuration } from '../../core/services/format';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ErrorPanelComponent } from '../../shared/components/error-panel.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import type { BoostDefinition } from '../../core/models/boost.models';

/**
 * Manueller Bau-Tracker.
 *
 * Die Clash-of-Clans-API liefert keine laufenden Upgrade-Timer, deshalb werden
 * Start und Dauer hier von Hand eingetragen. Die Restzeit läuft im Browser
 * sekundengenau weiter, die Daten liegen in der lokalen SQLite-Datenbank.
 */
@Component({
  selector: 'app-build-tracker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorPanelComponent,
    SkeletonComponent,
  ],
  templateUrl: './build-tracker.component.html',
  styleUrl: './build-tracker.component.scss',
})
export class BuildTrackerComponent {
  protected readonly service = inject(BuildService);
  protected readonly planner = inject(PlannerService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly categories = Object.entries(BUILD_CATEGORY_LABELS) as [BuildCategory, string][];
  protected readonly villages = Object.entries(VILLAGE_LABELS) as [Village, string][];

  /** Id des gerade bearbeiteten Eintrags, null bedeutet "neuer Eintrag". */
  protected readonly editingId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly showCompleted = signal(false);

  /** Id der Aufwertung, für die gerade ein Booster nachgetragen wird. */
  protected readonly boostPanelFor = signal<number | null>(null);

  protected readonly boostForm = this.fb.nonNullable.group({
    boostId: ['', Validators.required],
    appliedAt: [toLocalInput(new Date()), Validators.required],
    skipDays: [0, [Validators.min(0), Validators.max(60)]],
    skipHours: [0, [Validators.min(0), Validators.max(23)]],
    skipMinutes: [0, [Validators.min(0), Validators.max(59)]],
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    category: ['building' as BuildCategory, Validators.required],
    village: ['home' as Village, Validators.required],
    /** "kind|key|level" der gewählten Aufwertung, "frei" für einen eigenen Eintrag. */
    target: ['', Validators.required],
    targetLevel: [null as number | null],
    builder: [''],
    startedAt: [toLocalInput(new Date()), Validators.required],
    days: [0, [Validators.min(0), Validators.max(60)]],
    hours: [0, [Validators.min(0), Validators.max(23)]],
    minutes: [0, [Validators.min(0), Validators.max(59)]],
    notes: [''],
  });

  protected readonly durationSeconds = computed(() => this.totalSeconds());
  private readonly formTick = signal(0);

  /** Spiegelt das Auswahlfeld als Signal, damit computed() darauf reagiert. */
  private readonly targetChoice = signal('');

  protected readonly isEditing = computed(() => this.editingId() !== null);

  protected readonly summary = computed(() => {
    const active = this.service.active();
    return {
      running: active.filter((b) => !b.ready).length,
      ready: active.filter((b) => b.ready).length,
      completed: this.service.completed().length,
    };
  });

  /** Eindeutiger Wert einer Vorlage im Auswahlfeld. */
  protected targetValue(target: PlannerTarget): string {
    return `${target.kind}|${target.key}|${target.toLevel}`;
  }

  /** Vorlagen nach Bereich gruppiert, damit die Auswahl übersichtlich bleibt. */
  protected readonly targetGroups = computed(() => {
    const gruppen: { label: string; items: PlannerTarget[] }[] = [
      { label: 'Helden', items: [] },
      { label: 'Gebäude', items: [] },
      { label: 'Truppen', items: [] },
      { label: 'Zauber', items: [] },
      { label: 'Haustiere', items: [] },
    ];
    for (const target of this.planner.targets()) {
      const index =
        target.buildCategory === 'hero' ? 0
        : target.buildCategory === 'troop' ? 2
        : target.buildCategory === 'spell' ? 3
        : target.buildCategory === 'pet' ? 4
        : 1;
      gruppen[index]!.items.push(target);
    }
    return gruppen.filter((gruppe) => gruppe.items.length > 0);
  });

  /** true, solange kein Vorschlag gewählt ist und frei eingetragen wird. */
  protected readonly freeEntry = computed(() => this.targetChoice() === FREE_ENTRY);

  /** Die gewählte Vorlage, null bei freiem Eintrag. */
  protected readonly chosenTarget = computed<PlannerTarget | null>(() => {
    const value = this.targetChoice();
    if (!value || value === FREE_ENTRY) return null;
    return this.planner.targets().find((t) => this.targetValue(t) === value) ?? null;
  });

  /** Wie viele Aufwertungen die Auswahlliste insgesamt anbietet. */
  protected readonly targetCount = computed(() => this.planner.targets().length);

  constructor() {
    this.form.valueChanges.subscribe(() => this.formTick.update((v) => v + 1));
    this.planner.loadTargets();
  }

  /**
   * Auswahl übernehmen: Name, Kategorie, Ziel-Level und die geschätzte Dauer
   * ergeben sich daraus. Nach dem Ziel-Level wird nicht mehr gefragt, es steht
   * fest, sobald die Aufwertung gewählt ist.
   */
  protected applyTarget(value: string): void {
    this.targetChoice.set(value);

    if (value === FREE_ENTRY) {
      this.form.patchValue({ target: value, name: '', targetLevel: null });
      return;
    }

    const target = this.planner.targets().find((t) => this.targetValue(t) === value);
    if (!target) {
      this.form.patchValue({ target: value });
      return;
    }

    const seconds = target.seconds;
    this.form.patchValue({
      target: value,
      name: target.name,
      category: target.buildCategory as BuildCategory,
      village: 'home',
      targetLevel: target.toLevel,
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
    });
  }

  protected format(seconds: number): string {
    return formatDuration(seconds);
  }

  protected rough(seconds: number): string {
    return formatRoughDuration(seconds);
  }

  protected finishTime(build: BuildCountdown): string {
    return formatDateTime(build.finishesAt);
  }

  /* Booster ---------------------------------------------------------------- */

  /** Die Mittel, die auf Kategorie und Dorf dieser Aufwertung wirken. */
  protected boostsFor(build: BuildCountdown): BoostDefinition[] {
    return this.service
      .boostCatalog()
      .filter(
        (boost) =>
          boost.effect !== 'battle' &&
          boost.village === build.village &&
          boost.appliesTo.includes(build.category),
      );
  }

  /** Schnellweg aus dem Menü: wirkt ab jetzt. */
  protected quickApply(build: BuildCountdown, boost: BoostDefinition): void {
    if (boost.requiresAmount) {
      this.openBoostPanel(build, boost.id);
      return;
    }
    this.service.applyBoost(build.id, boost.id).subscribe({
      next: () => this.snackBar.open(`${boost.name} eingetragen.`, 'OK', { duration: 3000 }),
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  /** Genauer Weg: Mittel, Zeitpunkt und bei Edelsteinen die Menge. */
  protected openBoostPanel(build: BuildCountdown, preselect = ''): void {
    this.boostPanelFor.set(build.id);
    this.boostForm.reset({
      boostId: preselect || (this.boostsFor(build)[0]?.id ?? ''),
      appliedAt: toLocalInput(new Date()),
      skipDays: 0,
      skipHours: 0,
      skipMinutes: 0,
    });
  }

  protected closeBoostPanel(): void {
    this.boostPanelFor.set(null);
  }

  protected selectedBoost(build: BuildCountdown): BoostDefinition | null {
    const id = this.boostForm.controls.boostId.value;
    return this.boostsFor(build).find((boost) => boost.id === id) ?? null;
  }

  protected submitBoost(build: BuildCountdown): void {
    const boost = this.selectedBoost(build);
    if (!boost) {
      this.snackBar.open('Bitte ein Mittel auswählen.', 'OK', { duration: 4000 });
      return;
    }

    const raw = this.boostForm.getRawValue();
    const amountSeconds =
      (Number(raw.skipDays) || 0) * 86400 +
      (Number(raw.skipHours) || 0) * 3600 +
      (Number(raw.skipMinutes) || 0) * 60;

    if (boost.requiresAmount && amountSeconds <= 0) {
      this.snackBar.open('Bitte eintragen, wie viel Zeit du freigekauft hast.', 'OK', { duration: 5000 });
      return;
    }

    this.service
      .applyBoost(build.id, boost.id, {
        appliedAt: new Date(raw.appliedAt).toISOString(),
        ...(boost.requiresAmount ? { amountSeconds } : {}),
      })
      .subscribe({
        next: () => {
          this.snackBar.open(`${boost.name} eingetragen.`, 'OK', { duration: 3000 });
          this.closeBoostPanel();
        },
        error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
      });
  }

  protected undoBoost(build: BuildCountdown, appliedBoostId: number, name: string): void {
    this.service.removeBoost(build.id, appliedBoostId).subscribe({
      next: () => this.snackBar.open(`${name} zurückgenommen.`, 'OK', { duration: 3000 }),
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  /** Übernimmt eine gängige Upgrade-Dauer in die Formularfelder. */
  protected applyPreset(days: number, hours: number): void {
    this.form.patchValue({ days, hours, minutes: 0 });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (!this.form.controls.target.value) {
        this.snackBar.open('Bitte auswählen, was ausgebaut wird.', 'OK', { duration: 4000 });
      }
      return;
    }
    if (this.freeEntry() && this.form.controls.name.value.trim() === '') {
      this.form.controls.name.markAsTouched();
      this.snackBar.open('Bitte einen Namen eintragen.', 'OK', { duration: 4000 });
      return;
    }

    const seconds = this.totalSeconds();
    if (seconds <= 0) {
      this.snackBar.open('Bitte eine Dauer größer als 0 eintragen.', 'OK', { duration: 4000 });
      return;
    }

    const raw = this.form.getRawValue();
    const linked = raw.target && raw.target !== FREE_ENTRY ? raw.target.split('|') : null;
    const payload: BuildPayload = {
      name: raw.name.trim(),
      category: raw.category,
      village: raw.village,
      targetKind: linked ? (linked[0] as BuildPayload['targetKind']) : null,
      targetKey: linked ? (linked[1] ?? null) : null,
      targetLevel: raw.targetLevel === null || Number.isNaN(raw.targetLevel) ? null : Number(raw.targetLevel),
      startedAt: new Date(raw.startedAt).toISOString(),
      durationSeconds: seconds,
      builder: raw.builder.trim() || null,
      notes: raw.notes.trim() || null,
    };

    this.saving.set(true);
    const id = this.editingId();
    const request = id === null ? this.service.create(payload) : this.service.update(id, payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(id === null ? 'Upgrade eingetragen.' : 'Upgrade aktualisiert.', 'OK', {
          duration: 3000,
        });
        this.resetForm();
      },
      error: (err: ApiError) => {
        this.saving.set(false);
        this.snackBar.open(err.message, 'OK', { duration: 6000 });
      },
    });
  }

  protected edit(build: BuildCountdown): void {
    this.editingId.set(build.id);
    const total = build.durationSeconds;
    const target =
      build.targetKind && build.targetKey && build.targetLevel !== null
        ? `${build.targetKind}|${build.targetKey}|${build.targetLevel}`
        : FREE_ENTRY;
    this.targetChoice.set(target);
    this.form.setValue({
      name: build.name,
      category: build.category,
      village: build.village,
      target,
      targetLevel: build.targetLevel,
      builder: build.builder ?? '',
      startedAt: toLocalInput(new Date(build.startedAt)),
      days: Math.floor(total / 86400),
      hours: Math.floor((total % 86400) / 3600),
      minutes: Math.floor((total % 3600) / 60),
      notes: build.notes ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected resetForm(): void {
    this.editingId.set(null);
    this.targetChoice.set('');
    this.form.reset({
      name: '',
      category: 'building',
      village: 'home',
      target: '',
      targetLevel: null,
      builder: '',
      startedAt: toLocalInput(new Date()),
      days: 0,
      hours: 0,
      minutes: 0,
      notes: '',
    });
  }

  protected toggleCompleted(build: BuildCountdown): void {
    this.service.setCompleted(build.id, !build.completed).subscribe({
      next: () => {
        // Bei einer verknüpften Gebäude-Aufwertung zieht der Bestand nach.
        if (build.targetKind === 'building' && !build.completed) {
          this.planner.load();
          this.planner.loadInventory();
          this.planner.loadTargets();
          this.snackBar.open(`${build.name} abgehakt, der Bestand wurde nachgezogen.`, 'OK', {
            duration: 4000,
          });
        }
      },
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  protected acknowledge(build: BuildCountdown): void {
    this.service.acknowledge(build.id).subscribe({
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  protected remove(build: BuildCountdown): void {
    this.service.remove(build.id).subscribe({
      next: () => this.snackBar.open(`"${build.name}" gelöscht.`, 'OK', { duration: 3000 }),
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  protected clearCompleted(): void {
    this.service.removeCompleted().subscribe({
      next: (result) =>
        this.snackBar.open(`${result.deleted} erledigte Einträge entfernt.`, 'OK', { duration: 3000 }),
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }

  private totalSeconds(): number {
    this.formTick();
    const { days, hours, minutes } = this.form.getRawValue();
    return (Number(days) || 0) * 86400 + (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60;
  }
}

/** Wert des Auswahlfelds für einen Eintrag ohne Planer-Zuordnung. */
const FREE_ENTRY = 'frei';

/** Wandelt ein Date in den Wert, den `<input type="datetime-local">` erwartet. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
