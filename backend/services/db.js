// ============================================
// Account database (customer users, invites, activity log)
// Version: V2611051
// Purpose: Postgres via DATABASE_URL (Railway). Stores IDENTITY ONLY -
//          usernames, password hashes, invites, who-did-what-when.
//          Never stores customer network data or configs (compliance
//          decision 2026-08-26: project files live on the user's PC).
// Without DATABASE_URL the account features are simply off and the
// env-based admin login keeps working. FACE_DB_MEMORY=1 uses an in-memory
// Postgres (pg-mem, dev dependency) for local testing.
// ============================================

let pool = null;
let ready = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS face_users (
     id SERIAL PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
     org TEXT NOT NULL,
     password_hash TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'customer',
     enabled BOOLEAN NOT NULL DEFAULT TRUE,
     invite_id INTEGER,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     last_login_at TIMESTAMPTZ
   )`,
  `CREATE TABLE IF NOT EXISTS face_invites (
     id SERIAL PRIMARY KEY,
     token_hash TEXT NOT NULL UNIQUE,
     org TEXT NOT NULL,
     note TEXT,
     created_by TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expires_at TIMESTAMPTZ NOT NULL,
     used_at TIMESTAMPTZ,
     used_by TEXT,
     revoked BOOLEAN NOT NULL DEFAULT FALSE
   )`,
  `CREATE TABLE IF NOT EXISTS face_activity (
     id SERIAL PRIMARY KEY,
     username TEXT NOT NULL,
     event TEXT NOT NULL,
     detail TEXT,
     at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`
];

const connect = async () => {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    // Railway's private network needs no TLS; a public proxy URL does
    const isPrivate = /\.railway\.internal/.test(process.env.DATABASE_URL);
    return new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isPrivate || /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
      max: 5
    });
  }
  if (process.env.FACE_DB_MEMORY === '1') {
    const { newDb } = await import('pg-mem');
    const { Pool } = newDb().adapters.createPg();
    console.log('ℹ️  Accounts DB: in-memory (FACE_DB_MEMORY=1) - data is lost on restart');
    return new Pool();
  }
  return null;
};

// Resolves to true when the account DB is usable, false when not configured
export const dbReady = () => {
  if (!ready) {
    ready = (async () => {
      try {
        pool = await connect();
        if (!pool) {
          console.log('ℹ️  Accounts DB: not configured (no DATABASE_URL) - customer accounts disabled');
          return false;
        }
        for (const stmt of SCHEMA) await pool.query(stmt);
        console.log('✓ Accounts DB: connected, schema ready');
        return true;
      } catch (err) {
        console.error('✗ Accounts DB: unavailable -', err.message);
        pool = null;
        return false;
      }
    })();
  }
  return ready;
};

export const query = async (text, params = []) => {
  if (!(await dbReady())) throw new Error('ACCOUNTS_DB_UNAVAILABLE');
  return pool.query(text, params);
};

// Activity log - best effort, never breaks the request it records
export const logActivity = async (username, event, detail = null) => {
  try {
    if (!(await dbReady())) return;
    await pool.query('INSERT INTO face_activity (username, event, detail) VALUES ($1, $2, $3)', [username, event, detail ? String(detail).substring(0, 300) : null]);
  } catch (err) {
    console.error('activity log failed:', err.message);
  }
};
