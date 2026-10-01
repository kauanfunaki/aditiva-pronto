/**
 * Executa um arquivo .sql no MySQL configurado no .env da raiz do repo.
 * Mesmo script do Radar Societário (scripts/run-migration.mjs), adaptado:
 * aqui as credenciais ficam em ./.env, não em src/backend/.env.
 *
 * Existe porque não há client `mysql` no PATH das máquinas de dev — o mysql2 já é
 * dependência do backend, então dá no mesmo. Requer `npm install` em src/backend.
 *
 *   node scripts/run-migration.mjs scripts/migrations/003-auditoria-base.sql --dry-run
 *   node scripts/run-migration.mjs scripts/migrations/003-auditoria-base.sql
 *   node scripts/run-migration.mjs <arquivo.sql> --env caminho/para/outro.env
 *
 * --dry-run apenas lista os statements que seriam executados, sem conectar.
 * --env     usa outro arquivo de variáveis (padrão: .env na raiz do repo).
 *
 * Os statements rodam em sequência para que uma falha aponte qual comando quebrou.
 * `multipleStatements` fica ligado porque as migrações escrevem o trio
 * `PREPARE …; EXECUTE stmt; DEALLOCATE PREPARE stmt` em sequência — o split é
 * por `;` de fim de linha. As migrações são idempotentes, então reexecutar é seguro.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

// Resolve mysql2/dotenv a partir do backend, independente do cwd de quem chamou.
const require = createRequire(new URL('../src/backend/package.json', import.meta.url));
const mysql  = require('mysql2/promise');
const dotenv = require('dotenv');

// fileURLToPath e não `.pathname`: o caminho do repo tem espaço ("1. Apps") e
// pathname devolve percent-encoded (%20), que o fs não resolve.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const envIdx  = args.indexOf('--env');
const envArg  = envIdx >= 0 ? args[envIdx + 1] : null;
const sqlArg  = args.find((a, i) => !a.startsWith('--') && (envIdx < 0 || i !== envIdx + 1));

if (!sqlArg) {
  console.error('Uso: node scripts/run-migration.mjs <arquivo.sql> [--dry-run] [--env arquivo.env]');
  process.exit(1);
}

const sqlPath = path.resolve(sqlArg);
if (!fs.existsSync(sqlPath)) {
  console.error(`Arquivo não encontrado: ${sqlPath}`);
  process.exit(1);
}

/**
 * Quebra o arquivo em statements. As migrações deste projeto não usam `;` no fim
 * de linha dentro de strings nem DELIMITER, então dividir aí é suficiente.
 */
function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(chunk =>
      chunk
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    // `USE aditiva_pronto` das migrações antigas: o banco já vem do .env.
    .filter(s => s && !/^USE\s+\w+$/i.test(s));
}

const statements = splitStatements(fs.readFileSync(sqlPath, 'utf8'));

console.log(`\n${path.basename(sqlPath)} — ${statements.length} statement(s)\n`);

if (dryRun) {
  statements.forEach((s, i) => {
    console.log(`[${String(i + 1).padStart(2)}] ${s.replace(/\s+/g, ' ').slice(0, 140)}`);
  });
  console.log('\n--dry-run: nada foi executado.');
  process.exit(0);
}

const envPath = envArg ? path.resolve(envArg) : path.join(repoRoot, '.env');
if (!fs.existsSync(envPath)) {
  console.error(`.env não encontrado em: ${envPath}`);
  process.exit(1);
}

const envResult = dotenv.config({ path: envPath, override: true });
if (envResult.error) {
  console.error(`Falha ao ler ${envPath}: ${envResult.error.message}`);
  process.exit(1);
}

const dbConfig = {
  host:     process.env.DB_HOST || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'aditiva_pronto',
  user:     process.env.DB_USER || 'aditiva',
  password: process.env.DB_PASS || '',
  // Necessário para o trio PREPARE/EXECUTE/DEALLOCATE. Seguro aqui: o SQL vem de
  // um arquivo versionado do repo, não de entrada de usuário.
  multipleStatements: true,
};

if (!dbConfig.password) {
  console.error(`DB_PASS vazio ou ausente em ${envPath}`);
  process.exit(1);
}

console.log(`Conectando em ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}\n`);

const conn = await mysql.createConnection(dbConfig);

try {
  for (const [i, statement] of statements.entries()) {
    const preview = statement.replace(/\s+/g, ' ').slice(0, 110);
    process.stdout.write(`[${String(i + 1).padStart(2)}/${statements.length}] ${preview}… `);

    const [result] = await conn.query(statement);

    // Blocos multi-statement devolvem um array de resultados; um statement único
    // devolve o resultado direto. Achatar os dois casos para o mesmo formato.
    const results = Array.isArray(result) ? result : [result];

    // Os IF(...) idempotentes viram um SELECT com a mensagem de "já existe" —
    // procurar por essa string em qualquer um dos resultados do bloco.
    const note = results
      .flatMap(r => (Array.isArray(r) ? r : []))
      .flatMap(row => (row && typeof row === 'object' ? Object.values(row) : []))
      .find(v => typeof v === 'string');

    const affected = results
      .filter(r => r && !Array.isArray(r) && typeof r.affectedRows === 'number')
      .reduce((sum, r) => sum + r.affectedRows, 0);

    if (note) console.log(`→ ${note}`);
    else if (affected > 0) console.log(`ok (${affected} linha(s))`);
    else console.log('ok');
  }
  console.log('\nMigração aplicada com sucesso.');
} catch (e) {
  console.error(`\n\nFALHOU: ${e.sqlMessage || e.message}`);
  console.error('As migrações são idempotentes — corrija a causa e rode de novo.');
  process.exitCode = 1;
} finally {
  await conn.end();
}
