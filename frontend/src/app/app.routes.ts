import { Routes } from '@angular/router';

/** Alle Seiten werden lazy geladen, damit der erste Aufruf schlank bleibt. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'uebersicht' },
  {
    path: 'uebersicht',
    title: 'Übersicht · CoC Dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'truppen',
    title: 'Truppen · CoC Dashboard',
    loadComponent: () => import('./features/troops/troops.component').then((m) => m.TroopsComponent),
  },
  {
    path: 'bau',
    title: 'Bau-Tracker · CoC Dashboard',
    loadComponent: () =>
      import('./features/build-tracker/build-tracker.component').then((m) => m.BuildTrackerComponent),
  },
  {
    path: 'planer',
    title: 'Planer · CoC Dashboard',
    loadComponent: () =>
      import('./features/planner/planner.component').then((m) => m.PlannerComponent),
  },
  {
    path: 'strategie',
    title: 'Strategie · CoC Dashboard',
    loadComponent: () =>
      import('./features/strategy/strategy.component').then((m) => m.StrategyComponent),
  },
  {
    path: 'clan',
    title: 'Clan & Krieg · CoC Dashboard',
    loadComponent: () => import('./features/clan/clan.component').then((m) => m.ClanComponent),
  },
  { path: '**', redirectTo: 'uebersicht' },
];
