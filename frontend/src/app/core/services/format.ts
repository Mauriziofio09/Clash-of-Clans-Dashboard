/**
 * Einheitliche deutsche Formatierung für Zahlen, Zeiträume und Zeitpunkte.
 *
 * Bewusst als freie Funktionen und nicht als Pipes: sie werden auch außerhalb
 * von Templates gebraucht, etwa in Diagramm-Achsen und Snackbar-Texten.
 */

const NUMBER = new Intl.NumberFormat('de-DE');
const DATE_SHORT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const DATE_DAY = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** 12345 wird zu "12.345". */
export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

/** Sekunden als Countdown: "2 T 04:31:09" bzw. "04:31:09". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(Math.floor((seconds % 86400) / 3600))}:${pad(
    Math.floor((seconds % 3600) / 60),
  )}:${pad(seconds % 60)}`;
  return days > 0 ? `${days} T ${clock}` : clock;
}

/**
 * Grobe Dauer in Worten: "40 Min", "9 Std", "1 T 9 Std", "12 Tage", "3 Monate".
 *
 * Bis zu zehn Tagen werden die Reststunden mitgenannt, weil dort der
 * Unterschied zwischen "1 Tag" und "1 T 9 Std" für die Planung zählt.
 */
export function formatRoughDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} Sek`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} Min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} Std`;

  const days = Math.floor(seconds / 86400);
  const hours = Math.round((seconds % 86400) / 3600);

  if (days < 10) {
    // Auf 24 aufgerundete Reststunden werden zum nächsten Tag.
    const carried = hours === 24 ? days + 1 : days;
    const rest = hours === 24 ? 0 : hours;
    if (rest === 0) return carried === 1 ? '1 Tag' : `${carried} Tage`;
    return `${carried} T ${rest} Std`;
  }

  const rounded = Math.round(seconds / 86400);
  if (rounded < 60) return `${rounded} Tage`;

  const months = Math.round(rounded / 30.4);
  if (months < 24) return months === 1 ? '1 Monat' : `${months} Monate`;

  return `${formatNumber(Math.round((rounded / 365) * 10) / 10)} Jahre`;
}

/** Zeitpunkt mit Wochentag: "Fr., 18.09., 14:17". */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '–';
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? '–' : DATE_SHORT.format(parsed);
}

/** Nur das Datum: "18.09.2026". */
export function formatDate(iso: string | null): string {
  if (!iso) return '–';
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? '–' : DATE_DAY.format(parsed);
}

/** Verstrichene Zeit seit einem Zeitpunkt: "vor 5 s", "vor 12 min", "vor 3 h". */
export function formatAgo(seconds: number): string {
  if (seconds < 60) return `vor ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `vor ${minutes} min`;
  return `vor ${Math.floor(minutes / 60)} h`;
}
