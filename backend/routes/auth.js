// ============================================
// Authentication Routes
// Version: V2608172
// Purpose: Login, logout, and token refresh endpoints
// ============================================

import express from 'express';
import authService from '../services/authService.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/auth/login
// Authenticate user and return JWT token
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password required'
      });
    }

    const user = authService.authenticate(username, password);
    const token = authService.generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(401).json({
      error: error.message || 'Authentication failed'
    });
  }
});

// POST /api/auth/verify
// Verify current token validity
router.post('/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// POST /api/auth/logout
// Logout (client clears token from localStorage)
router.post('/logout', authMiddleware, (req, res) => {
  // Token is stored on client-side, logout is just clearing it
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// GET /api/auth/me
// Get current authenticated user info
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

export default router;
