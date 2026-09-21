import { Router } from 'express';
import { MicrobeController } from '../src/controllers/MicrobeController.js';
import { GramExperimentController } from '../src/controllers/GramExperimentController.js';

const router = Router();

router.get('/microbes', MicrobeController.getAll);
router.get('/microbes/stats', MicrobeController.getStats);
router.get('/microbes/category/:category', MicrobeController.getByCategory);
router.get('/microbes/:id', MicrobeController.getById);
router.get('/microbes/:id/related', MicrobeController.getRelated);
router.get('/stats', MicrobeController.getStats);

router.post('/gram/sessions', GramExperimentController.start);
router.get('/gram/sessions/:sessionId', GramExperimentController.getState);
router.post('/gram/sessions/:sessionId/events', GramExperimentController.event);
router.post('/gram/sessions/:sessionId/verdict', GramExperimentController.verdict);
router.get('/gram/sessions/:sessionId/replay', GramExperimentController.replay);

export default router;
