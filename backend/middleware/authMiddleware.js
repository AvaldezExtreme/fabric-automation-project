// ============================================
// Authentication Middleware
// Version: V2608172
// Purpose: JWT token validation for protected routes
// ============================================

import authService from '../services/authService.js';

export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    const user = authService.validateToken(authHeader);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
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
