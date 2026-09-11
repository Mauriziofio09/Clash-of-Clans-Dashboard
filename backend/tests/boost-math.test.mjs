import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFinish, savingsOf } from '../dist/services/boost.service.js';

const H = 3600;
const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
const at = (h) => t0 + h * H * 1000;

/** Fertigstellung in Stunden nach Start. */
const finishAfter = (durationHours, applications) =>
  Math.round(((calculateFinish(t0, durationHours * H, applications).finishMs - t0) / 1000 / H) * 100) / 100;

const potion = (h) => ({ boostId: 'builder-potion', appliedAtMs: at(h), amountSeconds: null });
const research = (h) => ({ boostId: 'research-potion', appliedAtMs: at(h), amountSeconds: null });
const book = (h) => ({ boostId: 'book-of-building', appliedAtMs: at(h), amountSeconds: null });
const gems = (h, seconds) => ({ boostId: 'gem-skip', appliedAtMs: at(h), amountSeconds: seconds });
const battle = (h) => ({ boostId: 'hero-potion', appliedAtMs: at(h), amountSeconds: null });

test('ohne Booster bleibt die Dauer unverändert', () => {
  assert.equal(finishAfter(10, []), 10);
});

test('Bauarbeiter-Trank verkürzt einen langen Bau um 9 Stunden', () => {
  assert.equal(finishAfter(100, [potion(0)]), 91);
});

test('Bauarbeiter-Trank auf einen kurzen Bau kann ihn vorzeitig beenden', () => {
  assert.equal(finishAfter(10, [potion(0)]), 1);
  assert.equal(finishAfter(5, [potion(0)]), 0.5);
});

test('der Zeitpunkt der Anwendung verschiebt die Ersparnis nicht', () => {
  assert.equal(finishAfter(100, [potion(20)]), 91);
});

test('gleichzeitige Tränke stapeln sich nicht', () => {
  assert.equal(finishAfter(100, [potion(0), potion(0)]), 91);
});

test('nacheinander angewandte Tränke addieren ihre Ersparnis', () => {
  assert.equal(finishAfter(100, [potion(0), potion(1)]), 82);
});

test('bei Überlappung gilt der höhere Faktor', () => {
  // Forschungstrank mit Faktor 24 gewinnt gegen den Bau-Trank mit Faktor 10.
  assert.equal(finishAfter(100, [potion(0), research(0)]), 77);
});

test('ein Buch beendet sofort und schlägt laufende Tränke', () => {
  assert.equal(finishAfter(100, [book(2)]), 2);
  assert.equal(finishAfter(100, [potion(0), book(3)]), 3);
});

test('Edelstein-Freikauf schreibt die eingegebene Zeit gut', () => {
  assert.equal(finishAfter(10, [gems(0, H)]), 9);
  assert.equal(finishAfter(10, [gems(0, 20 * H)]), 0);
});

test('Kampf-Booster verändern keine Bauzeit', () => {
  assert.equal(finishAfter(10, [battle(0)]), 10);
});

test('vor dem Start angewandte Booster wirken erst ab dem Start', () => {
  assert.equal(finishAfter(100, [potion(-5)]), 91);
});

test('die Ersparnis je Booster wird einzeln ausgewiesen', () => {
  const applications = [potion(0), potion(1)];
  assert.equal(savingsOf(t0, 100 * H, applications, 0) / H, 9);
  assert.equal(savingsOf(t0, 100 * H, applications, 1) / H, 9);
  assert.equal(calculateFinish(t0, 100 * H, applications).savedSeconds / H, 18);
});
