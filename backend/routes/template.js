// ============================================
// Template & Sample Data Routes
// Version: V2608201
// Purpose: Generate the fillable Excel template in-app (with dropdowns,
//          styled headers, instructions) and serve a demo dataset that
//          runs through the real parser.
// ============================================

import express from 'express';
import ExcelJS from 'exceljs';
import { extractNetworkData, buildTopology } from '../services/excelParser.js';

const router = express.Router();

const TEMPLATE_VERSION = 'V2608201';

// Column layout - header names MUST match what excelParser expects
const COLUMNS = [
  { header: 'SiteID', key: 'SiteID', width: 10 },
  { header: 'Location', key: 'Location', width: 28 },
  { header: 'SwitchName', key: 'SwitchName', width: 18 },
  { header: 'SwitchType', key: 'SwitchType', width: 12 },
  { header: 'Closet', key: 'Closet', width: 10 },
  { header: 'MgmtVLAN', key: 'MgmtVLAN', width: 11 },
  { header: 'DefaultGateway', key: 'DefaultGateway', width: 16 },
  { header: 'Service Application', key: 'Service Application', width: 18 },
  { header: 'Edge Vlans', key: 'Edge Vlans', width: 11 },
  { header: 'Name', key: 'Name', width: 16 },
  { header: 'Subnet', key: 'Subnet', width: 18 },
  { header: 'DeviceType', key: 'DeviceType', width: 12 },
  { header: 'Layer 2 VSN I-SID', key: 'Layer 2 VSN I-SID', width: 17 },
  { header: 'I-SID Name', key: 'I-SID Name', width: 18 },
  { header: 'Layer 3 VSN I-SID (VRF)', key: 'Layer 3 VSN I-SID (VRF)', width: 20 }
];

// Example rows shown in the template (Lincoln High School demo site)
const EXAMPLE_ROWS = [
  {
    'SiteID': 10, 'Location': 'LINCOLN HIGH SCHOOL', 'SwitchName': 'LHS-MDF1-1',
    'SwitchType': 'L3', 'Closet': 'MDF1', 'MgmtVLAN': 8, 'DefaultGateway': '10.110.8.1',
    'Service Application': 'LHS', 'Edge Vlans': 8, 'Name': 'Netmgmt',
    'Subnet': '10.110.8.0/24', 'DeviceType': 'ap',
    'Layer 2 VSN I-SID': 12100008, 'I-SID Name': 'LHS-Netmgmt'
  },
  {
    'SiteID': 10, 'Location': 'LINCOLN HIGH SCHOOL', 'SwitchName': 'LHS-IDF1-1',
    'SwitchType': 'L2', 'Closet': 'IDF1', 'MgmtVLAN': 8, 'DefaultGateway': '10.110.8.1',
    'Service Application': 'LHS', 'Edge Vlans': 16, 'Name': 'VoIP',
    'Subnet': '10.110.16.0/24', 'DeviceType': 'voice',
    'Layer 2 VSN I-SID': 12100016, 'I-SID Name': 'LHS-VoIP'
  },
  {
    'SiteID': 10, 'Location': 'LINCOLN HIGH SCHOOL', 'SwitchName': 'LHS-IDF2-1',
    'SwitchType': 'L2', 'Closet': 'IDF2', 'MgmtVLAN': 8, 'DefaultGateway': '10.110.8.1',
    'Service Application': 'LHS', 'Edge Vlans': 24, 'Name': 'Data',
    'Subnet': '10.110.24.0/24', 'DeviceType': 'data',
    'Layer 2 VSN I-SID': 12100024, 'I-SID Name': 'LHS-Data'
  },
  {
    'SiteID': 10, 'Edge Vlans': 32, 'Name': 'Cameras',
    'Subnet': '10.110.32.0/24', 'DeviceType': 'camera',
    'Layer 2 VSN I-SID': 12100032, 'I-SID Name': 'LHS-Cameras'
  }
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
    info.columns = [{ width: 4 }, { width: 110 }];

    const lines = [
      ['', ''],
      ['', 'FACE — Fabric Auto Configuration Engine — Data Template ' + TEMPLATE_VERSION],
      ['', ''],
      ['', 'HOW TO FILL THIS OUT'],
      ['', '1. Go to the "Fabric Data" tab. It contains one example site (Lincoln High School) — replace it with your own data.'],
      ['', '2. One row per switch. Put the switch info (SiteID, Location, SwitchName, SwitchType, Closet, MgmtVLAN, DefaultGateway, Service Application) and one VLAN on the same row.'],
      ['', '3. Extra VLANs for a site go on their own rows: fill only SiteID plus the VLAN columns (Edge Vlans, Name, Subnet, DeviceType, I-SID, I-SID Name).'],
      ['', '4. SwitchType and DeviceType are dropdowns — pick from the list.'],
      ['', '5. Every site needs a unique SiteID (a number). VLANs are shared by all switches in the same site.'],
      ['', ''],
      ['', 'COLUMN REFERENCE'],
      ['', 'SiteID — Number identifying the site/school. Same number on every row for that site.'],
      ['', 'Location — Site name, e.g. LINCOLN HIGH SCHOOL.'],
      ['', 'SwitchName — e.g. LHS-MDF1-1. Use MDF for core/distribution, IDF for access closets.'],
      ['', 'SwitchType — L3 (routing/core) or L2 (access).'],
      ['', 'Closet — MDF1, IDF1, IDF2...'],
      ['', 'MgmtVLAN — Management VLAN ID (usually the Netmgmt VLAN).'],
      ['', 'DefaultGateway — Gateway IP for this site\'s management network.'],
      ['', 'Service Application — Short site code (e.g. LHS). Used as the I-SID name prefix.'],
      ['', 'Edge Vlans — VLAN ID (1-4094).'],
      ['', 'Name — VLAN name, e.g. Netmgmt, VoIP, Data, Cameras.'],
      ['', 'Subnet — CIDR notation, e.g. 10.110.8.0/24.'],
      ['', 'DeviceType — data, voice, ap, or camera. Drives auto-sense port configuration.'],
      ['', 'Layer 2 VSN I-SID — Fabric service ID (4096-16777215). Must be unique per VLAN across the fabric.'],
      ['', 'I-SID Name — Descriptive name, e.g. LHS-Netmgmt.'],
      ['', 'Layer 3 VSN I-SID (VRF) — Only if using L3 VSNs; otherwise leave blank.'],
      ['', ''],
      ['', 'When finished: save this file and upload it at the FACE portal.'],
      ['', '© Extreme Networks — generated by FACE']
    ];
    lines.forEach(l => info.addRow(l));
    info.getRow(2).font = { bold: true, size: 16, color: { argb: 'FF5B059C' } };
    info.getRow(4).font = { bold: true, size: 12 };
    info.getRow(11).font = { bold: true, size: 12 };

    // --- Data sheet ---
    const ws = wb.addWorksheet('Fabric Data', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { tabColor: { argb: 'FF00CC99' } }
    });
    ws.columns = COLUMNS;

    // Header styling
    ws.getRow(1).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B059C' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { horizontal: 'center' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF3d0369' } } };
    });
    ws.getRow(1).height = 22;

    // Example rows (light purple so they read as samples)
    EXAMPLE_ROWS.forEach(rowData => {
      const row = ws.addRow(COLUMNS.map(c => rowData[c.key] !== undefined ? rowData[c.key] : ''));
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3EDFB' } };
        cell.font = { italic: true, color: { argb: 'FF555555' } };
      });
    });

    // Dropdown guardrails (rows 2-500)
    ws.dataValidations.add('D2:D500', {
      type: 'list', allowBlank: true, formulae: ['"L2,L3"'],
      showErrorMessage: true, errorTitle: 'Invalid switch type',
      error: 'Pick L2 (access) or L3 (core/routing) from the dropdown.'
    });
    ws.dataValidations.add('L2:L500', {
      type: 'list', allowBlank: true, formulae: ['"data,voice,ap,camera"'],
      showErrorMessage: true, errorTitle: 'Invalid device type',
      error: 'Pick data, voice, ap, or camera from the dropdown.'
    });
    ws.dataValidations.add('I2:I500', {
      type: 'whole', operator: 'between', formulae: [1, 4094], allowBlank: true,
      showErrorMessage: true, errorTitle: 'Invalid VLAN ID',
      error: 'VLAN ID must be a whole number between 1 and 4094.'
    });
    ws.dataValidations.add('M2:M500', {
      type: 'whole', operator: 'between', formulae: [4096, 16777215], allowBlank: true,
      showErrorMessage: true, errorTitle: 'Invalid I-SID',
      error: 'I-SID must be a whole number between 4096 and 16777215.'
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
