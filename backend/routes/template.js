// ============================================
// Template & Sample Data Routes
// Version: V2608202
// Purpose: Generate the fillable Excel template in-app. Matches Carlos's
//          proven column layout (A-T) with his auto-population formulas:
//          I-SID, I-SID Name, SwitchName, SiteID compute themselves.
//          Formula columns are locked; helper column T is hidden.
// ============================================

import express from 'express';
import ExcelJS from 'exceljs';
import { extractNetworkData, buildTopology } from '../services/excelParser.js';

const router = express.Router();

const TEMPLATE_VERSION = 'V2608202';
const DATA_ROWS = 1000; // formulas + unlocked input cells prepared through this row

// Column layout A-T — matches the original FabricVlanIsidTemplate exactly.
// Header names MUST match what excelParser expects.
const COLUMNS = [
  { header: 'Location', key: 'Location', width: 26 },                        // A input
  { header: 'Service Application', key: 'Service Application', width: 17 },  // B input
  { header: 'Layer', key: 'Layer', width: 8 },                               // C input (12=L2 VSN, 13=L3 VSN)
  { header: 'Site', key: 'Site', width: 8 },                                 // D input
  { header: 'Edge Vlans', key: 'Edge Vlans', width: 11 },                    // E input
  { header: 'Name', key: 'Name', width: 15 },                                // F input
  { header: 'Subnet', key: 'Subnet', width: 17 },                            // G input (manual by design)
  { header: 'DeviceType', key: 'DeviceType', width: 12 },                    // H input (dropdown)
  { header: 'Layer 2 VSN I-SID', key: 'Layer 2 VSN I-SID', width: 16 },      // I AUTO
  { header: 'I-SID Name', key: 'I-SID Name', width: 17 },                    // J AUTO
  { header: 'Layer 3 VSN I-SID (VRF)', key: 'Layer 3 VSN I-SID (VRF)', width: 19 }, // K input
  { header: 'DistrictName', key: 'DistrictName', width: 18 },                // L input
  { header: 'DefaultGateway', key: 'DefaultGateway', width: 15 },            // M input
  { header: 'SwitchName', key: 'SwitchName', width: 16 },                    // N AUTO
  { header: 'SwitchType', key: 'SwitchType', width: 11 },                    // O input (dropdown)
  { header: 'SiteID', key: 'SiteID', width: 9 },                             // P AUTO (mirrors D)
  { header: 'MgmtVLAN', key: 'MgmtVLAN', width: 10 },                        // Q input
  { header: 'Ports', key: 'Ports', width: 8 },                               // R input
  { header: 'Closet', key: 'Closet', width: 9 },                             // S input
  { header: 'Text Formula For Site', key: 'Text Formula For Site', width: 12 } // T AUTO (hidden helper)
];

const AUTO_COLS = ['I', 'J', 'N', 'P', 'T'];
const INPUT_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'O', 'Q', 'R', 'S'];

// Example rows (plain values so a freshly downloaded template still parses).
// Demo site: Lincoln High School, Site 10, Layer 12 (L2 VSN).
const EXAMPLE_ROWS = [
  ['LINCOLN HIGH SCHOOL', 'LHS', 12, 10, 8, 'Netmgmt', '10.110.8.0/24', 'ap', 12100008, 'LHS-Netmgmt', '', 'DEMO DISTRICT', '10.110.8.1', 'LHS-MDF1-1', 'L3', 10, 8, '', 'MDF1', '0008'],
  ['LINCOLN HIGH SCHOOL', 'LHS', 12, 10, 16, 'VoIP', '10.110.16.0/24', 'voice', 12100016, 'LHS-VoIP', '', 'DEMO DISTRICT', '10.110.8.1', 'LHS-IDF1-1', 'L2', 10, 8, '', 'IDF1', '0016'],
  ['LINCOLN HIGH SCHOOL', 'LHS', 12, 10, 24, 'Data', '10.110.24.0/24', 'data', 12100024, 'LHS-Data', '', 'DEMO DISTRICT', '10.110.8.1', 'LHS-IDF2-1', 'L2', 10, 8, '', 'IDF2', '0024'],
  ['LINCOLN HIGH SCHOOL', 'LHS', 12, 10, 32, 'Cameras', '10.110.32.0/24', 'camera', 12100032, 'LHS-Cameras', '', 'DEMO DISTRICT', '10.110.8.1', '', '', 10, '', '', '', '0032']
];

// ===== GET /api/template - generate the fillable Excel template =====
router.get('/', async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'FACE - Fabric Auto Configuration Engine';
    wb.created = new Date();

    // --- Instructions sheet ---
    const info = wb.addWorksheet('Instructions', {
      properties: { tabColor: { argb: 'FF5B059C' } }
    });
    info.columns = [{ width: 4 }, { width: 115 }];

    const lines = [
      ['', ''],
      ['', 'FACE — Fabric Auto Configuration Engine — Data Template ' + TEMPLATE_VERSION],
      ['', ''],
      ['', 'THE MAGIC: SEVERAL COLUMNS FILL THEMSELVES'],
      ['', 'These columns are AUTO-CALCULATED and locked — do not type in them:'],
      ['', '   • Layer 2 VSN I-SID (I) — builds itself from Layer + Site + VLAN (e.g. 12 + 10 + 0008 = 12100008)'],
      ['', '   • I-SID Name (J) — Service Application + VLAN Name (e.g. LHS-Netmgmt)'],
      ['', '   • SwitchName (N) — Service Application + Closet + auto-number (e.g. LHS-MDF1-1; type MDF1 again on another row and you get LHS-MDF1-2)'],
      ['', '   • SiteID (P) — mirrors the Site column'],
      ['', ''],
      ['', 'HOW TO FILL IT OUT (start at row 6, below the gray example rows)'],
      ['', '1. One row per switch. Fill: Location, Service Application (short site code like LHS), Layer (12), Site (a number), Edge Vlans, Name, Subnet, DeviceType, DefaultGateway, SwitchType (L2/L3), MgmtVLAN, Closet.'],
      ['', '2. Watch SwitchName and I-SID build themselves as you type.'],
      ['', '3. Extra VLANs for a site go on their own rows: fill Service Application, Layer, Site, Edge Vlans, Name, Subnet, DeviceType — leave Closet/SwitchType blank (no switch on that row).'],
      ['', '4. When your data is in, DELETE the gray example rows: select rows 2-5, right-click, Delete Rows.'],
      ['', '5. Save and upload at the FACE portal.'],
      ['', ''],
      ['', 'COLUMN NOTES'],
      ['', 'Layer — 12 for Layer 2 VSN (most common), 13 for Layer 3 VSN.'],
      ['', 'Site — unique number per site/school (e.g. 10, 20, 43). Drives the I-SID, so keep it unique.'],
      ['', 'Edge Vlans — VLAN ID, 1-4094.'],
      ['', 'Subnet — CIDR, e.g. 10.110.8.0/24. Tip: many districts use 10.(Site+100).(VLAN).0/24 — but enter whatever matches your addressing plan.'],
      ['', 'DeviceType — data, voice, ap, or camera (dropdown). Drives auto-sense port configuration.'],
      ['', 'DefaultGateway — gateway IP for the site management network.'],
      ['', 'SwitchType — L3 for core/routing (usually the MDF), L2 for access (IDFs).'],
      ['', 'MgmtVLAN — management VLAN ID (usually your Netmgmt VLAN).'],
      ['', 'Closet — MDF1, IDF1, IDF2... This is what generates the switch names.'],
      ['', 'Layer 3 VSN I-SID (VRF) — only when using L3 VSNs, otherwise leave blank.'],
      ['', ''],
      ['', 'The sheet is protected so the formulas can\'t be broken by accident. Every input column is editable.'],
      ['', '© Extreme Networks — generated by FACE ' + TEMPLATE_VERSION]
    ];
    lines.forEach(l => info.addRow(l));
    info.getRow(2).font = { bold: true, size: 16, color: { argb: 'FF5B059C' } };
    info.getRow(4).font = { bold: true, size: 12, color: { argb: 'FF00926B' } };
    info.getRow(11).font = { bold: true, size: 12 };
    info.getRow(18).font = { bold: true, size: 12 };

    // --- Data sheet ---
    const ws = wb.addWorksheet('Fabric Data', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { tabColor: { argb: 'FF00CC99' } }
    });
    ws.columns = COLUMNS;

    // Header styling: purple for inputs, green for auto columns
    ws.getRow(1).eachCell((cell, colNumber) => {
      const colLetter = ws.getColumn(colNumber).letter;
      const isAuto = AUTO_COLS.includes(colLetter);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAuto ? 'FF00926B' : 'FF5B059C' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center' };
      if (isAuto) {
        cell.note = 'AUTO-CALCULATED — locked. This column fills itself from your other entries.';
      }
    });
    ws.getRow(1).height = 22;

    // Example rows 2-5 (plain values, gray italic)
    EXAMPLE_ROWS.forEach(rowData => {
      const row = ws.addRow(rowData);
      row.eachCell({ includeEmpty: false }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EDFB' } };
        cell.font = { italic: true, color: { argb: 'FF555555' } };
      });
    });

    // Auto-population formulas for rows 6..DATA_ROWS (Carlos's formulas,
    // SwitchName upgraded to COUNTIFS so closet numbering is per-site)
    const firstFormulaRow = EXAMPLE_ROWS.length + 2;
    for (let r = firstFormulaRow; r <= DATA_ROWS; r++) {
      ws.getCell(`T${r}`).value = { formula: `IF(E${r}="","",TEXT(E${r},"0000"))` };
      ws.getCell(`I${r}`).value = { formula: `IF(OR(C${r}="",D${r}="",E${r}=""),"",LEFT(C${r},2)&LEFT(D${r},2)&LEFT(T${r},4))` };
      ws.getCell(`J${r}`).value = { formula: `IF(OR(B${r}="",F${r}=""),"",B${r}&"-"&F${r})` };
      ws.getCell(`N${r}`).value = { formula: `IF(OR(S${r}="",B${r}=""),"",B${r}&"-"&S${r}&"-"&COUNTIFS($S$2:S${r},S${r},$D$2:D${r},D${r}))` };
      ws.getCell(`P${r}`).value = { formula: `IF(D${r}="","",D${r})` };
    }

    // Hide the helper column (works invisibly)
    ws.getColumn('T').hidden = true;

    // Dropdown guardrails
    ws.dataValidations.add(`O2:O${DATA_ROWS}`, {
      type: 'list', allowBlank: true, formulae: ['"L2,L3"'],
      showErrorMessage: true, errorTitle: 'Invalid switch type',
      error: 'Pick L2 (access) or L3 (core/routing) from the dropdown.'
    });
    ws.dataValidations.add(`H2:H${DATA_ROWS}`, {
      type: 'list', allowBlank: true, formulae: ['"data,voice,ap,camera"'],
      showErrorMessage: true, errorTitle: 'Invalid device type',
      error: 'Pick data, voice, ap, or camera from the dropdown.'
    });
    ws.dataValidations.add(`C2:C${DATA_ROWS}`, {
      type: 'list', allowBlank: true, formulae: ['"12,13"'],
      showErrorMessage: true, errorTitle: 'Invalid layer',
      error: 'Use 12 for Layer 2 VSN or 13 for Layer 3 VSN.'
    });
    ws.dataValidations.add(`E2:E${DATA_ROWS}`, {
      type: 'whole', operator: 'between', formulae: [1, 4094], allowBlank: true,
      showErrorMessage: true, errorTitle: 'Invalid VLAN ID',
      error: 'VLAN ID must be a whole number between 1 and 4094.'
    });

    // Unlock input cells (everything else stays locked = formulas protected)
    for (let r = 2; r <= DATA_ROWS; r++) {
      INPUT_COLS.forEach(col => {
        ws.getCell(`${col}${r}`).protection = { locked: false };
      });
    }
    await ws.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: true,
      formatColumns: true,
      formatRows: true,
      insertRows: true,
      deleteRows: true,
      sort: true,
      autoFilter: true
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="FACE-Fabric-Template-${TEMPLATE_VERSION}.xlsx"`
    });
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(`[template] ${error.message}`);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// ===== GET /api/template/sample - demo dataset through the real parser =====
router.get('/sample', (req, res) => {
  try {
    // Two demo sites, defined as parser-shaped rows so the sample always
    // matches exactly what a real upload produces.
    const rows = [
      // Lincoln High School (site 10): 1 core + 2 access
      { 'SiteID': 10, 'Location': 'LINCOLN HIGH SCHOOL', 'SwitchName': 'LHS-MDF1-1', 'SwitchType': 'L3', 'Closet': 'MDF1', 'MgmtVLAN': 8, 'DefaultGateway': '10.110.8.1', 'Service Application': 'LHS', 'Edge Vlans': 8, 'Name': 'Netmgmt', 'Subnet': '10.110.8.0/24', 'DeviceType': 'ap', 'Layer 2 VSN I-SID': 12100008, 'I-SID Name': 'LHS-Netmgmt' },
      { 'SiteID': 10, 'Location': 'LINCOLN HIGH SCHOOL', 'SwitchName': 'LHS-IDF1-1', 'SwitchType': 'L2', 'Closet': 'IDF1', 'MgmtVLAN': 8, 'DefaultGateway': '10.110.8.1', 'Service Application': 'LHS', 'Edge Vlans': 16, 'Name': 'VoIP', 'Subnet': '10.110.16.0/24', 'DeviceType': 'voice', 'Layer 2 VSN I-SID': 12100016, 'I-SID Name': 'LHS-VoIP' },
      { 'SiteID': 10, 'Location': 'LINCOLN HIGH SCHOOL', 'SwitchName': 'LHS-IDF2-1', 'SwitchType': 'L2', 'Closet': 'IDF2', 'MgmtVLAN': 8, 'DefaultGateway': '10.110.8.1', 'Service Application': 'LHS', 'Edge Vlans': 24, 'Name': 'Data', 'Subnet': '10.110.24.0/24', 'DeviceType': 'data', 'Layer 2 VSN I-SID': 12100024, 'I-SID Name': 'LHS-Data' },
      { 'SiteID': 10, 'Edge Vlans': 32, 'Name': 'Cameras', 'Subnet': '10.110.32.0/24', 'DeviceType': 'camera', 'Layer 2 VSN I-SID': 12100032, 'I-SID Name': 'LHS-Cameras' },
      // Washington Elementary (site 20): 1 core + 3 access
      { 'SiteID': 20, 'Location': 'WASHINGTON ELEMENTARY', 'SwitchName': 'WES-MDF1-1', 'SwitchType': 'L3', 'Closet': 'MDF1', 'MgmtVLAN': 8, 'DefaultGateway': '10.120.8.1', 'Service Application': 'WES', 'Edge Vlans': 8, 'Name': 'Netmgmt', 'Subnet': '10.120.8.0/24', 'DeviceType': 'ap', 'Layer 2 VSN I-SID': 12200008, 'I-SID Name': 'WES-Netmgmt' },
      { 'SiteID': 20, 'Location': 'WASHINGTON ELEMENTARY', 'SwitchName': 'WES-IDF1-1', 'SwitchType': 'L2', 'Closet': 'IDF1', 'MgmtVLAN': 8, 'DefaultGateway': '10.120.8.1', 'Service Application': 'WES', 'Edge Vlans': 16, 'Name': 'VoIP', 'Subnet': '10.120.16.0/24', 'DeviceType': 'voice', 'Layer 2 VSN I-SID': 12200016, 'I-SID Name': 'WES-VoIP' },
      { 'SiteID': 20, 'Location': 'WASHINGTON ELEMENTARY', 'SwitchName': 'WES-IDF2-1', 'SwitchType': 'L2', 'Closet': 'IDF2', 'MgmtVLAN': 8, 'DefaultGateway': '10.120.8.1', 'Service Application': 'WES', 'Edge Vlans': 24, 'Name': 'Data', 'Subnet': '10.120.24.0/24', 'DeviceType': 'data', 'Layer 2 VSN I-SID': 12200024, 'I-SID Name': 'WES-Data' },
      { 'SiteID': 20, 'Location': 'WASHINGTON ELEMENTARY', 'SwitchName': 'WES-IDF3-1', 'SwitchType': 'L2', 'Closet': 'IDF3', 'MgmtVLAN': 8, 'DefaultGateway': '10.120.8.1', 'Service Application': 'WES', 'Edge Vlans': 40, 'Name': 'Guest', 'Subnet': '10.120.40.0/24', 'DeviceType': 'data', 'Layer 2 VSN I-SID': 12200040, 'I-SID Name': 'WES-Guest' }
    ];

    const sheets = { 'Fabric Data': rows };
    const switches = extractNetworkData(sheets);
    const topology = buildTopology(switches);

    res.json({
      success: true,
      sample: true,
      data: {
        switches,
        topology,
        sheetNames: Object.keys(sheets),
        switchCount: switches.length,
        vlanCount: switches.reduce((sum, sw) => sum + (sw.vlans?.length || 0), 0)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`[template/sample] ${error.message}`);
    res.status(500).json({ error: 'Failed to build sample data' });
  }
});

export default router;
