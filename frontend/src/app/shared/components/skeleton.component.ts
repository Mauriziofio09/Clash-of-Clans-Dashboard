import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Platzhalter, der die Form des späteren Inhalts vorwegnimmt.
 *
 * Dadurch springt das Layout beim Eintreffen der Daten nicht, anders als bei
 * einem zentrierten Ladekreis.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (row of rows(); track $index) {
      <span
        class="sk"
        [style.height.px]="height()"
        [style.width]="$last && rows().length > 1 ? lastWidth() : '100%'"
        [style.border-radius.px]="radius()"
      ></span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }

    .sk {
      display: block;
      background: linear-gradient(
        100deg,
        rgba(255, 255, 255, 0.045) 30%,
        rgba(255, 255, 255, 0.1) 50%,
        rgba(255, 255, 255, 0.045) 70%
      );
      background-size: 220% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }

    @keyframes shimmer {
      from { background-position: 140% 0; }
      to { background-position: -40% 0; }
    }

    /* Wer reduzierte Bewegung eingestellt hat, bekommt eine ruhige Fläche. */
    @media (prefers-reduced-motion: reduce) {
      .sk { animation: none; }
    }
  `,
  host: { 'aria-hidden': 'true' },
})
export class SkeletonComponent {
  readonly rows = input<number[]>([0]);
  readonly height = input(16);
  readonly radius = input(7);
  readonly lastWidth = input('62%');
}
