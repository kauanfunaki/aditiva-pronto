-- ============================================================
-- Migration 007 — Login no app (contas e sessões)
-- Compatível com MySQL 8.0+
-- Idempotente: pode ser executado mais de uma vez sem falhar.
-- ============================================================
-- Substitui o ADR-006 ("sem autenticação no MVP"): o app passa a exigir
-- login (ADR-008). São poucas contas compartilhadas por setor
-- (Societário, Controladoria), sem perfis, e a mesma conta pode estar
-- aberta em vários computadores ao mesmo tempo (uma sessão por login).
-- O robô da auditoria continua entrando com o AUDIT_ROBOT_TOKEN e não
-- usa estas tabelas.
--
-- Prefixo ap_ (Aditiva Pronto) porque o banco é compartilhado com o
-- Radar Societário (rs_).
--
-- Senha: hash scrypt com sal (formato em src/backend/src/services/senha.ts).
-- Sessão: o cookie leva um token aleatório; o banco guarda só o SHA-256
-- dele, então um vazamento desta tabela não abre sessão de ninguém.
-- ============================================================
-- Execute (credenciais do .env da raiz):
--   node scripts/run-migration.mjs scripts/migrations/007-login.sql --dry-run
--   node scripts/run-migration.mjs scripts/migrations/007-login.sql
-- Depois, crie as contas (o script mostra a senha gerada uma vez):
--   npm --prefix src/backend run conta -- --login societario --nome "Societário"
--   npm --prefix src/backend run conta -- --login controladoria --nome "Controladoria"
-- ============================================================

CREATE TABLE IF NOT EXISTS ap_usuarios (
  id              CHAR(36)     NOT NULL,
  login           VARCHAR(100) NOT NULL,             -- sempre minúsculo
  nome            VARCHAR(150) NOT NULL,
  senha_hash      VARCHAR(255) NOT NULL,
  ativo           TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em       DATETIME(3)  NOT NULL,
  atualizado_em   DATETIME(3)  NOT NULL,
  ultimo_login_em DATETIME(3)  NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_ap_usuarios_login (login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ap_sessoes (
  id         CHAR(64)     NOT NULL,                  -- SHA-256 (hex) do token do cookie
  usuario_id CHAR(36)     NOT NULL,
  criada_em  DATETIME(3)  NOT NULL,
  expira_em  DATETIME(3)  NOT NULL,
  ip         VARCHAR(64)  NULL,
  user_agent VARCHAR(300) NULL,

  PRIMARY KEY (id),
  INDEX idx_ap_sessoes_usuario (usuario_id),
  INDEX idx_ap_sessoes_expira  (expira_em),
  CONSTRAINT fk_ap_sessoes_usuario
    FOREIGN KEY (usuario_id) REFERENCES ap_usuarios(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration 007 aplicada com sucesso.' AS status;
