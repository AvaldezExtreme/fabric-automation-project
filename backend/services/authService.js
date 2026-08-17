// ============================================
// Authentication Service
// Version: V2608172
// Purpose: JWT token generation, validation, and user authentication
// ============================================

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
          role: 'user'
        });
      }
    });

    return userMap;
  }

  // Hash password using SHA256 (development). For production, use bcrypt.
  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // Authenticate user with username and password
  authenticate(username, password) {
    if (!username || !password) {
      throw new Error('Username and password required');
    }

    const user = this.users.get(username.trim());
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordHash = this.hashPassword(password);
    if (user.passwordHash !== passwordHash) {
      throw new Error('Invalid credentials');
    }

    return {
      username: user.username,
      role: user.role,
      email: `${user.username}@extremenetworks.com`
    };
  }

  // Generate JWT token
  generateToken(userData) {
    return jwt.sign(
      {
        username: userData.username,
        role: userData.role,
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
