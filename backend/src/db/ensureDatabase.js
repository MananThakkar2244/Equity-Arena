const net = require('net');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Make sure there is a Postgres to talk to before the server boots.
 *
 * The app is happiest against a real database you manage — Docker, Homebrew, a
 * hosted instance. But when DATABASE_URL points at localhost and nothing is
 * listening there, `npm run dev` used to come up "running" and then spew
 * connection errors on every tick, which reads like the backend is broken when
 * it is only missing a database.
 *
 * So: probe the port first, and only if it is dead do we start the bundled
 * Postgres in-process. Anything already listening is left strictly alone, and a
 * non-local DATABASE_URL is never touched.
 */

const BACKEND_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(BACKEND_ROOT, '.pgdata');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function parseDatabaseUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      host: url.hostname,
      port: Number(url.port) || 5432,
      user: decodeURIComponent(url.username) || 'postgres',
      password: decodeURIComponent(url.password) || 'postgres',
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres'
    };
  } catch {
    return null;
  }
}

/** Is anything accepting TCP connections there? */
function canConnect(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host === '::1' ? '127.0.0.1' : host);
  });
}

function run(command, args) {
  execFileSync(command, args, { cwd: BACKEND_ROOT, stdio: 'inherit' });
}

/**
 * Create the tables and seed the board, but only when they are actually
 * missing. `db push` is non-destructive and seeding is gated on an empty
 * listings table, so restarting the server never wipes anybody's trades.
 */
async function ensureSchema() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  let stockCount = null;
  try {
    stockCount = await prisma.stock.count();
  } catch {
    stockCount = null; // relation does not exist yet
  } finally {
    await prisma.$disconnect().catch(() => {});
  }

  if (stockCount === null) {
    console.log('🧱 No schema found — creating tables…');
    run(path.join(BACKEND_ROOT, 'node_modules', '.bin', 'prisma'), ['db', 'push', '--skip-generate']);
  }

  if (stockCount === null || stockCount === 0) {
    console.log('🌱 No listings found — seeding the exchange…');
    run(process.execPath, [path.join('prisma', 'seed.js')]);
  }
}

async function ensureDatabase() {
  const cfg = parseDatabaseUrl(process.env.DATABASE_URL);

  if (!cfg) {
    console.warn('⚠️  DATABASE_URL is missing or unparseable — skipping database startup.');
    return null;
  }

  const isLocal = LOCAL_HOSTS.has(cfg.host);

  if (await canConnect(cfg.host, cfg.port)) {
    console.log(`🗄️  Using the Postgres already running at ${cfg.host}:${cfg.port}`);
    // A local server you just started — Docker, Homebrew — is typically empty,
    // and an empty database fails exactly like a missing one. Remote databases
    // are left alone: their schema belongs to a deploy step, not to boot.
    if (isLocal) await ensureSchema();
    return null;
  }

  if (!isLocal) {
    // A remote database we cannot reach is a network or credentials problem,
    // and silently booting a local stand-in would hide it.
    console.error(`❌ Cannot reach the database at ${cfg.host}:${cfg.port}. Check DATABASE_URL and your network.`);
    return null;
  }

  console.log(`🗄️  Nothing on ${cfg.host}:${cfg.port} — starting the bundled Postgres…`);

  const EmbeddedPostgres = require('embedded-postgres').default;
  const firstRun = !fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    persistent: true
  });

  if (firstRun) {
    console.log('   initialising a new cluster (first run only, this takes a moment)…');
    await pg.initialise();
  }

  await pg.start();

  try {
    await pg.createDatabase(cfg.database);
  } catch {
    // Already there from a previous run — that is the happy path.
  }

  console.log(`✅ Postgres ready on port ${cfg.port} (data in backend/.pgdata)`);

  await ensureSchema();

  const shutdown = async () => {
    try {
      await pg.stop();
    } catch {
      /* going down anyway */
    }
  };

  process.once('SIGINT', async () => {
    await shutdown();
    process.exit(0);
  });
  process.once('SIGTERM', async () => {
    await shutdown();
    process.exit(0);
  });

  return shutdown;
}

module.exports = { ensureDatabase };
