import XLSX from 'xlsx';
import { sanitizeInput } from '../middleware/validation.js';

export const parseExcelFile = (filePath) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheets = {};
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      sheets[sheetName] = data;
    }
    
    return sheets;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
};

const normalizeDeviceType = (deviceType) => {
  if (!deviceType) return null;
  
  const normalized = deviceType.toLowerCase().trim();
  
  if (['data', 'wire', 'wired', 'users', 'workstations', 'computers'].includes(normalized)) {
    return 'data';
  }
  
  if (['voice', 'voip', 'phone', 'ipphone', 'telephone'].includes(normalized)) {
    return 'voice';
  }
  
  if (['ap', 'wap', 'wifi', 'wireless', 'apmgmt', 'ap-mgmt', 'apmanagement'].includes(normalized)) {
    return 'ap';
  }
  
  if (['camera', 'security', 'cctv', 'cameras', 'surveillance'].includes(normalized)) {
    return 'camera';
  }
  
  return null;
};

export const extractNetworkData = (excelSheets) => {
  const switches = new Map();
  const siteVlans = new Map();
  const siteDeviceTypes = new Map();
  let l2DefaultGateway = '10.0.0.254';
  let rowCounter = 0;
  
  const allRows = [];
  for (const [sheetName, rows] of Object.entries(excelSheets)) {
    if (rows.length > 2 && rows[2]['DefaultGateway']) {
      const m3Gateway = rows[2]['DefaultGateway'].toString().trim();
      if (m3Gateway && m3Gateway !== '' && m3Gateway.toLowerCase() !== 'nan') {
        l2DefaultGateway = m3Gateway;
      }
    }
    
    rows.forEach((row, index) => {
      allRows.push({ row, sheetName, rowIndex: index });
    });
  }
  
  // ===== FIRST PASS: Extract ALL VLANs directly from Column E (Edge Vlans) =====
let lastKnownSiteId = null;

allRows.forEach(({ row }) => {
  // Direct VLAN extraction from Column E
  const edgeVlan = row['Edge Vlans'];  // Column E
  const vlanName = sanitizeInput(row['Name']?.toString() || '');  // Column F
  const subnet = sanitizeInput(row['Subnet']?.toString() || '');  // Column G
  let siteId = row['SiteID'];  // Column P
  const layerISID = row['Layer 2 VSN I-SID'] || row['Layer 3 VSN I-SID (VRF)'];  // Column I or K
  const isidName = sanitizeInput(row['I-SID Name']?.toString() || '');  // Column J
  const deviceType = row['DeviceType'];  // Column H
  const normalizedType = normalizeDeviceType(deviceType);
  
  // If siteId is missing, inherit from previous row
  if (!siteId && lastKnownSiteId) {
    siteId = lastKnownSiteId;
  }
  
  // Track siteId for next row
  if (siteId) {
    lastKnownSiteId = siteId;
  }
  
  // Simple check: if Column E (Edge Vlans) has data, it's a VLAN row
  if (edgeVlan && vlanName && siteId && layerISID) {
    if (!siteVlans.has(siteId)) {
      siteVlans.set(siteId, []);
    }
    
    const vlanId = parseInt(edgeVlan);
    const existingVlan = siteVlans.get(siteId).find(v => v.vlanId === vlanId);
    
    if (!existingVlan) {
      siteVlans.get(siteId).push({
        vlanId: vlanId,
        vlanName: vlanName,
        subnet: subnet,
        isid: parseInt(layerISID),
        isidName: isidName,
        deviceType: normalizedType
      });
      
      console.log(`DEBUG VLAN: Site ${siteId}, VLAN ${vlanId} (${vlanName}) - I-SID ${layerISID}`);
    }
    
    // Track device types
    if (normalizedType) {
      if (!siteDeviceTypes.has(siteId)) {
        siteDeviceTypes.set(siteId, {});
      }
      
      const typeMap = siteDeviceTypes.get(siteId);
      if (!typeMap[normalizedType]) {
        typeMap[normalizedType] = {
          isid: parseInt(layerISID),
          vlanId: vlanId,
          vlanName: vlanName
        };
      }
    }
  }
});

console.log(`\nDEBUG: Total VLAN sites parsed: ${siteVlans.size}`);
siteVlans.forEach((vlans, siteId) => {
  console.log(`  Site ${siteId}: ${vlans.length} VLANs`);
});
  
  // ===== SECOND PASS: Extract SWITCHES (only rows with SwitchName) =====
const siteOctetCounters = new Map();  // Track octet per site

allRows.forEach(({ row }) => {
  // Only extract if row has SwitchName
  if (!row['SwitchName'] || row['SwitchName'].toString().includes('SwitchName')) return;
  
  const switchName = sanitizeInput(row['SwitchName']?.toString() || '');
  const switchType = sanitizeInput(row['SwitchType']?.toString() || '').toUpperCase();
  const siteId = row['SiteID'];
  const location = sanitizeInput(row['Location']?.toString() || '');
  const serviceApp = sanitizeInput(row['Service Application']?.toString() || '');
  const defaultGw = sanitizeInput(row['DefaultGateway']?.toString() || '');
  const closet = sanitizeInput(row['Closet']?.toString() || '');
  const mgmtVlan = row['MgmtVLAN'];
  
  const switchKey = `${switchName}|${siteId}|${switchType}`;
  
  if (!switches.has(switchKey)) {
    // Initialize counter for this site if not exists
    if (!siteOctetCounters.has(siteId)) {
      siteOctetCounters.set(siteId, 0);
    }
    
    // Increment counter for this site
    const currentOctet = siteOctetCounters.get(siteId) + 1;
    siteOctetCounters.set(siteId, currentOctet);
    
    switches.set(switchKey, {
      name: switchName,
      type: switchType,
      siteId: siteId,
      location: location,
      serviceApp: serviceApp,
      mgmtVlan: mgmtVlan,
      defaultGateway: defaultGw,
      closet: closet,
      mgmtIpOctet: currentOctet,  // Per-site sequential!
      vlans: [],
      isidPrefix: extractIsidPrefix(serviceApp),
      autoSenseCommands: [],
      l2DefaultGateway: l2DefaultGateway
    });
    
    console.log(`DEBUG SWITCH: Site ${siteId}, Octet .${currentOctet}, ${switchName} (${switchType})`);
  }
});

console.log(`\nDEBUG: Total switches parsed: ${switches.size}`);
siteOctetCounters.forEach((octet, siteId) => {
  console.log(`  Site ${siteId}: ${octet} switches`);
});
  
  // ===== THIRD PASS: Assign VLANs to switches =====
  const switchesArray = Array.from(switches.values());
  
  switchesArray.forEach(sw => {
    const siteId = sw.siteId;
    const allSiteVlans = siteVlans.get(siteId) || [];
    sw.vlans = [...allSiteVlans];
    
    sw.autoSenseCommands = generateAutoSenseCommands(siteDeviceTypes.get(siteId) || {});
    
    if (sw.type === 'L2') {
      sw.l2DefaultGateway = l2DefaultGateway;
    }
  });
  
  return switchesArray;
};

const generateAutoSenseCommands = (deviceTypeMap) => {
  const commands = [];
  
  if (deviceTypeMap.data) {
    commands.push({
      type: 'data',
      command: `auto-sense data i-sid ${deviceTypeMap.data.isid}`
    });
  }
  
  if (deviceTypeMap.voice) {
    const cVid = deviceTypeMap.data ? deviceTypeMap.data.vlanId : deviceTypeMap.voice.vlanId;
    commands.push({
      type: 'voice',
      command: `auto-sense voice i-sid ${deviceTypeMap.voice.isid} c-vid ${cVid}`
    });
  }
  
  if (deviceTypeMap.ap) {
    commands.push({
      type: 'ap',
      command: `auto-sense fa wap-type1 i-sid ${deviceTypeMap.ap.isid}`
    });
  }
  
  if (deviceTypeMap.camera) {
    commands.push({
      type: 'camera',
      command: `auto-sense fa camera i-sid ${deviceTypeMap.camera.isid}`
    });
  }
  
  return commands;
};

export const extractIsidPrefix = (serviceApp) => {
  if (!serviceApp) return 'UNK';
  const parts = serviceApp.split(/[\s\-]/);
  return parts[0].substring(0, 4).toUpperCase();
};

export const getMgmtVlanSubnet = (switches) => {
  for (const sw of switches) {
    if (sw.vlans && sw.vlans.length > 0) {
      const netmgmt = sw.vlans.find(v => v.vlanName.toLowerCase().includes('netmgmt'));
      if (netmgmt && netmgmt.subnet) {
        return netmgmt.subnet;
      }
    }
  }
  return '10.0.0.0/24';
};

export const buildTopology = (switches) => {
  const topology = {
    l3Switches: [],
    l2Switches: [],
    connections: []
  };
  
  switches.forEach(sw => {
    const node = {
      id: sw.name,
      label: sw.name,
      type: sw.type,
      siteId: sw.siteId,
      location: sw.location,
      closet: sw.closet,
      vlans: sw.vlans.length
    };
    
    if (sw.type === 'L3') {
      topology.l3Switches.push(node);
    } else {
      topology.l2Switches.push(node);
    }
  });
  
  const mdfSwitches = switches.filter(s => s.name.includes('MDF'));
  const idfSwitches = switches.filter(s => s.name.includes('IDF'));
  
  mdfSwitches.forEach(mdf => {
    idfSwitches.forEach(idf => {
      if (mdf.siteId === idf.siteId) {
        topology.connections.push({
          source: mdf.name,
          target: idf.name,
          type: 'uplink'
        });
      }
    });
  });
  
  return topology;
};