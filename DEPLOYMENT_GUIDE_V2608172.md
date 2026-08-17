# Deployment Guide - Network Configuration Automation Tool

**Version:** V2608172  
**Date:** 2026-08-17  
**Status:** Production-Ready (Phase 1: Authentication Complete)

---

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 16+ installed
- npm 8+ installed
- Two terminal windows

### Installation

```bash
# Navigate to project
cd network-config-tool

# Install all dependencies (backend + frontend)
npm run install-all
```

### Start Services

**Terminal 1 - Backend:**
```bash
npm start
# Backend runs on http://127.0.0.1:3001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Frontend runs on http://localhost:3000
```

### Access Application
```
http://localhost:3000
```

### Test Credentials
```
Username: admin
Password: admin123
```

---

## 🔐 Authentication & Security

### User Management

Users are defined in the `.env` file as comma-separated `username:password` pairs:

```env
VALID_USERS=admin:admin123|user:user123|support:support456
```

**Format:** `username:password|username:password`

To add more users, add them to the `VALID_USERS` environment variable.

### JWT Token Flow

1. User submits username/password
2. Backend validates credentials
3. Backend generates JWT token (24-hour expiration)
4. Frontend stores token in localStorage
5. All subsequent requests include token in Authorization header
6. Token automatically refreshed on API calls
7. Expired tokens trigger logout and session refresh prompt

### Token Expiration

- **Expiration Time:** 24 hours (configurable via `JWT_EXPIRY`)
- **On Expiration:** Browser automatically logs out
- **On Token Refresh:** User needs to log in again (stateless)

---

## ⚙️ Configuration

### Environment Variables (.env)

```env
# Server
NODE_ENV=development          # development or production
PORT=3001                     # API port
HOST=127.0.0.1               # Binding address (NEVER 0.0.0.0)

# Frontend
FRONTEND_URL=http://localhost:3000
VITE_API_URL=http://localhost:3001

# JWT
JWT_SECRET=your-super-secret-key-here
JWT_EXPIRY=24h

# Users
VALID_USERS=admin:admin123|user:user123

# File Upload
MAX_FILE_SIZE=10485760       # 10MB
UPLOAD_DIR=./backend/uploads

# CORS
CORS_ORIGIN=http://localhost:3000

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
```

### Environment Variables (Frontend)

Create `frontend/.env` or `frontend/.env.local`:

```env
VITE_API_URL=http://localhost:3001
VITE_APP_VERSION=2.0
```

---

## 🏭 Production Deployment

### Step 1: Prepare Production Configuration

```bash
# Copy template
cp .env.example .env.production

# Edit with production values
nano .env.production
```

**Critical Production Settings:**

```env
NODE_ENV=production
HOST=127.0.0.1                    # NEVER 0.0.0.0
JWT_SECRET=<generate-strong-secret>
VALID_USERS=admin:<strong-password>  # Use strong passwords!
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_ENABLED=true
```

**Generate Strong JWT Secret:**
```bash
# On Linux/Mac:
openssl rand -hex 32

# On Windows (PowerShell):
[Convert]::ToHexString((Get-Random -SetSeed 0 | ForEach-Object { [byte](Get-Random -Max 256) }).Bytes[0..31])
```

### Step 2: Build Frontend

```bash
npm run build-frontend
# Creates optimized build in frontend/dist/
```

### Step 3: Deploy

#### Option A: Railway (Recommended)

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Release V2608172"
git remote add origin https://github.com/your-org/network-config-tool.git
git push -u origin main
```

2. **Connect to Railway:**
   - Visit railway.app
   - Create new project
   - Connect GitHub repository
   - Configure environment variables
   - Deploy

**Railway Environment Variables:**
```
NODE_ENV=production
PORT=3001
HOST=0.0.0.0  # Railway requires 0.0.0.0 for listening
JWT_SECRET=<your-secret>
VALID_USERS=admin:changeme
CORS_ORIGIN=https://your-railway-domain.com
```

#### Option B: Docker (Coming in Phase 4)

#### Option C: Traditional Server

1. Deploy to server
2. Install Node.js
3. Run: `NODE_ENV=production npm start`
4. Use process manager (PM2) for persistence:
   ```bash
   npm install -g pm2
   pm2 start backend/server.js --name "network-config-api"
   pm2 save
   pm2 startup
   ```

---

## 🔒 Security Checklist

- [ ] JWT_SECRET is changed from default
- [ ] VALID_USERS credentials are strong (min 12 characters)
- [ ] CORS_ORIGIN is set to your domain (not *)
- [ ] HOST is 127.0.0.1 (not 0.0.0.0)
- [ ] NODE_ENV is set to production
- [ ] RATE_LIMIT_ENABLED is true
- [ ] File uploads directory exists and is writable
- [ ] No credentials in git repository
- [ ] SSL/TLS enabled on domain (HTTPS)
- [ ] Firewall blocks direct port access (reverse proxy only)

---

## 📊 Monitoring & Health Checks

### Health Endpoint

```bash
# Check if API is running
curl http://127.0.0.1:3001/health

# Response:
{
  "status": "ok",
  "timestamp": "2026-08-17T14:30:00Z",
  "environment": "development"
}
```

### Log Monitoring

Backend logs important events:
- User logins (success/failure)
- API requests
- Errors with unique error IDs
- File uploads

---

## 🐛 Troubleshooting

### "Port 3001 already in use"

```bash
# Find process using port
lsof -i :3001

# Kill process
kill -9 <PID>
```

### "Cannot find module 'jsonwebtoken'"

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "CORS error when accessing from frontend"

Check `.env`:
```env
CORS_ORIGIN=http://localhost:3000  # Must match frontend URL exactly
```

### "Login fails with correct credentials"

1. Verify `.env` VALID_USERS format:
   ```
   # ❌ Wrong
   VALID_USERS=admin changeme
   
   # ✅ Correct
   VALID_USERS=admin:changeme
   ```

2. Check backend logs for errors
3. Verify JWT_SECRET is set

### "Token expired immediately"

Check JWT_EXPIRY format:
```env
# ✅ Correct
JWT_EXPIRY=24h

# ✅ Also valid
JWT_EXPIRY=48h
JWT_EXPIRY=1d
```

---

## 📈 Performance Tuning

### File Upload Size

```env
MAX_FILE_SIZE=52428800  # 50MB (default 10MB)
```

### Rate Limiting

```env
# More permissive for internal use
RATE_LIMIT_WINDOW_MS=3600000   # 1 hour
RATE_LIMIT_MAX_REQUESTS=1000
```

---

## 🔄 Rollback Procedure

If something breaks, restore from backup:

```bash
# Backup is at: .backups/V2608171_BaseVersion/
cp -r .backups/V2608171_BaseVersion/* .
npm install
npm start
```

---

## 📋 Version Control

### Branching Strategy (Git Flow)

```
main ─────────────────────── Production releases
  ↑
release/* ───────────────────── Release candidates
  ↑
develop ─────── Integration branch
  ↑                ↑
feature/* ─────── New features
hotfix/* ──────── Critical fixes
```

### Commit Messages

```
[V2608172] feat: Add JWT authentication
[V2608172] fix: Security binding issue
[V2608172] docs: Add deployment guide
```

---

## 📞 Support

### Before Asking for Help

1. Check `.env` configuration
2. Check logs (terminal output or log files)
3. Verify port 3001 is not blocked
4. Try fresh `npm install`
5. Check CHANGELOG.md for recent changes

### Getting Help

- **Logs:** Check terminal where `npm start` is running
- **Errors:** Note the error ID from responses
- **Documentation:** See README.md, SECURITY.md

---

## 🎯 Next Steps

**Phase 2 (Coming):**
- [ ] Input validation schemas
- [ ] Comprehensive error handling
- [ ] Structured logging with file rotation
- [ ] API documentation (Swagger)

**Phase 3:**
- [ ] Unit/Integration tests
- [ ] TypeScript migration
- [ ] Accessibility improvements

**Phase 4:**
- [ ] Docker support
- [ ] GitHub Actions CI/CD
- [ ] Monitoring dashboard

---

**Created:** 2026-08-17  
**Version:** V2608172  
**Status:** Production-Ready (Phase 1 Complete)
