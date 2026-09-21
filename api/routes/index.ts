import { Router } from 'express';
import { MicrobeController } from '../src/controllers/MicrobeController.js';
import { gramRouter } from './gram.js';

const router = Router();

router.use('/gram', gramRouter);
router.get('/microbes', MicrobeController.getAll);
router.get('/microbes/stats', MicrobeController.getStats);
router.get('/microbes/category/:category', MicrobeController.getByCategory);
router.get('/microbes/:id', MicrobeController.getById);
router.get('/microbes/:id/related', MicrobeController.getRelated);
router.get('/stats', MicrobeController.getStats);

export default router;
