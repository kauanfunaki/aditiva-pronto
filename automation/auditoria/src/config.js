'use strict';

const os = require('node:os');
const path = require('node:path');
const { carregarEnv } = require('./env');
const pacote = require('../package.json');

/** Pasta dos clientes (J:). Trocar só pelo .env (AUDIT_RAIZ_PERMITIDA). */
const RAIZ_PERMITIDA_PADRAO = String.raw`\\192.168.140.249\Contabilidade`;

function inteiroPositivo(nome, padrao) {
  const texto = process.env[nome];
  if (texto === undefined || texto.trim() === '') return padrao;
  const valor = Number(texto);
  if (!Number.isSafeInteger(valor) || valor <= 0) {
    throw new Error(`${nome} precisa ser um número inteiro positivo.`);
  }
  return valor;
}

function obrigatoria(nome) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`${nome} não foi configurada. Copie .env.example para .env e preencha-a.`);
  return valor;
}

function carregarConfig() {
  carregarEnv(path.resolve(__dirname, '..', '.env'));

  const apiBaseUrl = obrigatoria('AUDIT_API_BASE_URL').replace(/\/+$/, '');
  let url;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    throw new Error('AUDIT_API_BASE_URL precisa ser uma URL válida.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('AUDIT_API_BASE_URL precisa usar http ou https.');
  }

  const token = obrigatoria('AUDIT_ROBOT_TOKEN');
  const host = (process.env.AUDIT_ROBOT_HOST || os.hostname()).trim();
  if (!host) throw new Error('Não foi possível determinar o nome da máquina do robô.');
  if (host.length > 100) throw new Error('AUDIT_ROBOT_HOST pode ter no máximo 100 caracteres.');

  return {
    apiBaseUrl,
    token,
    host,
    versao: pacote.version,
    pollIntervalMs: inteiroPositivo('AUDIT_POLL_INTERVAL_MS', 15_000),
    requestTimeoutMs: inteiroPositivo('AUDIT_REQUEST_TIMEOUT_MS', 30_000),
    retryAttempts: inteiroPositivo('AUDIT_RETRY_ATTEMPTS', 3),
    logLevel: (process.env.AUDIT_LOG_LEVEL || 'info').toLowerCase(),
    // Única raiz de onde o robô lê CONTEÚDO de documento (texto para o honorário).
    // Fica no robô, não no servidor: uma configuração alterada no app não amplia o acesso.
    raizPermitida: (process.env.AUDIT_RAIZ_PERMITIDA || RAIZ_PERMITIDA_PADRAO).trim(),
    executarUmaVez: process.argv.includes('--once'),
  };
}

module.exports = { carregarConfig, inteiroPositivo };
