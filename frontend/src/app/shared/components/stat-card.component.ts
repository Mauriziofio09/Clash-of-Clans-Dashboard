import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Kleine Kennzahlen-Kachel für die Spieler-Übersicht. */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="stat" [style.--accent]="accent()">
      <div class="stat__icon">
        @if (iconUrl()) {
          <img [src]="iconUrl()" [alt]="label()" />
        } @else {
          <mat-icon>{{ icon() }}</mat-icon>
        }
      </div>
      <div class="stat__body">
        <span class="stat__label">{{ label() }}</span>
        <span class="stat__value mono">{{ value() }}</span>
        @if (sub()) {
          <span class="stat__sub">{{ sub() }}</span>
        }
      </div>
    </div>
  `,
  styles: `
    .stat {
      --accent: var(--coc-gold);
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 14px 16px;
      border: 1px solid var(--coc-border);
      border-radius: var(--coc-radius-sm);
      background: var(--coc-surface);
      transition: border-color 0.15s ease, transform 0.15s ease;
    }

    .stat:hover { border-color: var(--accent); transform: translateY(-1px); }

    .stat__icon {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 42px;
      height: 42px;
      border-radius: 11px;
      background: color-mix(in srgb, var(--accent) 16%, transparent);
      color: var(--accent);
    }

    .stat__icon img { width: 34px; height: 34px; object-fit: contain; }

    .stat__body { display: flex; flex-direction: column; min-width: 0; }

    .stat__label {
      font-size: 0.73rem;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--coc-text-muted);
    }

    .stat__value { font-size: 1.32rem; font-weight: 700; line-height: 1.2; }

    .stat__sub {
      font-size: 0.78rem;
      color: var(--coc-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly icon = input<string>('star');
  readonly iconUrl = input<string | null>(null);
  readonly sub = input<string | null>(null);
  readonly accent = input<string>('var(--coc-gold)');
}
