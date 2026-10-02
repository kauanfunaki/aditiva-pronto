import { Router } from 'express';
import { getMe, postLogin, postLogout } from '../controllers/authController';

/** Sem login: entrar e sair. Montado ANTES do exigirUsuario. */
export const authPublicoRoutes = Router();
authPublicoRoutes.post('/login',  postLogin);
authPublicoRoutes.post('/logout', postLogout);

/** Com login. */
export const authRoutes = Router();
authRoutes.get('/me', getMe);
