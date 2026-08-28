import { stringify } from 'csv-stringify/sync';

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
    
    // Calculate mgmt IP based on switch type
    let mgmtClip;
    if (sw.type === 'L3') {
      // L3: SiteID.1.1.1/32
      mgmtClip = `${sw.siteId}.1.1.1`;
    } else {
      // L2: Use management VLAN subnet
      const mgmtVlan = sw.vlans.find(v => v.vlanName.toLowerCase().includes('netmgmt'));
      if (mgmtVlan && mgmtVlan.subnet) {
        const octets = mgmtVlan.subnet.split('/')[0].split('.');
        const lastOctet = parseInt(octets[3]) + parseInt(sw.name.match(/\d+$/) || 1);
        mgmtClip = `${octets[0]}.${octets[1]}.${octets[2]}.${lastOctet}`;
      } else {
        mgmtClip = '10.0.0.1';
      }
    }
    
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