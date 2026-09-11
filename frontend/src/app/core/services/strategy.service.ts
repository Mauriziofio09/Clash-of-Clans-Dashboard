import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import type { ApiError } from '../models/api.models';
import type { StrategyAdvice, StrategyFocus } from '../models/strategy.models';
import { ApiService } from './api.service';

/** Lädt die Strategie-Empfehlungen und speichert eigene Notizen dazu. */
@Injectable({ providedIn: 'root' })
export class StrategyService {
  private readonly api = inject(ApiService);

  readonly advice = signal<StrategyAdvice | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  load(limit = 3, focus: StrategyFocus | 'alle' = 'krieg'): void {
    this.loading.set(true);
    this.api.get<StrategyAdvice>(`/strategy?limit=${limit}&focus=${focus}`).subscribe({
      next: (data) => {
        this.advice.set(data);
        this.error.set(null);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.error.set(err);
        this.loading.set(false);
      },
    });
  }

  saveNote(strategyId: string, note: string): Observable<{ strategyId: string; note: string }> {
    return this.api
      .put<{ strategyId: string; note: string; updatedAt: string }>(`/strategy/notes/${strategyId}`, { note })
      .pipe(
        tap((saved) => {
          // Notiz direkt im geladenen Ergebnis nachziehen, ohne neuen API-Aufruf.
          const current = this.advice();
          if (!current) return;
          this.advice.set({
            ...current,
            suggestions: current.suggestions.map((s) =>
              s.rule.id === saved.strategyId ? { ...s, note: saved.note || null } : s,
            ),
          });
        }),
      );
  }
}
