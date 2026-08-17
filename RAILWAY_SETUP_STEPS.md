# Railway.app Deployment - Step by Step

**Status:** Ready to Deploy  
**Version:** V2608173  
**Created:** 2026-08-17

---

## ✅ What's Done (Locally)

```bash
✓ Git repository initialized
✓ All files committed (71 files, 20MB)
✓ .gitignore configured
✓ Ready to push to GitHub
```

---

## 🚀 Next Steps (Do These Now)

### Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `fabric-automation-project` (or your choice)
3. Description: "FACE v2.0 - Fabric Auto Configuration Engine"
4. Make it **Public** (easier for Railway to access)
5. **DO NOT** initialize with README (we have one)
6. Click **Create repository**

---

### Step 2: Push to GitHub

Copy the commands from GitHub (they'll look like this):

```bash
cd "C:\Users\clvaldez\OneDrive - Extreme Networks, Inc\Documents\FabricAutomationProject\Claude\network-config-tool"

git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fabric-automation-project.git
git push -u origin main
```

**Run these commands** (replace YOUR_USERNAME with your GitHub username)

---

### Step 3: Verify on GitHub

- Go to your GitHub repo
- Should see all 71 files
- Should see the commit message

---

### Step 4: Generate JWT Secret

Open Terminal/PowerShell and run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Copy the output** (looks like: `abc123def456...`)

---

### Step 5: Create Strong Passwords

Choose two passwords:
- **Admin password:** (for yourself, 12+ chars recommended)
- **Engineer password:** (for team members)

Examples:
- Admin: `Secure$Admin2026!Extreme`
- Engineer: `Team$Engineer2026!Config`

---

### Step 6: Deploy on Railway

1. **Go to:** https://railway.app
2. **Sign up** with GitHub (easier)
3. **Create New Project**
4. **Deploy from GitHub repo**
5. **Select** `fabric-automation-project`
6. **Click Deploy**
7. **Wait 2-3 minutes** for deployment

---

### Step 7: Add Environment Variables

Once deployed in Railway:

1. **Go to:** Deployments tab
2. **Click** the deployment
3. **Go to:** Variables tab
4. **Add these variables:**

```
NODE_ENV=production
JWT_SECRET=[paste-from-step-4]
VALID_USERS=admin:Secure$Admin2026!Extreme|engineer:Team$Engineer2026!Config
CORS_ORIGIN=https://[your-service-name].up.railway.app
PORT=3001
HOST=0.0.0.0
```

**Where to find your Railway domain:**
- Railway Dashboard → Settings → Service Domain
- Looks like: `yourservice.up.railway.app`

---

### Step 8: Verify Deployment

Once Railway redeploys (after env vars):

**Test 1 - Health Check:**
```bash
curl https://yourservice.up.railway.app/health
```

Should return:
```json
{"status":"ok","timestamp":"...","environment":"production"}
```

**Test 2 - Login:**
```bash
curl -X POST https://yourservice.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Secure$Admin2026!Extreme"}'
```

Should return:
```json
{"success":true,"token":"eyJ...","user":{...}}
```

**Test 3 - Open in Browser:**
```
https://yourservice.up.railway.app
```

Should show login page with Extreme Networks branding

---

## 📋 Checklist Before Deploying

- [ ] GitHub account created
- [ ] Repository created on GitHub
- [ ] Code pushed to GitHub (main branch)
- [ ] JWT_SECRET generated (32+ random chars)
- [ ] Admin password created (strong)
- [ ] Engineer password created (strong)
- [ ] Railway.app account created
- [ ] GitHub connected to Railway
- [ ] Repository selected in Railway

---

## 🔐 Environment Variables Quick Reference

```bash
# Copy this format, fill in your values:

NODE_ENV=production
JWT_SECRET=abc123def456...xyz (from step 4)
VALID_USERS=admin:YourAdminPassword|engineer:YourEngineerPassword
CORS_ORIGIN=https://your-service-name.up.railway.app
PORT=3001
HOST=0.0.0.0
```

**Important:**
- CORS_ORIGIN must match your Railway domain EXACTLY
- Passwords should be strong and unique
- Keep JWT_SECRET secret (don't share)
- Don't commit .env file to git

---

## 🎯 Expected Results

After deployment:

✅ Application loads at Railway URL  
✅ Login works with your credentials  
✅ Upload workflow functions  
✅ Configuration export generates files  
✅ Validation engine runs  
✅ Topology visualization displays  
✅ PDF export works  
✅ HTTPS shows green lock icon  

---

## 🆘 If Something Goes Wrong

**Railway shows build errors:**
- Check Node.js version (should be 18+)
- Check package.json scripts
- View Railway logs for details

**Can't login:**
- Verify VALID_USERS format: `username:password|username:password`
- Check password matches exactly
- Verify JWT_SECRET is set (should be random 32+ chars)

**CORS errors in browser:**
- Verify CORS_ORIGIN matches Railway domain EXACTLY
- No typos, no extra slashes
- Use https:// not http://

**Application slow:**
- Check Railway resource usage
- Consider upgrading plan if needed
- Check file upload sizes

---

## 📞 Support Resources

- Railway Docs: https://docs.railway.app
- FACE Documentation: See DEPLOYMENT_GUIDE_V2608173.md
- Security Guide: See SECURITY_AUDIT_V2608173.md

---

## 🎉 Once Live

Share the URL with:
- ✅ Your team for testing
- ✅ Customers for demonstrations
- ✅ Stakeholders for approval
- ✅ Engineering team for feedback

---

**Version:** V2608173  
**Status:** Ready to Deploy  
**Estimated Time:** 15-30 minutes

Let me know when you're ready and I can help troubleshoot any issues!

