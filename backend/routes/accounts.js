// ============================================
// Customer Accounts Routes
// Version: V2611051
// Purpose: single-use invite links -> customer accounts; admin user
//          management; activity log. Identity only - no network data.
// ============================================

import express from 'express';
import crypto from 'crypto';
import authService from '../services/authService.js';
import { query, dbReady, dbStatus, logActivity } from '../services/db.js';
import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const USERNAME_RE = /^[A-Za-z0-9._-]{3,32}$/;
const MIN_PASSWORD = 10;

const passwordProblem = (pw) => {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (pw.length > 128) return 'Password is too long';
  return null;
};

const dbOff = (res) => res.status(503).json({ error: 'Customer accounts are not set up yet (no database connected)', code: 'ACCOUNTS_DB_UNAVAILABLE' });

// Look up a usable invite by its raw token
const findInvite = async (token) => {
  if (!token || token.length < 20) return null;
  const r = await query('SELECT * FROM face_invites WHERE token_hash = $1', [sha256(token)]);
  const inv = r.rows[0];
  if (!inv || inv.revoked || inv.used_at || new Date(inv.expires_at) < new Date()) return null;
  return inv;
};

// ===== PUBLIC: invite links =====
export const joinRouter = express.Router();

joinRouter.get('/:token', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  const inv = await findInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This invite link is invalid, already used, or expired. Ask your Extreme Networks SE for a new one.' });
  res.json({ success: true, org: inv.org, expiresAt: inv.expires_at });
});

joinRouter.post('/:token', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  const { username, password } = req.body || {};
  const name = String(username || '').trim();
  if (!USERNAME_RE.test(name)) return res.status(400).json({ error: 'Username: 3-32 characters, letters, numbers, dot, dash or underscore' });
  if (authService.users.has(name)) return res.status(400).json({ error: 'That username is taken' });
  const pwErr = passwordProblem(password);
  if (pwErr) return res.status(400).json({ error: pwErr });

  const inv = await findInvite(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This invite link is invalid, already used, or expired.' });

  const taken = await query('SELECT 1 FROM face_users WHERE LOWER(username) = LOWER($1)', [name]);
  if (taken.rows.length) return res.status(400).json({ error: 'That username is taken' });

  // Claim the invite first (single use) - only one request can flip used_at
  const claim = await query('UPDATE face_invites SET used_at = NOW(), used_by = $1 WHERE id = $2 AND used_at IS NULL RETURNING id', [name, inv.id]);
  if (!claim.rows.length) return res.status(409).json({ error: 'This invite link was just used.' });

  try {
    const hash = await authService.hashCustomerPassword(password);
    await query('INSERT INTO face_users (username, org, password_hash, role, invite_id) VALUES ($1, $2, $3, $4, $5)', [name, inv.org, hash, 'customer', inv.id]);
  } catch (err) {
    // roll the claim back so the customer can retry with another username
    await query('UPDATE face_invites SET used_at = NULL, used_by = NULL WHERE id = $1', [inv.id]);
    return res.status(400).json({ error: 'Could not create the account - try a different username' });
  }
  await logActivity(name, 'account-created', `invite #${inv.id} (${inv.org})`);

  const user = { username: name, role: 'customer', org: inv.org, email: '' };
  res.json({ success: true, token: authService.generateToken(user), user });
});

// ===== CUSTOMER: own account =====
export const accountRouter = express.Router();

accountRouter.post('/password', authMiddleware, async (req, res) => {
  if (req.user.role !== 'customer') return res.status(400).json({ error: 'Admin password is managed in Railway (VALID_USERS)' });
  const { currentPassword, newPassword } = req.body || {};
  const pwErr = passwordProblem(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    await authService.authenticate(req.user.username, currentPassword, { record: false });
  } catch {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  const hash = await authService.hashCustomerPassword(newPassword);
  await query('UPDATE face_users SET password_hash = $1 WHERE username = $2', [hash, req.user.username]);
  await logActivity(req.user.username, 'password-changed');
  res.json({ success: true });
});

// ===== ADMIN =====
export const adminRouter = express.Router();
adminRouter.use(authMiddleware, requireRole('admin'));

adminRouter.get('/status', async (req, res) => {
  const s = await dbStatus();
  res.json({ success: true, accountsEnabled: s.ready, reason: s.error });
});

adminRouter.post('/invites', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  const org = String((req.body || {}).org || '').trim().substring(0, 100);
  const note = String((req.body || {}).note || '').trim().substring(0, 200) || null;
  const days = Math.min(Math.max(parseInt((req.body || {}).days) || 7, 1), 30);
  if (!org) return res.status(400).json({ error: 'Customer / organization name is required' });
  const token = crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + days * 86400000);
  const r = await query('INSERT INTO face_invites (token_hash, org, note, created_by, expires_at) VALUES ($1, $2, $3, $4, $5) RETURNING id', [sha256(token), org, note, req.user.username, expires]);
  await logActivity(req.user.username, 'invite-created', `#${r.rows[0].id} ${org} (${days}d)`);
  // The raw token is returned ONCE - only its hash is stored
  res.json({ success: true, id: r.rows[0].id, token, org, expiresAt: expires });
});

adminRouter.get('/invites', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  const r = await query('SELECT id, org, note, created_by, created_at, expires_at, used_at, used_by, revoked FROM face_invites ORDER BY id DESC LIMIT 100');
  res.json({ success: true, invites: r.rows });
});

adminRouter.post('/invites/:id/revoke', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  await query('UPDATE face_invites SET revoked = TRUE WHERE id = $1 AND used_at IS NULL', [parseInt(req.params.id)]);
  await logActivity(req.user.username, 'invite-revoked', `#${req.params.id}`);
  res.json({ success: true });
});

adminRouter.get('/users', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  const r = await query('SELECT id, username, org, role, enabled, created_at, last_login_at FROM face_users ORDER BY org, username');
  res.json({ success: true, users: r.rows });
});

adminRouter.post('/users/:id/enabled', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  const enabled = !!(req.body || {}).enabled;
  const r = await query('UPDATE face_users SET enabled = $1 WHERE id = $2 RETURNING username', [enabled, parseInt(req.params.id)]);
  if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
  await logActivity(req.user.username, enabled ? 'user-enabled' : 'user-disabled', r.rows[0].username);
  res.json({ success: true });
});

// Admin reset: generates a temporary password, shown to the admin once
adminRouter.post('/users/:id/reset-password', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  const temp = crypto.randomBytes(9).toString('base64url');
  const hash = await authService.hashCustomerPassword(temp);
  const r = await query('UPDATE face_users SET password_hash = $1 WHERE id = $2 RETURNING username', [hash, parseInt(req.params.id)]);
  if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
  await logActivity(req.user.username, 'password-reset', r.rows[0].username);
  res.json({ success: true, username: r.rows[0].username, temporaryPassword: temp });
});

adminRouter.get('/activity', async (req, res) => {
  if (!(await dbReady())) return dbOff(res);
  const r = await query('SELECT username, event, detail, at FROM face_activity ORDER BY id DESC LIMIT 200');
  res.json({ success: true, activity: r.rows });
});
