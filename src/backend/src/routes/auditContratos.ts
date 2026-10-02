import { Router } from 'express';
import { exportRelatorioContratos, getRelatorioContratos } from '../controllers/auditContratosController';

// Rotas exclusivas do módulo, montadas em /api/audit/contratos.
const router = Router();

router.get('/', getRelatorioContratos);
router.get('/export', exportRelatorioContratos);

export default router;
