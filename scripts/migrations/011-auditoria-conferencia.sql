-- ============================================================
-- Migration 011 — Auditoria: conferência manual (Resolvido / Pendente + comentário)
-- Compatível com MySQL 8.0+
-- Idempotente: pode ser executado mais de uma vez sem falhar.
-- ============================================================
-- Pedido do Societário em 11/11/2026: o robô não acerta todos os contratos e
-- aditivos (nome de arquivo fora do padrão), e a equipe confere à mão. Cada
-- empresa ganha, em Contratos e em Aditivos, uma situação da conferência
-- (pendente / resolvido) e um comentário. "Resolvido" tira a empresa da lista
-- de pendentes; a classificação automática continua aparecendo ao lado.
--
-- Uma linha por empresa + módulo + ano:
--   - aditivos: o ano de referência da tela (resolver 2026 não resolve 2027);
--   - contratos: ano = 0 (o contrato não é anual).
-- Sem linha = pendente e sem comentário.
--
-- Sem FK para companies, pelo mesmo motivo da 003/004 (collation de companies
-- em produção não conferida). O app valida a empresa antes de gravar.
-- ============================================================
-- Execute (credenciais do .env da raiz):
--   node scripts/run-migration.mjs scripts/migrations/011-auditoria-conferencia.sql --dry-run
--   node scripts/run-migration.mjs scripts/migrations/011-auditoria-conferencia.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS au_conferencias (
  company_id     CHAR(36)                        NOT NULL,
  modulo         ENUM('contratos','aditivos')    NOT NULL,
  ano            SMALLINT UNSIGNED               NOT NULL DEFAULT 0,
  situacao       ENUM('pendente','resolvido')    NOT NULL DEFAULT 'pendente',
  comentario     TEXT                            NULL,
  atualizado_por VARCHAR(100)                    NOT NULL,
  atualizado_em  DATETIME(3)                     NOT NULL,

  PRIMARY KEY (company_id, modulo, ano),
  INDEX idx_au_conferencias_modulo (modulo, ano)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 011 aplicada com sucesso.' AS status;
