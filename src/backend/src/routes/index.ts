import { Router } from 'express';
import { uploadXlsx } from '../middleware/upload';
import { importFile, syncFromDir }  from '../controllers/importController';
import {
  getStats, listCompanies, getCompany,
  saveComplement, previewCompany, generateDocument, getDocuments,
  patchResponsavel, bulkPatchResponsavel, patchStatus,
} from '../controllers/companyController';
import { downloadDocument } from '../controllers/documentController';
import { exportCompaniesReport } from '../controllers/reportController';
import {
  getResponsaveis, postResponsavel, patchResponsavelNome, removeResponsavel,
} from '../controllers/responsaveisController';
import auditRoutes from './audit';
import auditAditivosRoutes from './auditAditivos';
import auditContratosRoutes from './auditContratos';

const router = Router();

// ── Health ────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Dashboard ─────────────────────────────────────────────────────
router.get('/stats', getStats);

// ── Import ────────────────────────────────────────────────────────
router.post('/import/companies', uploadXlsx, importFile);
router.post('/import/sync',      syncFromDir);

// ── Companies ─────────────────────────────────────────────────────
router.get('/companies',                        listCompanies);
// bulk deve vir antes de /:id para não ser capturado como id='bulk'
router.patch('/companies/bulk/responsavel',     bulkPatchResponsavel);
router.get('/companies/:id',                    getCompany);
router.put('/companies/:id/complement',         saveComplement);
router.get('/companies/:id/preview',            previewCompany);
router.post('/companies/:id/generate-docx',     generateDocument);
router.get('/companies/:id/documents',          getDocuments);
router.patch('/companies/:id/responsavel',      patchResponsavel);
router.patch('/companies/:id/status',           patchStatus);

// ── Documents ─────────────────────────────────────────────────────
router.get('/documents/:id/download', downloadDocument);

// ── Reports ───────────────────────────────────────────────────────
router.post('/reports/companies/export', exportCompaniesReport);

// ── Responsáveis ──────────────────────────────────────────────────
router.get('/responsaveis',        getResponsaveis);
router.post('/responsaveis',       postResponsavel);
router.patch('/responsaveis/:id',  patchResponsavelNome);
router.delete('/responsaveis/:id', removeResponsavel);

// ── Auditoria de Contratos e Aditivos ─────────────────────────────
router.use('/audit/aditivos', auditAditivosRoutes);
router.use('/audit/contratos', auditContratosRoutes);
router.use('/audit', auditRoutes);

export default router;
