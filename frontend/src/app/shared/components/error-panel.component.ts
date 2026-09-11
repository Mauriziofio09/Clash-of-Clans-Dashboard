import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { ApiError, ApiErrorCode } from '../../core/models/api.models';

interface ErrorPresentation {
  icon: string;
  title: string;
  steps: string[];
}

/** Erklärt einen Backend-/API-Fehler in Klartext samt konkreter Handlungsschritte. */
const PRESENTATION: Record<ApiErrorCode, ErrorPresentation> = {
  BACKEND_OFFLINE: {
    icon: 'cloud_off',
    title: 'Backend nicht erreichbar',
    steps: [
      'Im Ordner backend ein Terminal öffnen und "npm run dev" starten.',
      'Prüfen, ob Port 3000 bereits von einem anderen Programm belegt ist.',
    ],
  },
  IP_NOT_WHITELISTED: {
    icon: 'vpn_lock',
    title: 'IP-Adresse nicht freigegeben',
    steps: [
      'Auf developer.clashofclans.com einloggen.',
      'Den verwendeten Key bearbeiten und die aktuelle öffentliche IP eintragen.',
      'Nach jedem WLAN-Wechsel ändert sich die IP - dann erneut eintragen.',
      'Danach hier auf "Erneut versuchen" klicken.',
    ],
  },
  INVALID_API_KEY: {
    icon: 'key_off',
    title: 'API-Key ungültig',
    steps: [
      'COC_API_KEY in backend/.env prüfen - der Wert muss der komplette JWT sein.',
      'Notfalls einen neuen Key auf developer.clashofclans.com erzeugen.',
      'Backend nach der Änderung neu starten.',
    ],
  },
  CONFIG_MISSING: {
    icon: 'settings_alert',
    title: 'Konfiguration unvollständig',
    steps: [
      'backend/.env.example nach backend/.env kopieren.',
      'COC_API_KEY und COC_PLAYER_TAG ausfüllen.',
      'Backend neu starten.',
    ],
  },
  NOT_FOUND: {
    icon: 'search_off',
    title: 'Nicht gefunden',
    steps: [
      'Spieler- bzw. Clan-Tag in backend/.env prüfen.',
      'Tags enthalten niemals den Buchstaben O, immer die Ziffer 0.',
    ],
  },
  RATE_LIMITED: {
    icon: 'speed',
    title: 'Zu viele Anfragen',
    steps: [
      'Das Auto-Refresh-Intervall im Header erhöhen.',
      'Alternativ CACHE_TTL_SECONDS in backend/.env anheben.',
    ],
  },
  COC_MAINTENANCE: {
    icon: 'construction',
    title: 'Wartungsarbeiten bei Clash of Clans',
    steps: ['Die Spiel-API liefert während der Wartung keine Daten. Später erneut versuchen.'],
  },
  COC_TIMEOUT: {
    icon: 'timer_off',
    title: 'Zeitüberschreitung',
    steps: [
      'Internetverbindung prüfen.',
      'COC_TIMEOUT_MS in backend/.env erhöhen, wenn die Verbindung langsam ist.',
    ],
  },
  COC_UNAVAILABLE: {
    icon: 'wifi_off',
    title: 'Clash-of-Clans-API nicht erreichbar',
    steps: ['Internetverbindung prüfen und es gleich noch einmal versuchen.'],
  },
  VALIDATION: { icon: 'rule', title: 'Eingabe unzulässig', steps: [] },
  INTERNAL: { icon: 'bug_report', title: 'Unerwarteter Fehler', steps: [] },
};

@Component({
  selector: 'app-error-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="err" [class.err--compact]="compact()">
      <mat-icon class="err__icon">{{ view().icon }}</mat-icon>
      <div class="err__body">
        <h3 class="err__title">{{ view().title }}</h3>
        <p class="err__msg">{{ error().message }}</p>
        @if (error().hint) {
          <p class="err__hint">{{ error().hint }}</p>
        }
        @if (view().steps.length > 0) {
          <ol class="err__steps">
            @for (step of view().steps; track step) {
              <li>{{ step }}</li>
            }
          </ol>
        }
        <button mat-stroked-button color="primary" (click)="retry.emit()">
          <mat-icon>refresh</mat-icon>
          Erneut versuchen
        </button>
      </div>
    </div>
  `,
  styles: `
    .err {
      display: flex;
      gap: 16px;
      padding: 20px;
      border: 1px solid rgba(248, 113, 113, 0.35);
      border-radius: var(--coc-radius);
      background: rgba(248, 113, 113, 0.07);
    }

    .err--compact { padding: 14px; gap: 12px; }

    .err__icon {
      flex: 0 0 auto;
      color: var(--coc-danger);
      font-size: 30px;
      width: 30px;
      height: 30px;
    }

    .err__body { min-width: 0; }
    .err__title { font-size: 1.02rem; margin-bottom: 4px; }
    .err__msg { margin: 0 0 6px; }
    .err__hint { margin: 0 0 10px; color: var(--coc-text-muted); font-size: 0.88rem; }

    .err__steps {
      margin: 0 0 14px;
      padding-left: 20px;
      color: var(--coc-text-muted);
      font-size: 0.88rem;
    }

    .err__steps li { margin-bottom: 3px; }
  `,
})
export class ErrorPanelComponent {
  readonly error = input.required<ApiError>();
  readonly compact = input(false);
  readonly retry = output<void>();

  protected readonly view = computed(
    () => PRESENTATION[this.error().code] ?? PRESENTATION.INTERNAL,
  );
}
