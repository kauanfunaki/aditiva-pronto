-- ============================================================
-- Migration 009 — Auditoria: o robô passa a varrer as subpastas de DISTRATO
-- Compatível com MySQL 8.0+
-- Idempotente: pode ser executado mais de uma vez sem falhar.
-- ============================================================
-- O distrato da prestação de serviços fica numa subpasta própria da pasta do
-- cliente ("DISTRATO DE PRESTAÇÃO DE SERVIÇOS", "DISTRATO BPO"…), ao lado da do
-- contrato. A regex das subpastas varridas está em au_config e chega ao robô a
-- cada job: trocar aqui basta, sem reinstalar o robô.
--
-- Só troca se ainda estiver no padrão antigo (não mexe em regex ajustada à mão).
-- Depois de aplicar: clicar em "Sincronizar" (ou esperar a sincronização das 06:00)
-- para os distratos entrarem no inventário; o robô lê o texto deles em seguida.
-- ============================================================
-- Execute (credenciais do .env da raiz):
--   node scripts/run-migration.mjs scripts/migrations/009-auditoria-distrato.sql --dry-run
--   node scripts/run-migration.mjs scripts/migrations/009-auditoria-distrato.sql
-- ============================================================

UPDATE au_config
   SET regex_subpasta_contrato = '^(CONTRATOS? (DE )?(P |PREST|SERVI|HONOR)|DISTRATO)'
 WHERE id = 1
   AND regex_subpasta_contrato = '^CONTRATOS? (DE )?(P |PREST|SERVI|HONOR)';

SELECT regex_subpasta_contrato AS regex_atual FROM au_config WHERE id = 1;
