-- ============================================================
-- Migration 010 — Honorários: CNPJs citados em cada documento e origem do
--                 valor informado à mão
-- Compatível com MySQL 8.0+
-- Idempotente: pode ser executado mais de uma vez sem falhar.
-- ============================================================
-- Pasta de grupo guarda contratos de várias empresas (caso real CECATTO e
-- E R N PEREIRA, 05/10/2026): o leitor passa a guardar os CNPJs citados no
-- texto para não usar o honorário do contrato de outra empresa.
-- O valor informado à mão ganha a origem: 'digitado' (a pessoa digitou) ou
-- 'acessorias' (botão "Acessórias está certo": a leitura da pasta estava errada).
--
-- RODAR ANTES DO DEPLOY: a coluna é nova e opcional, o código antigo não a usa;
-- o código novo grava nela. No primeiro acesso à tela de Honorários depois do
-- deploy, o app relê os textos já guardados (leitor v2), sem ir à rede.
-- ============================================================
-- Execute (credenciais do .env da raiz):
--   node scripts/run-migration.mjs scripts/migrations/010-honorarios-cnpjs-e-origem.sql --dry-run
--   node scripts/run-migration.mjs scripts/migrations/010-honorarios-cnpjs-e-origem.sql
-- ============================================================

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'au_textos' AND COLUMN_NAME = 'cnpjs');

SET @sql := IF(@existe = 0,
  'ALTER TABLE au_textos ADD COLUMN cnpjs VARCHAR(600) NULL COMMENT ''CNPJs citados (só dígitos, separados por vírgula, sem o da 041)'' AFTER trecho',
  'SELECT ''coluna cnpjs já existe'' AS aviso');

PREPARE passo FROM @sql;

EXECUTE passo;

DEALLOCATE PREPARE passo;

SET @existe := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'au_honorarios_manuais' AND COLUMN_NAME = 'origem');

SET @sql := IF(@existe = 0,
  'ALTER TABLE au_honorarios_manuais ADD COLUMN origem ENUM(''digitado'', ''acessorias'') NOT NULL DEFAULT ''digitado'' COMMENT ''digitado = a pessoa digitou; acessorias = confirmou o valor do Acessórias'' AFTER observacao',
  'SELECT ''coluna origem já existe'' AS aviso');

PREPARE passo FROM @sql;

EXECUTE passo;

DEALLOCATE PREPARE passo;

SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'au_textos' AND COLUMN_NAME = 'cnpjs') AS coluna_cnpjs,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'au_honorarios_manuais' AND COLUMN_NAME = 'origem') AS coluna_origem;
