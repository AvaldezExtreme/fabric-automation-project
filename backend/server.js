import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import uploadRoutes from './routes/upload.js';
import generateRoutes from './routes/generate.js';
import authRoutes from './routes/auth.js';
import validateRoutes from './routes/validate.js';
import { authMiddleware } from './middleware/authMiddleware.js';

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ===== SECURITY =====
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

// ===== RATE LIMITING =====
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true
});

app.use(limiter);

// ===== CORS =====
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===== BODY PARSING =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ===== LOGGING =====
app.use((req, res, next) => {
  if (NODE_ENV === 'development' || req.path.includes('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', environment: NODE_ENV });
});

// ===== PUBLIC ROUTES =====
app.use('/api/auth', loginLimiter, authRoutes);

app.get('/api/validate/status', (req, res) => {
  res.json({
    status: 'ready',
    validator: 'Fabric Configuration Validator',
    version: 'V2608173'
  });
});

// ===== PROTECTED ROUTES =====
app.use('/api/upload', authMiddleware, uploadRoutes);
app.use('/api/generate', authMiddleware, generateRoutes);
app.use('/api/validate', authMiddleware, validateRoutes);

// ===== STATIC FILES & SPA FALLBACK =====
if (NODE_ENV === 'production') {
  const frontendPath = join(__dirname, '../frontend/dist');

  // Serve static files
  app.use(express.static(frontendPath, {
    maxAge: '1d',
    etag: false
  }));

  // SPA fallback: serve index.html for any route not starting with /api
  app.get('*', (req, res) => {
    res.sendFile(join(frontendPath, 'index.html'), (err) => {
      if (err) {
        res.status(500).json({ error: 'Could not load app' });
      }
    });
  });
}

// ===== ERROR HANDLING =====
app.use((err, req, res, next) => {
  console.error(`Error: ${err.message}`);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ===== START SERVER =====
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     Network Configuration Automation Tool - Backend v2       ║
╠══════════════════════════════════════════════════════════════╣
║ Status:           ✓ Running                                   ║
║ Port:             ${PORT}                                             ║
║ Environment:      ${NODE_ENV}                                 ║
║ CORS Origin:      ${process.env.CORS_ORIGIN || 'http://localhost:3000'}║
╚══════════════════════════════════════════════════════════════╝
  `);
});

server.on('error', (err) => {
  console.error('Server failed to start:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});
