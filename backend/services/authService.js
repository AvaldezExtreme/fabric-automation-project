// ============================================
// Authentication Service
// Version: V2608172
// Purpose: JWT token generation, validation, and user authentication
// ============================================

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query, logActivity } from './db.js';

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET;
    if (!this.jwtSecret) {
      console.warn('⚠️  WARNING: JWT_SECRET not set. Using weak default. CHANGE IN PRODUCTION!');
      this.jwtSecret = 'dev-secret-key-change-in-production-12345';
    }
    this.jwtExpiry = process.env.JWT_EXPIRY || '24h';
    this.users = this.parseUsers();
  }

  // Parse user credentials from environment variable
  // Format: "username:password|username:password"
  // ⚠️ NOTE: For production, consider using bcrypt instead of SHA256
  parseUsers() {
    const usersEnv = process.env.VALID_USERS || 'admin:changeme';
    const userMap = new Map();

    usersEnv.split('|').forEach(pair => {
      const [username, password] = pair.trim().split(':');
      if (username && password) {
        userMap.set(username.trim(), {
          username: username.trim(),
          passwordHash: this.hashPassword(password.trim()),
          // VALID_USERS accounts are the tool owner's - the only admins.
          // Customer accounts live in the DB with role 'customer'.
          role: 'admin'
        });
      }
    });

    return userMap;
  }

  // Hash password using SHA256 (development). For production, use bcrypt.
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // Authenticate: env admin first, then DB customer accounts
  // record=false: just verify the password (e.g. change-password), no
  // last-login update and no 'login' entry in the activity log
  async authenticate(username, password, { record = true } = {}) {
    if (!username || !password) {
      throw new Error('Username and password required');
    }
    const name = username.trim();

    const admin = this.users.get(name);
    if (admin) {
      const a = Buffer.from(admin.passwordHash);
      const b = Buffer.from(this.hashPassword(password));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Invalid credentials');
      return { username: admin.username, role: admin.role, email: `${admin.username}@extremenetworks.com` };
    }

    let row = null;
    try {
      const r = await query('SELECT id, username, org, password_hash, role, enabled FROM face_users WHERE LOWER(username) = LOWER($1)', [name]);
      row = r.rows[0];
    } catch (err) {
      if (err.message !== 'ACCOUNTS_DB_UNAVAILABLE') console.error('login lookup failed:', err.message);
    }
    if (!row || !(await bcrypt.compare(password, row.password_hash))) throw new Error('Invalid credentials');
    if (!row.enabled) throw new Error('This account has been disabled - contact your Extreme Networks SE');

    if (record) {
      await query('UPDATE face_users SET last_login_at = NOW() WHERE id = $1', [row.id]);
      await logActivity(row.username, 'login', row.org);
    }
    return { username: row.username, role: row.role, org: row.org, email: '' };
  }

  // Customer passwords: bcrypt (env admin keeps its existing scheme)
  async hashCustomerPassword(password) {
    return bcrypt.hash(password, 12);
  }

  // Generate JWT token
  generateToken(userData) {
    return jwt.sign(
      {
        username: userData.username,
        role: userData.role,
        org: userData.org,
        email: userData.email,
        iat: Math.floor(Date.now() / 1000)
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiry }
    );
  }

  // Verify and decode JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  // Extract token from Authorization header
  extractToken(authHeader) {
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new Error('Invalid authorization header format');
    }

    return parts[1];
  }

  // Validate token and return user data
  validateToken(authHeader) {
    const token = this.extractToken(authHeader);
    return this.verifyToken(token);
  }
}

export default new AuthService();
