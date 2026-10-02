-- ============================================================
-- Migration 008 — Honorários (texto dos documentos, valor lido,
-- valor informado à mão e integração com o Acessórias)
-- Compatível com MySQL 8.0+
-- Idempotente: pode ser executado mais de uma vez sem falhar.
-- ============================================================
-- Plano: docs/PLANO-AUDITORIA-CONTRATOS-ADITIVOS.md (seção 11).
-- Decisão de 02/10: vai para o Acessórias o honorário do documento mais
-- recente (contrato ou termo aditivo de honorário), sem correção pelo IPCA.
--
-- Sem FK para companies, pelo mesmo motivo da 003 (collation de
-- companies em produção não conferida). O app valida a empresa.
-- ============================================================
-- Execute (credenciais do .env da raiz):
--   node scripts/run-migration.mjs scripts/migrations/008-honorarios.sql --dry-run
--   node scripts/run-migration.mjs scripts/migrations/008-honorarios.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. au_textos — texto extraído pelo robô de cada PDF/DOCX das
--    subpastas de contrato, e o que o app leu dele.
--    Chave: SHA-256 de nome_pasta + "\n" + caminho_relativo. A linha
--    vale para a versão do arquivo (modificado_em + tamanho); se o
--    arquivo mudar, o robô lê de novo.
--    As colunas do honorário são recalculadas quando o leitor muda
--    (leitor_versao), sem precisar ler a rede outra vez.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_textos (
  chave                 CHAR(64)       NOT NULL,
  nome_pasta            VARCHAR(300)   CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  caminho_relativo      VARCHAR(1000)  NOT NULL,
  modificado_em         DATETIME       NOT NULL,
  tamanho               BIGINT UNSIGNED NOT NULL,
  status                ENUM('ok','sem_texto','erro') NOT NULL,
  paginas               SMALLINT UNSIGNED NULL,
  texto                 MEDIUMTEXT     NULL,
  erro                  VARCHAR(500)   NULL,
  extraido_em           DATETIME(3)    NOT NULL,
  robo_versao           VARCHAR(30)    NULL,

  leitor_versao         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  tipo_documento        ENUM('contrato','aditivo','outro') NULL,
  data_documento        DATE           NULL,
  honorario             DECIMAL(12,2)  NULL,
  adicional_funcionario DECIMAL(12,2)  NULL,
  forma_leitura         VARCHAR(20)    NULL,           -- novo_valor | valor_mensal | mencao
  condicional           TINYINT(1)     NULL,           -- valor amarrado a faixa de faturamento
  trecho                VARCHAR(600)   NULL,

  PRIMARY KEY (chave),
  INDEX idx_au_textos_pasta (nome_pasta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. au_honorarios_manuais — valor informado por uma pessoa
--    (contrato digitalizado, leitura errada). Vence o valor lido.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_honorarios_manuais (
  company_id     CHAR(36)      NOT NULL,
  valor          DECIMAL(12,2) NOT NULL,
  documento      VARCHAR(1000) NULL,                   -- arquivo de onde o valor foi tirado
  observacao     VARCHAR(300)  NULL,
  informado_por  VARCHAR(150)  NOT NULL,               -- conta do setor (login)
  informado_em   DATETIME(3)   NOT NULL,

  PRIMARY KEY (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. au_acessorias_empresas — última leitura das empresas no
--    Acessórias (botão "Conferir no Acessórias").
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_acessorias_empresas (
  cnpj_digitos   VARCHAR(14)   NOT NULL,
  identificador  VARCHAR(20)   NOT NULL,               -- como o Acessórias devolve (com máscara)
  acessorias_id  VARCHAR(20)   NULL,
  razao          VARCHAR(300)  NULL,
  situacao       VARCHAR(50)   NULL,
  honorario      DECIMAL(12,2) NULL,
  lido_em        DATETIME(3)   NOT NULL,

  PRIMARY KEY (cnpj_digitos)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. au_acessorias_envios — cada atualização de honorário enviada.
--    Guarda a ficha da empresa ANTES e DEPOIS: se o Acessórias mexer
--    em outro campo além do honorário, os envios travam até alguém
--    conferir (conferido_em) e dá para restaurar à mão.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_acessorias_envios (
  id                   CHAR(36)      NOT NULL,
  company_id           CHAR(36)      NOT NULL,
  cnpj_digitos         VARCHAR(14)   NOT NULL,
  razao_social         VARCHAR(300)  NOT NULL,
  valor_anterior       DECIMAL(12,2) NULL,
  valor_enviado        DECIMAL(12,2) NOT NULL,
  fonte                ENUM('documento','manual') NOT NULL,
  documento            VARCHAR(1000) NULL,
  conta                VARCHAR(100)  NOT NULL,
  ip                   VARCHAR(64)   NULL,
  status               ENUM('ok','erro') NOT NULL,
  erro                 VARCHAR(1000) NULL,
  outros_campos        JSON          NULL,             -- campos que mudaram além do honorário
  ficha_antes          JSON          NULL,
  ficha_depois         JSON          NULL,
  enviado_em           DATETIME(3)   NOT NULL,
  conferido_em         DATETIME(3)   NULL,
  conferido_por        VARCHAR(100)  NULL,

  PRIMARY KEY (id),
  INDEX idx_au_acessorias_envios_empresa (company_id, enviado_em),
  INDEX idx_au_acessorias_envios_data (enviado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 008 aplicada com sucesso.' AS status;
