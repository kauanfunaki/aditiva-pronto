import { Router } from 'express';
import {
  deleteManual, getEnvios, getEstadoAcessorias, getRelatorio, postAcessoriasCerto, postConferido, postConferir,
  postEnviar, postEnviarLote, putManual,
} from '../controllers/honorariosController';

// Honorários (migration 008). Montado depois do exigirUsuario: tudo aqui exige login.
const router = Router();

router.get('/',                                  getRelatorio);
router.put('/:companyId/manual',                 putManual);
router.delete('/:companyId/manual',              deleteManual);
router.post('/:companyId/acessorias-certo',      postAcessoriasCerto);

router.get('/acessorias',                        getEstadoAcessorias);
router.post('/acessorias/conferir',              postConferir);
router.post('/acessorias/enviar',                postEnviar);
router.post('/acessorias/enviar-lote',           postEnviarLote);
router.get('/acessorias/envios',                 getEnvios);
router.post('/acessorias/envios/:id/conferido',  postConferido);

export default router;
