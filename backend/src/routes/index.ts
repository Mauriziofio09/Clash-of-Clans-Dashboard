import { Router } from 'express';
import { buildController } from '../controllers/build.controller.js';
import { clanController } from '../controllers/clan.controller.js';
import { metaController } from '../controllers/meta.controller.js';
import { plannerController } from '../controllers/planner.controller.js';
import { playerController } from '../controllers/player.controller.js';
import { strategyController } from '../controllers/strategy.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const apiRouter: Router = Router();

/* Live-Daten aus der Clash-of-Clans-API ------------------------------------ */
apiRouter.get('/player', asyncHandler(playerController.getPlayer));
apiRouter.get('/troops', asyncHandler(playerController.getTroops));
apiRouter.get('/history', asyncHandler(playerController.getHistory));
apiRouter.get('/clan', asyncHandler(clanController.getClan));
apiRouter.get('/war', asyncHandler(clanController.getWar));

/* Manueller Bau-Tracker (lokale SQLite) ------------------------------------ */
apiRouter.get('/builds', buildController.list);
apiRouter.post('/builds', buildController.create);
apiRouter.delete('/builds/completed', buildController.removeCompleted);
apiRouter.put('/builds/:id', buildController.update);
apiRouter.patch('/builds/:id', buildController.patchFlags);
apiRouter.delete('/builds/:id', buildController.remove);

/* Booster und Tränke ------------------------------------------------------- */
apiRouter.get('/boosts', buildController.listBoosts);
apiRouter.post('/builds/:id/boosts', buildController.addBoost);
apiRouter.delete('/builds/:id/boosts/:boostId', buildController.removeBoost);

/* Angriffsstrategie-Berater ------------------------------------------------ */
apiRouter.get('/strategy', asyncHandler(strategyController.advise));
apiRouter.get('/strategy/rules', strategyController.listRules);
apiRouter.get('/strategy/notes', strategyController.listNotes);
apiRouter.put('/strategy/notes/:id', strategyController.saveNote);

/* Upgrade-Planer ----------------------------------------------------------- */
apiRouter.get('/planner', asyncHandler(plannerController.plan));
apiRouter.get('/planner/targets', asyncHandler(plannerController.targets));
apiRouter.get('/planner/inventory', asyncHandler(plannerController.inventory));
apiRouter.put('/planner/inventory/:buildingId', asyncHandler(plannerController.saveInventory));
apiRouter.delete('/planner/inventory', asyncHandler(plannerController.resetInventory));
apiRouter.get('/planner/assumptions', plannerController.assumptions);
apiRouter.put('/planner/assumptions', plannerController.saveAssumptions);
apiRouter.get('/planner/times', plannerController.listTimeOverrides);
apiRouter.put('/planner/times', plannerController.saveTimeOverride);

/* Meta --------------------------------------------------------------------- */
apiRouter.get('/config', metaController.getConfig);
apiRouter.get('/health', asyncHandler(metaController.health));
apiRouter.post('/cache/clear', metaController.clearCache);
