// ============================================
// Authentication Middleware
// Version: V2608172
// Purpose: JWT token validation for protected routes
// ============================================

import authService from '../services/authService.js';
import { query } from '../services/db.js';

export const authMiddleware = async (req, res, next) => {
  let user;
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    user = authService.validateToken(authHeader);
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }

  // Customer accounts: re-check on every request so disabling an account
  // takes effect immediately, not when its 24h token expires
  if (user.role === 'customer') {
    try {
      const r = await query('SELECT enabled FROM face_users WHERE username = $1', [user.username]);
      if (!r.rows[0] || !r.rows[0].enabled) {
        return res.status(401).json({ error: 'This account has been disabled', code: 'ACCOUNT_DISABLED' });
      }
    } catch (err) {
      return res.status(503).json({ error: 'Account service unavailable', code: 'ACCOUNTS_DB_UNAVAILABLE' });
    }
  }

  req.user = user;
  next();
};

// Optional: Role-based access control
export const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};
