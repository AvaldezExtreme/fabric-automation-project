import { stringify } from 'csv-stringify/sync';
import { mgmtAddressFor } from './mgmtAddressing.js';

export const generateSiteEngineCsv = (switches, serialMap = {}, skippedSerials = false) => {
  const records = [];
  
  switches.forEach(sw => {
    // Get serial number from map or use placeholder. Since v2.5 the map
    // values are structured objects ({serial, serialNumber, siteId, ...}) -
    // the CSV column must carry ONLY the serial string, never the object.
    const serialKey = sw.name;
    const rawSerial = serialMap[serialKey];
    let serialNumber = typeof rawSerial === 'object' && rawSerial !== null
      ? (rawSerial.serial || rawSerial.serialNumber || `TBD-${sw.name}`)
      : (rawSerial || `TBD-${sw.name}`);

    // If serials were skipped, mark as TBD
    if (skippedSerials && !serialMap[serialKey]) {
      serialNumber = `TBD-${sw.name}`;
    }
    
    // Mgmt address exactly as the switch config has it (mgmtAddressing.js):
    // L3 = its CLIP (loopback or SiteID.1.1.1); L2 = mgmt VLAN subnet + the
    // switch's per-site number. (It used the switch-name suffix before, so
    // every new closet restarted at .1 and collided.)
    const addr = mgmtAddressFor(sw);
    const mgmtClip = sw.type === 'L3' ? addr.clip : (addr.ip || '10.0.0.1');
    
    // Determine topology role
    const topologyRole = sw.type === 'L3' ? 'L3' : 'L2_ACCESS';
    
    // Extract site name from location - format as /World/LocationName
    const siteName = sw.location ? `/World/${sw.location}` : `/World/Unknown`;
    
    // Get ISID prefix from service app
    const isidPrefix = sw.isidPrefix || 'UNK';
    
    records.push({
      'serial number': serialNumber,
      'mgmt clip': mgmtClip,
      'sysname': sw.name,
      'site name': siteName,
      'topology role': topologyRole,
      'SiteID': sw.siteId,
      'IsidPrefix': isidPrefix
    });
  });
  
  // Generate CSV
  const csv = stringify(records, {
    header: true,
    columns: ['serial number', 'mgmt clip', 'sysname', 'site name', 'topology role', 'SiteID', 'IsidPrefix']
  });
  
  return csv;
};

export const validateSerialMap = (serialMap) => {
  for (const [key, value] of Object.entries(serialMap)) {
    const serial = typeof value === 'object' && value !== null
      ? (value.serial || value.serialNumber || '')
      : (value || '');
    if (!String(serial).trim()) {
      throw new Error(`Serial number missing for switch: ${key}`);
    }
  }
  return true;
};