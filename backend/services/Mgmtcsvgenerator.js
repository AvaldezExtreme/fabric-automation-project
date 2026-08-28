// Management CSV Generator
// Generates mgmt.csv with serial number to management IP mappings
// No external dependencies - pure string formatting

export const generateMgmtCsv = (switches, serials) => {
  // serials format: array of { serialNumber, siteId, switchName, switchType, ... }
  // switches format: array of switch data with siteId, mgmtVlan, etc.
  
  const csvLines = [];
  
  // Add header
  csvLines.push('SerialNumber,MgmtVLAN,MgmtISID,MgmtIP,MgmtMask,MgmtGateway,SystemName,SiteName');
  
  console.log(`DEBUG mgmtCsvGenerator: Processing ${serials.length} serials`);
  
  // Process each serial
  serials.forEach((serial, idx) => {
    try {
      // Find corresponding switch - try multiple ways
      let switchData = null;
      
      // Try by switchName (if provided)
      if (serial.switchName) {
        switchData = switches.find(
          sw => sw.name === serial.switchName && sw.siteId === serial.siteId
        );
      }
      
      // Fallback: find any switch in the serial's siteId
      if (!switchData && serial.siteId) {
        switchData = switches.find(sw => sw.siteId === serial.siteId);
      }
      
      if (switchData) {
        // Get management VLAN and related info
        const mgmtVlan = switchData.mgmtVlan || 16;
        const siteId = switchData.siteId;
        const octet = switchData.mgmtIpOctet;
        
        // Find the management VLAN subnet from VLANs
        const mgmtVlanData = switchData.vlans.find(v => v.vlanId === parseInt(mgmtVlan));
        let subnet = '255.255.255.0'; // default
        
        if (mgmtVlanData && mgmtVlanData.subnet) {
          subnet = cidrToSubnet(mgmtVlanData.subnet);
        }
        
        // Calculate IPs
        const mgmtIp = `10.${siteId}.${mgmtVlan}.${octet}`;
        const mgmtGateway = `10.${siteId}.${mgmtVlan}.1`;
        
        // Get I-SID for management VLAN
        const mgmtIsid = mgmtVlanData ? mgmtVlanData.isid : `12${siteId}${mgmtVlan.toString().padStart(4, '0')}`;
        
        // Site name as a Site Engine path - same /World/<Location> convention
        // as the Site Engine CSV (spaces kept; csv quoting handles them)
        const siteName = switchData.location ? `/World/${switchData.location}` : '/World/Unknown';
        
        // Get serial number from various possible fields
        const serialNumber = serial.serialNumber || serial.serial || '';
        
        // Build CSV row - properly escaped for CSV format
        const row = [
          escapeCSV(serialNumber),
          mgmtVlan,
          mgmtIsid,
          mgmtIp,
          subnet,
          mgmtGateway,
          escapeCSV(switchData.name),
          escapeCSV(siteName)
        ].join(',');
        
        csvLines.push(row);
        
        console.log(`DEBUG MGMT CSV [${idx}]: ${serialNumber} (${switchData.name}) → ${mgmtIp}`);
      } else {
        console.warn(`DEBUG MGMT CSV [${idx}]: No switch found for siteId=${serial.siteId}, switchName=${serial.switchName}`);
      }
    } catch (error) {
      console.error(`DEBUG MGMT CSV [${idx}]: Error processing serial:`, error.message, serial);
    }
  });
  
  // Join all lines with newline
  const csv = csvLines.join('\n');
  console.log(`DEBUG mgmtCsvGenerator: Generated ${csvLines.length - 1} CSV rows (plus 1 header)`);
  return csv;
};

// Helper: Escape CSV values (handle quotes, commas, newlines)
const escapeCSV = (value) => {
  if (!value) return '';
  
  const stringValue = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
};

// Helper: Convert CIDR notation subnet to dot notation
const cidrToSubnet = (cidrNotation) => {
  if (!cidrNotation) return '255.255.255.0';
  
  // Handle "10.0.0.0/24" format
  const parts = cidrNotation.split('/');
  if (parts.length === 2) {
    const cidr = parseInt(parts[1]);
    return cidrToDottedDecimal(cidr);
  }
  
  // If it's already in dot notation, return it
  if (cidrNotation.includes('.')) {
    return cidrNotation;
  }
  
  return '255.255.255.0'; // default
};

// Helper: Convert CIDR to dotted decimal notation
const cidrToDottedDecimal = (cidr) => {
  const masks = {
    8: '255.0.0.0',
    16: '255.255.0.0',
    23: '255.255.254.0',
    24: '255.255.255.0',
    22: '255.255.252.0',
    21: '255.255.248.0',
    25: '255.255.255.128',
    26: '255.255.255.192',
    27: '255.255.255.224',
    28: '255.255.255.240',
    29: '255.255.255.248',
    30: '255.255.255.252',
    31: '255.255.255.254',
    32: '255.255.255.255'
  };
  
  return masks[cidr] || '255.255.255.0';
};