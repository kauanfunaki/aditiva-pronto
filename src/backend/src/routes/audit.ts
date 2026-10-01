import { Router } from 'express';
import { robotAuth } from '../middleware/robotAuth';
import {
  getStatus, postSync, getFolders, putFolderLink,
  postNextJob, postLote, postFinish, postFail,
} from '../controllers/auditBaseController';

// Auditoria de Contratos e Aditivos — base comum (Fase 1).
// Os módulos montam as próprias rotas de leitura em /api/audit/aditivos e /api/audit/contratos.

const router = Router();

// ── Tela ──────────────────────────────────────────────────────────
router.get('/status',        getStatus);
router.post('/sync',         postSync);
router.get('/folders',       getFolders);
router.put('/folders/link',  putFolderLink);

// ── Robô coletor (Authorization: Bearer <AUDIT_ROBOT_TOKEN>) ──────
router.post('/robot/next-job',          robotAuth, postNextJob);
router.post('/robot/jobs/:id/folders',  robotAuth, postLote);
router.post('/robot/jobs/:id/finish',   robotAuth, postFinish);
router.post('/robot/jobs/:id/fail',     robotAuth, postFail);

export default router;
