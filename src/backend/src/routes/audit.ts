import { Router } from 'express';
import { robotAuth } from '../middleware/robotAuth';
import {
  getStatus, postSync, getFolders, putFolderLink, putEmpresaSemPasta,
  postNextJob, postLote, postFinish, postFail, postTextosPendentes, postTextos,
} from '../controllers/auditBaseController';

// Auditoria de Contratos e Aditivos — base comum (Fase 1).
// Os módulos montam as próprias rotas de leitura em /api/audit/aditivos e /api/audit/contratos.

const router = Router();

// ── Tela (exige login: montada depois do exigirUsuario) ───────────
router.get('/status',        getStatus);
router.post('/sync',         postSync);
router.get('/folders',       getFolders);
router.put('/folders/link',  putFolderLink);
router.put('/companies/sem-pasta', putEmpresaSemPasta);

export default router;

// ── Robô coletor (Authorization: Bearer <AUDIT_ROBOT_TOKEN>) ──────
// Montado em /api/audit/robot ANTES do exigirUsuario: o robô não tem login,
// só o token. As URLs continuam as mesmas para o robô.
export const auditRobotRoutes = Router();
auditRobotRoutes.use(robotAuth);
auditRobotRoutes.post('/next-job',          postNextJob);
auditRobotRoutes.post('/jobs/:id/folders',  postLote);
auditRobotRoutes.post('/jobs/:id/finish',   postFinish);
auditRobotRoutes.post('/jobs/:id/fail',     postFail);
auditRobotRoutes.post('/texts/pending',     postTextosPendentes);   // honorário: o que ler
auditRobotRoutes.post('/texts',             postTextos);            // honorário: texto lido
