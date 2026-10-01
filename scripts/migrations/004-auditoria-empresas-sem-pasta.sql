-- ============================================================
-- Migration 004 — Auditoria: empresas marcadas como "sem pasta"
-- Compatível com MySQL 8.0+
-- Idempotente: pode ser executado mais de uma vez sem falhar.
-- ============================================================
-- Plano: docs/PLANO-AUDITORIA-CONTRATOS-ADITIVOS.md (seção 8.1)
--
-- Empresa ativa que não tem pasta na rede DE PROPÓSITO. Fica fora da
-- auditoria (Contratos e Aditivos): não conta como pendência nem entra no
-- percentual de "em dia". Desmarcar devolve a empresa para a auditoria.
--
-- Sem FK para companies, pelo mesmo motivo da 003 (collation de
-- companies em produção não conferida). O app valida a empresa.
-- ============================================================
-- Execute (credenciais do .env da raiz):
--   node scripts/run-migration.mjs scripts/migrations/004-auditoria-empresas-sem-pasta.sql --dry-run
--   node scripts/run-migration.mjs scripts/migrations/004-auditoria-empresas-sem-pasta.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS au_empresas_sem_pasta (
  company_id CHAR(36)     NOT NULL,
  motivo     VARCHAR(300) NULL,
  marcado_em DATETIME(3)  NOT NULL,

  PRIMARY KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 004 aplicada com sucesso.' AS status;
