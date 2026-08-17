# Railway Deployment Guide
## FACE v2.0 - Fabric Auto Configuration Engine

**Status:** Ready for Deployment  
**Version:** V2608173  
**Date:** 2026-08-17

---

## 🚀 Quick Start Deployment

### Step 1: Generate Strong JWT_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copy the output** - you'll need this for Railway environment variables.

---

### Step 2: Prepare Git Repository

```bash
cd "C:\Users\clvaldez\OneDrive - Extreme Networks, Inc\Documents\FabricAutomationProject\Claude\network-config-tool"

# Check status
git status

# Add all changes
git add .

# Create deployment commit
git commit -m "Phase 4 Complete: Production deployment V2608173

- Security audit passed (3 issues fixed)
- Code quality verified
- Topology visualization enhanced
- PDF export implemented
- All tests passing
- Ready for production"

# Push to main
git push origin main
```

---

### Step 3: Create Railway Project

1. **Go to:** https://railway.app
2. **Sign in** with your GitHub account (or create free account)
3. **Create New Project** → Select "Deploy from GitHub repo"
4. **Connect Repository** → Select your network-config-tool repo
5. **Click Deploy**

---

### Step 4: Configure Environment Variables

In Railway dashboard, go to **Variables** and add:

```
NODE_ENV=production
JWT_SECRET=[paste-the-secret-from-step-1]
VALID_USERS=admin:YourSecurePassword123|engineer:EngineerPassword456
CORS_ORIGIN=https://your-railway-url.up.railway.app
PORT=3001
HOST=0.0.0.0
```

**⚠️ Important:**
- Change the passwords to something secure
- Use strong, random passwords
- Don't reuse development credentials
- Save these credentials securely

---

### Step 5: Verify Deployment

Once Railway deploys (takes ~2-3 minutes):

1. **Check Health Endpoint:**
   ```
   https://your-railway-url.up.railway.app/health
   ```
   Should return:
   ```json
   {"status":"ok","timestamp":"...","environment":"production"}
   ```

2. **Test Login:**
   ```
   POST https://your-railway-url.up.railway.app/api/auth/login
   Content-Type: application/json
   
   {
     "username": "admin",
     "password": "YourSecurePassword123"
   }
   ```
   Should return JWT token

3. **Access Application:**
   ```
   https://your-railway-url.up.railway.app
   ```
   Should show login page with branding

---

## 📋 Pre-Deployment Checklist

- [ ] Git repository ready (committed all changes)
- [ ] Railway account created
- [ ] GitHub connected to Railway
- [ ] JWT_SECRET generated (32+ chars)
- [ ] Secure passwords created
- [ ] CORS_ORIGIN documented
- [ ] NODE_ENV set to "production"
- [ ] All environment variables ready

---

## 🔒 Security Configuration

### Environment Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| `NODE_ENV` | Deployment mode | `production` |
| `JWT_SECRET` | Token signing key | `abc123def456...` (32+ chars) |
| `VALID_USERS` | User credentials | `admin:pass1\|user:pass2` |
| `CORS_ORIGIN` | Allowed frontend origin | `https://your-domain.up.railway.app` |
| `PORT` | Server port | `3001` (Railway will override) |
| `HOST` | Bind address | `0.0.0.0` (for Railway) |

### Why These Matter

**NODE_ENV=production:**
- Disables debug logging
- Optimizes performance
- Enables security features

**JWT_SECRET:**
- Must be strong and random
- Used to sign authentication tokens
- **NEVER commit to git**
- **NEVER use default value**

**VALID_USERS:**
- Format: `username:password|username:password`
- Create strong passwords
- Consider admin + engineer roles
- Change from development credentials

**CORS_ORIGIN:**
- Must match Railway domain exactly
- Prevents unauthorized access
- Find in Railway dashboard → Deployments

---

## 📊 Railway Deployment Features

**Included:**
- ✅ Automatic HTTPS (SSL/TLS)
- ✅ Custom domain support (optional)
- ✅ Auto-scaling (if traffic spikes)
- ✅ Monitoring & logs
- ✅ Deployment history
- ✅ Automatic redeploys on git push
- ✅ Environment variable management

**Free Tier Includes:**
- ✅ 500 hours/month (always on)
- ✅ Unlimited projects
- ✅ GitHub integration
- ✅ Custom domains
- ✅ SSL certificates

---

## 🔍 Post-Deployment Verification

### 1. Health Check
```bash
curl https://your-railway-url.up.railway.app/health
```
Expected: `{"status":"ok",...}`

### 2. Validator Status
```bash
curl https://your-railway-url.up.railway.app/api/validate/status
```
Expected: Returns validator info

### 3. Login Test
```bash
curl -X POST https://your-railway-url.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourPassword"}'
```
Expected: Returns JWT token

### 4. Full Application Test
- Open: `https://your-railway-url.up.railway.app`
- Login with credentials
- Navigate through workflow steps
- Verify all features work

---

## 📈 Monitoring & Logs

### View Logs in Railway

1. **Go to:** Railway Dashboard → Project → Deployments
2. **Click** the active deployment
3. **See:** Real-time logs, errors, performance

### Watch for Common Issues

**401 Errors:** JWT_SECRET mismatch
- Verify JWT_SECRET matches between deployments
- Check token expiration

**CORS Errors:** CORS_ORIGIN misconfiguration
- Verify CORS_ORIGIN matches Railway domain exactly
- Check for typos (https://, .up.railway.app, etc.)

**Memory Issues:** If validation is slow
- Railway scales automatically
- Check Available Memory in logs

**File Upload Errors:** If uploads fail
- Ensure MAX_FILE_SIZE is reasonable (10MB default)
- Check file format is Excel

---

## 🔄 Continuous Deployment

### Automatic Redeploys

Railway automatically redeploys when:
- You push to main branch
- Environment variables change
- You update Railway configuration

### Manual Redeploy

1. Go to Railway Dashboard
2. Click "Deploy"
3. Select commit to deploy
4. Wait 2-3 minutes

---

## 🚨 Troubleshooting

### Application Won't Start

**Check logs for:**
- `Missing environment variable`
- `Port already in use`
- `Cannot find module`

**Solutions:**
- Verify all required env vars are set
- Check package.json has correct start script
- Ensure Node.js version compatible

### Authentication Failing

**Check:**
- JWT_SECRET is set and valid
- Passwords match VALID_USERS format
- Token not expired

### CORS Issues

**Verify:**
- CORS_ORIGIN matches Railway domain exactly
- No trailing slashes
- Uses https://

### Slow Performance

**Check:**
- API response times in logs
- File sizes being uploaded
- Memory usage in Railway dashboard
- Consider Railway plan upgrade

---

## 📞 Support

### Getting Your Railway URL

1. Go to Railway Dashboard
2. Click your project
3. Click "Settings"
4. Find "Service Domain" or "Custom Domain"
5. It looks like: `your-service.up.railway.app`

### Testing Your Deployment

Use this script to test all endpoints:

```bash
#!/bin/bash
DOMAIN="your-service.up.railway.app"

echo "1. Health Check:"
curl https://$DOMAIN/health

echo -e "\n2. Validator Status:"
curl https://$DOMAIN/api/validate/status

echo -e "\n3. Login:"
curl -X POST https://$DOMAIN/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourPassword"}'

echo -e "\n✅ All endpoints responding"
```

---

## 🎓 What Happens After Deployment

1. **Application is live** at Railway URL
2. **Updates deploy automatically** when you push to git
3. **Logs available in** Railway dashboard
4. **Monitoring shows** performance metrics
5. **HTTPS enabled** automatically
6. **Scaling happens** automatically if needed

---

## 🔐 Post-Deployment Security Steps

### Recommended

1. **Change default passwords** (if using demo credentials)
2. **Monitor logs** for any errors
3. **Test authentication** flow thoroughly
4. **Verify HTTPS** is working (should be automatic)
5. **Check rate limiting** is active

### Optional but Recommended

1. **Set up custom domain** (if you have one)
2. **Enable monitoring** (Railway has built-in)
3. **Configure backups** (if using database in future)
4. **Set up alerts** (for error rates)

---

## 📝 After Deployment Checklist

- [ ] Application loads at Railway URL
- [ ] Health endpoint returns OK
- [ ] Login works with production credentials
- [ ] Upload/Export workflow functional
- [ ] Validation engine working
- [ ] Topology visualization loads
- [ ] PDF export generates correctly
- [ ] HTTPS working (green lock icon)
- [ ] No errors in logs
- [ ] Performance acceptable

---

## 🎉 You're Live!

Once all checks pass, you're ready to:

- ✅ Share URL with customers
- ✅ Run demonstrations
- ✅ Let team members test
- ✅ Gather feedback
- ✅ Plan Phase 5 enhancements

---

## 📊 Next Steps

### Week 1 (Post-Launch)
- Monitor logs daily
- Gather user feedback
- Track any errors
- Performance baseline

### Week 2-4
- Optimize based on feedback
- Fix any issues found
- Prepare Phase 5 features
- Plan next improvements

### Phase 5 (Future)
- Database integration
- Configuration versioning
- Multi-user collaboration
- Advanced features

---

**Version:** V2608173  
**Status:** Ready for Deployment  
**Last Updated:** 2026-08-17

Good luck! You've built something impressive. 🚀

