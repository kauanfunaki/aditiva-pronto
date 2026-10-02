import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { testConnection } from './database/connection';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

const app  = express();
const PORT = parseInt(process.env.PORT || '3001');
const PROD = process.env.NODE_ENV === 'production';

// Atrás do proxy do EasyPanel (um salto): req.ip passa a ser o IP de quem acessou,
// e é por ele que o login limita tentativas.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY ?? (PROD ? '1' : '0'), 10));

// ── Segurança & parsing ───────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc:    ["'self'", 'data:'],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: PROD ? false : '*' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── API ───────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Frontend estático (produção) ──────────────────────────────────
if (PROD) {
  const staticDir = path.resolve(process.cwd(), 'dist/frontend');
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

// ── Tratamento de erros ───────────────────────────────────────────
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────────────
async function main() {
  try {
    await testConnection();
    app.listen(PORT, () => {
      logger.info(`Servidor rodando na porta ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    logger.error('Falha ao iniciar servidor', { error: err });
    process.exit(1);
  }
}

main();
