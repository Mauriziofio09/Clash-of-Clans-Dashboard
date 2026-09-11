import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { Chart, type ChartConfiguration, registerables } from 'chart.js';
import type { TrophyPoint } from '../../core/models/player.models';

Chart.register(...registerables);

/**
 * Trophäen-Verlauf als Liniendiagramm.
 *
 * Die Datenpunkte stammen aus der lokalen SQLite-Datenbank: das Backend
 * schreibt bei jedem Abruf höchstens einen Wert pro Stunde mit. Der Verlauf
 * wächst also, solange das Dashboard regelmäßig läuft.
 */
@Component({
  selector: 'app-trophy-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart">
      <!-- Mit weniger als zwei Punkten ergäbe die Kurve kein Bild, deshalb
           bleibt das Diagramm bis dahin ausgeblendet. -->
      <canvas #canvas [hidden]="points().length < 2"></canvas>
      @if (points().length < 2) {
        <p class="chart__empty muted">
          Noch zu wenig Verlaufsdaten. Das Dashboard schreibt pro Stunde einen Messpunkt mit.
          Nach ein paar Stunden Laufzeit erscheint hier die Kurve.
        </p>
      }
    </div>
  `,
  styles: `
    .chart { position: relative; height: 260px; }

    /* Chart.js setzt display:block direkt am Element, deshalb hier mit
       Nachdruck ausblenden, solange die Kurve kein Bild ergibt. */
    canvas[hidden] { display: none !important; }
    .chart__empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      text-align: center;
      padding: 0 24px;
      font-size: 0.86rem;
    }
  `,
})
export class TrophyChartComponent implements AfterViewInit, OnDestroy {
  readonly points = input.required<TrophyPoint[]>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart<'line'> | null = null;

  constructor() {
    // Bei neuen Daten nur die Datensätze austauschen, nicht das Diagramm neu bauen.
    effect(() => {
      const data = this.points();
      if (!this.chart) return;
      this.applyData(data);
      this.chart.update('none');
    });
  }

  ngAfterViewInit(): void {
    this.chart = new Chart(this.canvasRef().nativeElement, this.buildConfig());
    this.applyData(this.points());
    this.chart.update('none');
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private applyData(points: TrophyPoint[]): void {
    if (!this.chart) return;
    this.chart.data.labels = points.map((p) =>
      new Date(p.recordedAt).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
    this.chart.data.datasets[0]!.data = points.map((p) => p.trophies);
    this.chart.data.datasets[1]!.data = points.map((p) => p.warStars);
  }

  private buildConfig(): ChartConfiguration<'line'> {
    const grid = 'rgba(255, 255, 255, 0.06)';
    const muted = '#94a1bb';

    return {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Trophäen',
            data: [],
            borderColor: '#f5b544',
            backgroundColor: 'rgba(245, 181, 68, 0.14)',
            borderWidth: 2,
            fill: true,
            tension: 0.32,
            pointRadius: 0,
            pointHoverRadius: 4,
            yAxisID: 'y',
          },
          {
            label: 'Kriegssterne',
            data: [],
            borderColor: '#60a5fa',
            borderWidth: 1.5,
            borderDash: [4, 4],
            fill: false,
            tension: 0.32,
            pointRadius: 0,
            pointHoverRadius: 4,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: { color: muted, boxWidth: 12, boxHeight: 12, usePointStyle: true },
          },
          tooltip: {
            backgroundColor: '#1a2030',
            borderColor: '#2f3a52',
            borderWidth: 1,
            titleColor: '#e8ecf5',
            bodyColor: '#e8ecf5',
            padding: 10,
          },
        },
        scales: {
          x: {
            grid: { color: grid },
            ticks: { color: muted, maxTicksLimit: 8, font: { size: 10 } },
          },
          y: {
            position: 'left',
            grid: { color: grid },
            ticks: { color: muted, font: { size: 10 } },
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: { color: muted, font: { size: 10 } },
          },
        },
      },
    };
  }
}
