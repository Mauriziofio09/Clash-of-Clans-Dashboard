import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** Leerzustand mit Erklärung und einer konkreten nächsten Handlung. */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="empty">
      <mat-icon class="empty__icon">{{ icon() }}</mat-icon>
      <h3 class="empty__title">{{ title() }}</h3>
      <p class="empty__text">{{ text() }}</p>
      @if (actionLabel()) {
        <button mat-flat-button color="primary" (click)="action.emit()">
          {{ actionLabel() }}
        </button>
      }
      <ng-content />
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 9px;
      padding: 34px 20px;
      text-align: center;
      border: 1px dashed var(--coc-border);
      border-radius: var(--coc-radius-sm);
      background: rgba(255, 255, 255, 0.015);
    }

    .empty__icon {
      font-size: 34px;
      width: 34px;
      height: 34px;
      color: var(--coc-text-muted);
      opacity: 0.75;
    }

    .empty__title { font-size: 1rem; }

    .empty__text {
      margin: 0;
      max-width: 52ch;
      font-size: 0.88rem;
      color: var(--coc-text-muted);
    }
  `,
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly text = input('');
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();
}
