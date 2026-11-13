// Management CSV Generator
// Generates mgmt.csv with serial number to management IP mappings
// Addressing comes from mgmtAddressing.js - the same numbers the switch
// configs use, so this file always matches what is loaded on the switch.
import { mgmtAddressFor } from './mgmtAddressing.js';

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
        // Management VLAN, IP, mask and gateway - identical to the switch
        // config (L2: subnet's first three octets + per-site number; L3: its
        // own SVI address on the mgmt VLAN). Without a mgmt subnet, fall back
        // to the legacy 10.<site>.<VLAN> scheme only where it forms an address.
        // L3 switches without an SVI on the mgmt VLAN (routed closets) are
        // listed with their CLIP /32 and no gateway.
        const addr = mgmtAddressFor(switchData);
        const siteId = switchData.siteId;
        const mgmtVlan = addr.viaClip ? '' : addr.vlanId;
        const legacy = !addr.ip && addr.vlanId <= 255 ? `10.${siteId}.${addr.vlanId}` : null;
        const subnet = addr.mask;
        const mgmtIp = addr.ip || (legacy ? `${legacy}.${addr.octet}` : '');
        const mgmtGateway = addr.ip ? (addr.gateway || '') : (legacy ? `${legacy}.1` : '');
        const mgmtIsid = addr.viaClip ? '' : (addr.isid || `12${siteId}${addr.vlanId.toString().padStart(4, '0')}`);
        
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
