# Quick Start Guide

Get the Network Configuration Automation Tool running in 5 minutes.

## Prerequisites

- Node.js 16+ ([download](https://nodejs.org/))
- npm 8+
- Modern web browser
- Your Excel configuration file ready

## One-Minute Setup

### 1. Install Dependencies (2 minutes)
```bash
cd network-config-tool
npm run install-all
```

### 2. Start Backend (Terminal 1)
```bash
npm start
# ✓ Running on http://localhost:3001
```

### 3. Start Frontend (Terminal 2)
```bash
cd frontend
npm run dev
# ✓ Running on http://localhost:3000
```

### 4. Open Browser
```
http://localhost:3000
```

## You're Done! 🎉

The application is now running locally and ready to use.

---

## What Happens Next

### Step 1: Upload Excel File
1. Click "Upload & Parse"
2. Select your network configuration Excel file
3. App extracts all switches and VLANs

### Step 2: Add Serial Numbers
1. Enter hardware serial for each switch
2. Review DHCP server settings
3. Optional: Add WAN configuration

### Step 3: Review Topology
1. View network hierarchy (MDF → IDF)
2. Click switches to see VLAN details
3. Verify everything looks correct

### Step 4: Download Files
1. Download individual switch configs (.txt)
2. Download Site Engine CSV file
3. All ready for deployment!

---

## File Locations

```
network-config-tool/
├── backend/                    # Node.js backend
│   ├── server.js              # Main server
│   ├── routes/                # API endpoints
│   ├── services/              # Business logic
│   ├── middleware/            # Input validation
│   ├── templates/             # L2/L3 templates
│   └── uploads/               # Temporary files
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── App.jsx            # Main component
│   │   ├── pages/             # Step pages
│   │   └── App.css            # Styling
│   ├── index.html
│   └── vite.config.js
├── README.md                  # Full documentation
├── SECURITY.md               # Security details
├── GIT-WORKFLOW.md           # Version control guide
└── package.json              # Dependencies
```

---

## Common Issues & Fixes

### Port Already in Use
```bash
# Use different port
PORT=3002 npm start          # Backend on 3002
npm run dev -- --port 3001   # Frontend on 3001
```

### File Won't Upload
- ✓ Is it a .xlsx or .xls file?
- ✓ Is it less than 10MB?
- ✓ Does it have switch data?

### "Cannot find module"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm run install-all
```

### Backend Won't Start
```bash
# Check if port 3001 is in use
lsof -i :3001
# Kill process if needed
kill -9 <PID>
```

---

## Test with Sample Data

### Minimal Test Setup
1. Upload the provided FabricVlanIsidTest.xlsx
2. Enter sample serial numbers:
   - SHS-MDF1-1: JA072336G-00237
   - SHS-MDF1-2: JA012319G-00304
3. Click through to generate configs
4. Download and review output files

### Expected Output
- ✓ Configuration files (one per switch)
- ✓ SCS-Serials.csv for Site Engine
- ✓ Network topology view
- ✓ All files generated in < 5 seconds

---

## Production Deployment

### Before Going Live

1. **Test** with non-production data first
2. **Review** generated configurations
3. **Validate** Site Engine CSV format
4. **Backup** source Excel files
5. **Document** your process
6. **Train** team members

### Deployment Steps

```bash
# 1. Build frontend for production
npm run build-frontend

# 2. Keep backend running
npm start

# 3. Access at http://localhost:3000
# 4. Ensure machine has no network access (air-gapped)
# 5. Or secure with VPN if remote
```

---

## Next Steps

### Read Full Documentation
- See `README.md` for complete guide
- See `SECURITY.md` for security details
- See `GIT-WORKFLOW.md` for version control

### Customize for Your Environment

1. **Update Templates**
   - Edit `backend/templates/l2-template.txt`
   - Edit `backend/templates/l3-template.txt`
   - Add site-specific configurations

2. **Adjust DHCP Servers**
   - Configure on Step 2: Configure
   - Defaults: 10.1.1.202, 10.1.1.207
   - Update for your environment

3. **Modify Styling**
   - Edit `frontend/src/App.css`
   - Change colors, fonts, layout
   - Add your branding

### Add Features

1. **Backend** (Node.js): Add routes in `backend/routes/`
2. **Frontend** (React): Add components in `frontend/src/pages/`
3. **Validation**: Update `backend/middleware/validation.js`
4. **Export Formats**: Extend `backend/services/csvGenerator.js`

---

## Support Resources

### Troubleshooting
- Check logs in browser console (F12)
- Check backend logs in terminal
- Verify backend on http://localhost:3001/health

### Documentation
- README.md: Complete guide
- SECURITY.md: Security assessment
- GIT-WORKFLOW.md: Version control

### Quick Commands

```bash
# Check if running
curl http://localhost:3001/health

# View logs
npm start                      # Backend logs
npm run dev                    # Frontend logs (in frontend/ dir)

# Restart everything
# Ctrl+C in both terminals, then re-run

# Clean rebuild
rm -rf node_modules
npm run install-all
npm start  # Terminal 1
npm run dev  # Terminal 2 (in frontend/)
```

---

## You're Ready! 🚀

Questions? Review the documentation files:
- README.md - Full documentation
- SECURITY.md - Security & hardening
- GIT-WORKFLOW.md - Version control

**Happy configuring!**
