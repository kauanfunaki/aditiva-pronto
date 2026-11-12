-- ============================================================
-- Migration 012 — Auditoria: ex-clientes ficam fora da auditoria
-- Compatível com MySQL 8.0+
-- Idempotente: pode ser executado mais de uma vez sem falhar.
-- ============================================================
-- Pedido do Societário em 12/11/2026: a auditoria listava ex-clientes. Quando
-- o cliente sai, a pasta dele vai para "009_EMPRESAS EX CLIENTES" na raiz da
-- rede, mas a empresa continua ativa no app (vem ativa na relação do Domínio).
--
-- O robô (1.2+) passa a listar os nomes das pastas dentro dessa pasta, só os
-- nomes, sem entrar nelas, e manda junto com o fim da varredura. O app casa
-- esses nomes com as empresas pela mesma regra do vínculo automático:
--   - empresa com pasta em Ex Clientes e sem pasta ativa → fora da auditoria
--     (Contratos, Aditivos e Honorários);
--   - empresa com pasta em Ex Clientes E pasta ativa → continua, com aviso.
--
-- 1. au_config.pasta_ex_clientes: nome da pasta (relativo à raiz). NULL desliga.
-- 2. au_sync_jobs.ex_clientes: nomes recebidos na varredura (JSON). NULL =
--    robô antigo, que não manda a lista; o app usa a última lista recebida.
-- ============================================================
-- Execute (credenciais do .env da raiz):
--   node scripts/run-migration.mjs scripts/migrations/012-auditoria-ex-clientes.sql --dry-run
--   node scripts/run-migration.mjs scripts/migrations/012-auditoria-ex-clientes.sql
-- ============================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'au_config' AND COLUMN_NAME = 'pasta_ex_clientes');
SET @sql := IF(@existe = 0,
  'ALTER TABLE au_config ADD COLUMN pasta_ex_clientes VARCHAR(300) NULL COMMENT ''Pasta dos ex-clientes, relativa à raiz (NULL desliga)'' AFTER regex_subpasta_contrato',
  'SELECT ''au_config.pasta_ex_clientes já existe'' AS aviso');
PREPARE passo FROM @sql;
EXECUTE passo;
DEALLOCATE PREPARE passo;

-- Só preenche quando a coluna acabou de nascer vazia (não mexe em valor ajustado à mão).
UPDATE au_config SET pasta_ex_clientes = '009_EMPRESAS EX CLIENTES'
 WHERE id = 1 AND pasta_ex_clientes IS NULL AND @existe = 0;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'au_sync_jobs' AND COLUMN_NAME = 'ex_clientes');
SET @sql := IF(@existe = 0,
  'ALTER TABLE au_sync_jobs ADD COLUMN ex_clientes JSON NULL COMMENT ''Nomes das pastas em Ex Clientes vistos nesta varredura (NULL = robô antigo)'' AFTER arquivos_recebidos',
  'SELECT ''au_sync_jobs.ex_clientes já existe'' AS aviso');
PREPARE passo FROM @sql;
EXECUTE passo;
DEALLOCATE PREPARE passo;

SELECT pasta_ex_clientes FROM au_config WHERE id = 1;
