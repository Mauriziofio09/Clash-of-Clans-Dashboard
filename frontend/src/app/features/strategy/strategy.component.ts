import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ApiError } from '../../core/models/api.models';
import type {
  RequirementCheck,
  StrategyFocus,
  StrategySuggestion,
} from '../../core/models/strategy.models';
import { DashboardStore } from '../../core/services/dashboard-store.service';
import { StrategyService } from '../../core/services/strategy.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ErrorPanelComponent } from '../../shared/components/error-panel.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';

/**
 * Regelbasierter Angriffsstrategie-Berater.
 *
 * Die Wissensdatenbank liegt im Backend (src/data/strategies.json). Dort werden
 * Strategien gegen Rathaus-Level und die tatsächlich vorhandenen Truppen-,
 * Zauber- und Heldenlevel geprüft und mit einer Punktzahl versehen.
 */
@Component({
  selector: 'app-strategy',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    EmptyStateComponent,
    ErrorPanelComponent,
    SkeletonComponent,
  ],
  templateUrl: './strategy.component.html',
  styleUrl: './strategy.component.scss',
})
export class StrategyComponent {
  protected readonly service = inject(StrategyService);
  private readonly store = inject(DashboardStore);
  private readonly snackBar = inject(MatSnackBar);

  /** Id der Strategie, deren Notiz gerade bearbeitet wird. */
  protected readonly editingNote = signal<string | null>(null);
  protected readonly noteDraft = signal('');
  protected readonly limit = signal(3);

  /** Kriegsarmeen und Farm-Armeen verfolgen verschiedene Ziele, deshalb getrennt. */
  protected readonly focus = signal<StrategyFocus | 'alle'>('krieg');

  protected readonly focusOptions: { value: StrategyFocus | 'alle'; label: string }[] = [
    { value: 'krieg', label: 'Krieg' },
    { value: 'farmen', label: 'Farmen' },
    { value: 'alle', label: 'Alle' },
  ];

  constructor() {
    this.reload();

    // Nach jedem globalen Refresh die Empfehlungen mitziehen.
    effect(() => {
      const player = this.store.player();
      if (player.data) this.reload();
    });
  }

  protected reload(): void {
    this.service.load(this.limit(), this.focus());
  }

  protected setFocus(value: StrategyFocus | 'alle'): void {
    this.focus.set(value);
    this.reload();
  }

  protected showMore(): void {
    this.limit.set(this.limit() === 3 ? 8 : 3);
    this.reload();
  }

  protected scoreClass(score: number): string {
    if (score >= 80) return 'score--great';
    if (score >= 60) return 'score--good';
    if (score >= 45) return 'score--ok';
    return 'score--weak';
  }

  protected difficultyClass(difficulty: string): string {
    switch (difficulty) {
      case 'einsteiger':
        return 'chip--success';
      case 'fortgeschritten':
        return 'chip--warn';
      default:
        return 'chip--danger';
    }
  }

  protected requirementLabel(check: RequirementCheck): string {
    const count = check.count ? `${check.count}x ` : '';
    return `${count}${check.name}`;
  }

  protected startNote(suggestion: StrategySuggestion): void {
    this.editingNote.set(suggestion.rule.id);
    this.noteDraft.set(suggestion.note ?? '');
  }

  protected cancelNote(): void {
    this.editingNote.set(null);
    this.noteDraft.set('');
  }

  protected saveNote(id: string): void {
    this.service.saveNote(id, this.noteDraft()).subscribe({
      next: () => {
        this.snackBar.open('Notiz gespeichert.', 'OK', { duration: 2500 });
        this.cancelNote();
      },
      error: (err: ApiError) => this.snackBar.open(err.message, 'OK', { duration: 6000 }),
    });
  }
}
