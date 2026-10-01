-- ============================================================
-- Migration 003 — Auditoria de Contratos e Aditivos: base comum
-- Compatível com MySQL 8.0+
-- Idempotente: pode ser executado mais de uma vez sem falhar.
-- ============================================================
-- Plano: docs/PLANO-AUDITORIA-CONTRATOS-ADITIVOS.md (seção 8)
--
-- Tabelas com prefixo au_ porque o banco aditiva_pronto é
-- compartilhado com o Radar Societário (prefixo rs_).
--
-- Nomes de pasta usam COLLATE utf8mb4_bin: duas pastas que
-- diferem só por acento ou caixa são pastas diferentes na rede.
-- ============================================================
-- Execute (credenciais do .env da raiz; não precisa do client mysql):
--   node scripts/run-migration.mjs scripts/migrations/003-auditoria-base.sql --dry-run
--   node scripts/run-migration.mjs scripts/migrations/003-auditoria-base.sql
-- Ou, com o client mysql:
--   mysql -u <user> -p <database> < scripts/migrations/003-auditoria-base.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. au_config — linha única com os parâmetros da varredura.
--    O app grava os valores padrão na primeira leitura
--    (auditRepository.obterConfig), então não há seed aqui.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_config (
  id                      TINYINT      NOT NULL DEFAULT 1,
  raiz_unc                VARCHAR(300) NOT NULL,
  pasta_inicial           VARCHAR(300) NOT NULL,
  pasta_final             VARCHAR(300) NOT NULL,
  regex_subpasta_contrato VARCHAR(500) NOT NULL,
  horario_agendado        CHAR(5)      NULL,        -- 'HH:MM' em America/Sao_Paulo; NULL = sem sincronização automática
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  CONSTRAINT chk_au_config_linha_unica CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. au_sync_jobs — fila de sincronizações.
--    Horários com milissegundos: vários jobs podem terminar no mesmo
--    segundo, e a tela precisa saber qual foi o último.
--    `ativo` vale 1 enquanto o job está pendente/executando e
--    NULL depois. O índice único garante no máximo UM job ativo,
--    mesmo com dois cliques simultâneos.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_sync_jobs (
  id                 CHAR(36)     NOT NULL,
  status             ENUM('pendente','executando','concluido','erro') NOT NULL DEFAULT 'pendente',
  origem             ENUM('manual','agendado') NOT NULL DEFAULT 'manual',
  solicitado_em      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  iniciado_em        DATETIME(3)  NULL,
  ultimo_lote_em     DATETIME(3)  NULL,
  concluido_em       DATETIME(3)  NULL,
  robo_host          VARCHAR(100) NULL,
  pastas_total       INT UNSIGNED NULL,
  pastas_recebidas   INT UNSIGNED NOT NULL DEFAULT 0,
  arquivos_recebidos INT UNSIGNED NOT NULL DEFAULT 0,
  erro               TEXT         NULL,
  ativo              TINYINT GENERATED ALWAYS AS (IF(status IN ('pendente','executando'), 1, NULL)) STORED,

  PRIMARY KEY (id),
  UNIQUE KEY uq_au_sync_jobs_um_ativo (ativo),
  INDEX idx_au_sync_jobs_status (status, solicitado_em),
  INDEX idx_au_sync_jobs_solicitado (solicitado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. au_robot_heartbeat — último contato de cada robô.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_robot_heartbeat (
  host     VARCHAR(100) NOT NULL,
  versao   VARCHAR(30)  NULL,
  visto_em DATETIME(3)  NOT NULL,

  PRIMARY KEY (host)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. au_folders — pastas de cliente vistas em cada job.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_folders (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id             CHAR(36)     NOT NULL,
  nome_pasta         VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  subpastas_contrato JSON         NOT NULL,
  erro               VARCHAR(1000) NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_au_folders_job_pasta (job_id, nome_pasta),
  CONSTRAINT fk_au_folders_job
    FOREIGN KEY (job_id) REFERENCES au_sync_jobs(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. au_files — arquivos dentro das subpastas de contrato.
--    pdf_assinado: NULL = não é PDF ou não foi lido.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_files (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id           CHAR(36)      NOT NULL,
  folder_id        BIGINT UNSIGNED NOT NULL,
  caminho_relativo VARCHAR(1000) NOT NULL,
  nome             VARCHAR(300)  NOT NULL,
  ext              VARCHAR(20)   NOT NULL,
  tamanho          BIGINT UNSIGNED NOT NULL,
  modificado_em    DATETIME      NOT NULL,
  pdf_assinado     TINYINT(1)    NULL,
  pdf_marca        VARCHAR(20)   NULL,

  PRIMARY KEY (id),
  INDEX idx_au_files_job_folder (job_id, folder_id),
  CONSTRAINT fk_au_files_folder
    FOREIGN KEY (folder_id) REFERENCES au_folders(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. au_folder_links — vínculo pasta ↔ empresa.
--    Independe dos jobs: sobrevive entre sincronizações.
--    tipo 'auto'       = nome igual depois de normalizar (feito pelo app)
--    tipo 'confirmado' = escolhido por uma pessoa
--    tipo 'ignorado'   = pasta que não é cliente (SCANNER, CERTIFICADOS…)
--
--    Sem FK para companies de propósito: a collation de companies
--    em produção não foi conferida, e uma FK com collation diferente
--    faria esta migration falhar no meio. O app valida a empresa ao
--    vincular, e as consultas usam LEFT JOIN.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS au_folder_links (
  nome_pasta   VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  company_id   CHAR(36)     NULL,
  tipo         ENUM('auto','confirmado','ignorado') NOT NULL,
  vinculado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (nome_pasta),
  INDEX idx_au_folder_links_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 003 aplicada com sucesso.' AS status;
