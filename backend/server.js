import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import uploadRoutes from './routes/upload.js';
import generateRoutes from './routes/generate.js';
import authRoutes from './routes/auth.js';
import validateRoutes from './routes/validate.js';
import { authMiddleware } from './middleware/authMiddleware.js';

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || 'localhost';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Serve frontend static files in production
if (NODE_ENV === 'production') {
  const frontendDist = join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));
}

// ===== SECURITY MIDDLEWARE =====
// Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:']
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 min default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false // Disable X-RateLimit-* headers
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per windowMs
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true // Don't count successful requests
});

app.use(limiter);

// ===== CORS CONFIGURATION =====
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===== BODY PARSING MIDDLEWARE =====
const maxFileSize = process.env.MAX_FILE_SIZE || '10485760'; // 10MB default
app.use(express.json({ limit: maxFileSize }));
app.use(express.urlencoded({ limit: maxFileSize, extended: true }));

// ===== REQUEST LOGGING MIDDLEWARE =====
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const path = req.path;
  const ip = req.ip;

  // Log request (no sensitive data)
  if (NODE_ENV !== 'production' || path.includes('/api/')) {
    console.log(`[${timestamp}] ${method} ${path} - ${ip}`);
  }

  next();
});

// ===== PUBLIC ROUTES (NO AUTH REQUIRED) =====
app.use('/api/auth', loginLimiter, authRoutes);

// Health check (public)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// Validator status (public)
app.get('/api/validate/status', (req, res) => {
  res.json({
    status: 'ready',
    validator: 'Fabric Configuration Validator',
    version: 'V2608173',
    timestamp: new Date().toISOString()
  });
});

// ===== PROTECTED ROUTES (AUTH REQUIRED) =====
app.use('/api/upload', authMiddleware, uploadRoutes);
app.use('/api/generate', authMiddleware, generateRoutes);
app.use('/api/validate', authMiddleware, validateRoutes);

// ===== ERROR HANDLING MIDDLEWARE =====
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  const errorId = Math.random().toString(36).substring(7);

  // Log detailed error (server-side only)
  console.error(`[${timestamp}] Error ID: ${errorId}`, err);

  // Generic error response to client (no stack traces)
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    errorId, // For support/debugging without exposing details
    timestamp
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// ===== START SERVER =====
const server = app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     Network Configuration Automation Tool - Backend v2       ║
╠══════════════════════════════════════════════════════════════╣
║ Version:          V2608172                                   ║
║ Status:           ✓ Running                                   ║
║ API URL:          http://${HOST}:${PORT}                     ║
║ Environment:      ${NODE_ENV}                                 ║
║ Authentication:   ✓ Enabled (JWT)                            ║
║ Security:         ✓ Helmet + Rate Limiting                   ║
║ CORS Origin:      ${corsOrigin}                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  if (NODE_ENV === 'development') {
    console.log('📝 API Documentation: http://localhost:3001/api/docs (coming soon)');
    console.log('🔐 Login: POST http://localhost:3001/api/auth/login');
    console.log('   Credentials defined in .env VALID_USERS');
  }
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});