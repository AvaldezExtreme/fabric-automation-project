# Network Configuration Automation Tool

Enterprise-grade switch configuration automation and Site Engine auto-onboarding platform for Extreme Networks.

## Features

- 📁 **Excel Ingestion**: Parse multi-sheet network configuration files
- ⚙️ **Smart Config Generation**: Automatic L2/L3 switch configuration file creation
- 📊 **Site Engine Export**: Generate CSV files for Platform One auto-onboarding
- 🏢 **Topology Visualization**: Hierarchical network structure display (MDF → IDF)
- 🔒 **Enterprise Security**: Input validation, file sandboxing, no arbitrary code execution
- 📦 **Batch Processing**: Generate all outputs simultaneously
- 🌿 **Version Control Ready**: Git-based branching strategy included

## System Requirements

- **Node.js**: 16.x or later
- **npm**: 8.x or later
- **Operating System**: Windows, macOS, or Linux
- **Browser**: Modern browser (Chrome, Firefox, Safari, Edge)

## Installation

### 1. Clone or Extract Project

```bash
cd network-config-tool
```

### 2. Install Dependencies

```bash
# Install all dependencies (both backend and frontend)
npm run install-all

# Or manually:
npm install
cd frontend && npm install && cd ..
```

### 3. Create Uploads Directory

```bash
mkdir -p backend/uploads
```

## Running the Application

### Development Mode

```bash
# Terminal 1: Start Backend (Port 3001)
npm start

# Terminal 2: Start Frontend (Port 3000)
cd frontend && npm run dev
```

Access the application at: `http://localhost:3000`

### Production Build

```bash
# Build frontend
npm run build-frontend

# Backend runs with: npm start
```

## Configuration

### Excel Input Format

Your input Excel file should contain multiple sheets (one per location) with these columns:

| Column | Description | Example |
|--------|-------------|---------|
| Location | Site/School name | "SCOTLAND HIGH SCHOOL" |
| Service Application | Site abbreviation | "SHS" |
| Layer | Network layer | 12 |
| Site | Site ID | 43 |
| Edge Vlans | VLAN number | 8, 16, 24 |
| Name | VLAN name | "Netmgmt", "VoIP" |
| Subnet | Network subnet | "10.143.8.0/24" |
| DeviceType | Device type | "ap", "phone", "data" |
| Layer 2 VSN I-SID | I-SID for L2 | 12430008 |
| I-SID Name | I-SID description | "SHS-Netmgmt" |
| SwitchName | Switch hostname | "SHS-MDF1-1" |
| SwitchType | L2 or L3 | "L3", "L2" |
| SiteID | Numeric site ID | 43 |
| MgmtVLAN | Management VLAN number | 8 |
| DefaultGateway | Default gateway IP | "10.143.8.1" |
| Closet | Physical location | "MDF1", "B1-IDF1" |
| Ports | Port range | "1/1-1/48" |

## Output Files

### 1. Switch Configuration Files (.txt)

**Naming**: `{SwitchName}_{L2|L3}_config.txt`

Example: `SHS-MDF1-1_L3_config.txt`

**Content**:
- VLAN creation commands
- I-SID mappings
- Interface configurations
- DHCP relay settings
- Routing protocols (L3 only)

### 2. Site Engine Export (CSV)

**Filename**: `SCS-Serials.csv`

**Columns**:
- serial number: Hardware serial
- mgmt clip: Management IP (L3: `{SiteID}.1.1.1`, L2: from mgmt VLAN)
- sysname: Switch hostname
- site name: `/World/LocationName` format
- topology role: L3 or L2_ACCESS
- SiteID: Numeric site identifier
- IsidPrefix: 4-character site prefix

**Example**:
```
serial number,mgmt clip,sysname,site name,topology role,SiteID,IsidPrefix
JA072336G-00237,43.1.1.1,SHS-MDF1-1,/World/SCOTLAND HIGH SCHOOL,L3,43,SHS
JA012319G-00304,10.143.8.2,SHS-MDF1-2,/World/SCOTLAND HIGH SCHOOL,L2_ACCESS,43,SHS
```

## IP Address Calculation

### Layer 3 Switches (Distribution)

- **Management Clip (mgmt clip)**: `{SiteID}.1.1.1/32`
- Example: SiteID 43 → `43.1.1.1/32`

### Layer 2 Switches (Access)

- **Management VLAN IP**: Calculated from Netmgmt VLAN subnet + switch increment
- Example: Netmgmt `10.143.8.0/24` → `10.143.8.2` (second L2 switch in site)

## Workflow

### Step 1: Upload
1. Select Excel configuration file
2. App parses all sheets and extracts switch data
3. Displays summary of found switches, VLANs, and sites

### Step 2: Configure
1. Enter hardware serial numbers for each switch
2. Set DHCP relay servers (defaults: 10.1.1.202, 10.1.1.207)
3. Optional: Add WAN link configuration (L3 switches)

### Step 3: Review
1. View hierarchical network structure
2. Confirm MDF → IDF relationships
3. Click switches to see VLAN details
4. Verify topology and settings

### Step 4: Export
1. Download all switch configuration files
2. Download Site Engine CSV
3. Files ready for deployment

## Security Considerations

### Input Validation
- ✅ File type validation (xlsx/xls only)
- ✅ File size limits (10MB max)
- ✅ No executable file uploads
- ✅ Subnet/IP validation
- ✅ Serial number format validation

### Data Protection
- ✅ Temporary files cleaned up immediately
- ✅ No sensitive data logged
- ✅ CORS configured to localhost only
- ✅ Security headers applied
- ✅ XSS prevention in React
- ✅ No arbitrary code execution

### Network Safety
- ✅ Backend runs on localhost:3001 only
- ✅ Frontend runs on localhost:3000 only
- ✅ No external API calls
- ✅ All processing local to machine

## Version Control & Branching

Initialize Git repository:

```bash
git init
git add .
git commit -m "Initial commit: Network Config Tool v1.0.0"
```

### Recommended Branch Strategy

```bash
# Main production branch
git checkout -b main

# Development branch
git checkout -b develop

# Feature branches for enhancements
git checkout -b feature/vlansupport
git checkout -b feature/topologyvisualization

# Bugfix branches
git checkout -b bugfix/serialvalidation
```

### Workflow Example

```bash
# Create feature branch
git checkout -b feature/enhanced-topology

# Make changes
# ... edit files ...

# Commit
git add .
git commit -m "feat: Add D3 topology visualization"

# Push to develop
git push origin feature/enhanced-topology

# Create pull request for code review
```

## Troubleshooting

### Port Already in Use
```bash
# Backend (3001) in use:
PORT=3002 npm start

# Frontend (3000) in use:
cd frontend && npm run dev -- --port 3001
```

### Excel File Not Parsing
- Ensure file contains valid sheet names
- Check column names match expected format
- Verify VLAN data is in numeric format
- Maximum 10MB file size

### Configuration Generation Errors
- Ensure all switch names are unique
- Check Site IDs are numeric (1-255)
- Verify serial numbers are not empty
- Check DHCP server IPs are valid format

### CORS Errors
- Ensure backend is running on localhost:3001
- Check frontend is on localhost:3000
- Clear browser cache and cookies
- Restart both services

## Development & Customization

### Adding New Features

1. **Backend**: Add routes in `backend/routes/`
2. **Frontend**: Add pages in `frontend/src/pages/`
3. **Services**: Extend `backend/services/` for new logic
4. **Styling**: Modify CSS in `frontend/src/App.css`

### Template Modifications

Edit L2/L3 configuration templates in `backend/templates/`:
- `l3-template.txt`: Layer 3 switch template
- `l2-template.txt`: Layer 2 switch template

Use placeholders:
- `{switchName}`: Switch hostname
- `{siteId}`: Site ID
- `{dhcpServer1}`: Primary DHCP
- `{dhcpServer2}`: Secondary DHCP

## Performance

- File upload: < 5 seconds for typical files
- Configuration generation: < 1 second per 50 switches
- Memory usage: ~100-150MB typical
- Supports up to 500+ switches per file

## Support & Maintenance

- Check logs in browser console (F12)
- Backend logs output to terminal
- Temporary files auto-cleanup
- Regular backups of your Excel source files recommended

## License

PROPRIETARY - Extreme Networks Internal Use Only

## Version History

### v1.0.0 (Initial Release)
- Excel file parsing
- L2/L3 configuration generation
- Site Engine CSV export
- Network topology visualization
- Serial number management
- DHCP relay configuration

---

**Last Updated**: 2026-01-01
**Extreme Networks Configuration Management Suite**
