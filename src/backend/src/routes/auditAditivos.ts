import { Router } from 'express';
import { getRelatorioAditivos, exportRelatorioAditivos } from '../controllers/auditAditivosController';

// Auditoria Aditivos (Fase 2A) — rotas de leitura do módulo, montadas em /api/audit/aditivos.

const router = Router();

router.get('/',       getRelatorioAditivos);
router.get('/export', exportRelatorioAditivos);

export default router;
