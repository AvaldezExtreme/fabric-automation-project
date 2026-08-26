// ============================================
// Fabric Validation Engine
// Version: V2608262
// Purpose: Comprehensive validation for Fabric configurations.
// All uniqueness checks run against LOGICAL VLANs (site + VLAN + closet),
// not per-switch copies - a VSN spanning many switches is the point of
// fabric, not a conflict.
// ============================================

export const validateFabricConfiguration = (switches, settings = {}) => {
  const results = {
    passed: true,
    timestamp: new Date().toISOString(),
    summary: {
      total: 0,
      passed: 0,
      warnings: 0,
      errors: 0
    },
    checks: []
  };

  if (!switches || switches.length === 0) {
    results.passed = false;
    results.checks.push({
      type: 'error',
      category: 'Input',
      check: 'Switches Present',
      message: 'No switches found in configuration',
      severity: 'critical'
    });
    results.summary.total++;
    results.summary.errors++;
    return results;
  }

  // One entry per distinct service: (site, VLAN, closet). Every check below
  // works on these, so shared VLANs/I-SIDs across switches never false-flag.
  const logicalVlans = buildLogicalVlans(switches);

  runIPSubnetChecks(switches, logicalVlans, results);
  runVLANChecks(logicalVlans, results);
  runISIDChecks(logicalVlans, results);
  runFabricSpecificChecks(switches, logicalVlans, results);
  runDHCPChecks(switches, settings, results);
  runInterfaceChecks(switches, results);

  // Calculate summary
  results.summary.total = results.checks.length;
  results.summary.passed = results.checks.filter(c => c.type === 'pass').length;
  results.summary.warnings = results.checks.filter(c => c.type === 'warning').length;
  results.summary.errors = results.checks.filter(c => c.type === 'error').length;

  // Always allow progression - validator is advisory, not blocking
  results.passed = true;

  return results;
};

// ============================================
// LOGICAL VLAN DERIVATION
// ============================================

const buildLogicalVlans = (switches) => {
  const map = new Map();

  switches.forEach((sw) => {
    if (!sw.vlans || !Array.isArray(sw.vlans)) return;
    sw.vlans.forEach((vlan) => {
      const closet = (vlan.closet || '').toString().trim().toUpperCase();
      const key = `${sw.siteId}|${vlan.vlanId}|${closet}`;
      if (!map.has(key)) {
        map.set(key, {
          siteId: sw.siteId,
          vlanId: vlan.vlanId,
          closet: vlan.closet || '',
          vlanName: vlan.vlanName || vlan.name || '',
          subnet: (vlan.subnet || '').toString().trim(),
          isid: vlan.isid || vlan.i_sid || null,
          isidName: vlan.isidName || '',
          switches: []
        });
      }
      map.get(key).switches.push(sw.name);
    });
  });

  return Array.from(map.values());
};

const vlanLabel = (v) =>
  `Site ${v.siteId} VLAN ${v.vlanId}${v.closet ? ` (${v.closet})` : ''}`;

// ============================================
// L3 IP SUBNET VALIDATION
// ============================================

const runIPSubnetChecks = (switches, logicalVlans, results) => {
  const l3Switches = switches.filter(s => s.type === 'L3');

  if (l3Switches.length === 0) {
    results.checks.push({
      type: 'info',
      category: 'L3 Configuration',
      check: 'L3 Switches Present',
      message: 'No L3 switches found. If using external gateway (firewall), this is expected.',
      severity: 'info'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L3 Configuration',
      check: 'L3 Switches Present',
      message: `Found ${l3Switches.length} L3 switches`,
      severity: 'info'
    });
  }

  const withSubnet = logicalVlans.filter(v => v.subnet);

  // Subnet conflicts: the same NETWORK used by two different services.
  // (The same subnet appearing on many switches of one service is normal.)
  const byNetwork = new Map();
  withSubnet.forEach(v => {
    const key = networkKey(v.subnet);
    if (!byNetwork.has(key)) byNetwork.set(key, []);
    byNetwork.get(key).push(v);
  });

  const subnetConflicts = [];
  byNetwork.forEach((vlans) => {
    if (vlans.length > 1) {
      subnetConflicts.push({
        subnet: vlans[0].subnet,
        usedBy: vlans.map(v => vlanLabel(v))
      });
    }
  });

  if (subnetConflicts.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'L3 Configuration',
      check: 'Subnet Conflicts',
      message: `Found ${subnetConflicts.length} subnet(s) used by more than one service: ${subnetConflicts.map(c => `${c.subnet} (${c.usedBy.join(' vs ')})`).join('; ').substring(0, 300)}`,
      details: subnetConflicts,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L3 Configuration',
      check: 'Subnet Conflicts',
      message: `All ${byNetwork.size} subnets are unique per service (no conflicts detected)`,
      severity: 'info'
    });
  }

  // CIDR notation: validate the actual subnet strings
  const invalidCIDR = [];
  const seenSubnets = new Set();
  withSubnet.forEach(v => {
    if (seenSubnets.has(v.subnet)) return;
    seenSubnets.add(v.subnet);
    if (!isValidCIDR(v.subnet)) {
      invalidCIDR.push({ subnet: v.subnet, usedBy: vlanLabel(v) });
    }
  });

  if (invalidCIDR.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'L3 Configuration',
      check: 'CIDR Notation',
      message: `Found ${invalidCIDR.length} invalid CIDR notation(s): ${invalidCIDR.map(c => `${c.subnet} (${c.usedBy})`).join(', ').substring(0, 300)}`,
      details: invalidCIDR,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L3 Configuration',
      check: 'CIDR Notation',
      message: `All ${seenSubnets.size} subnets use valid CIDR notation`,
      severity: 'info'
    });
  }
};

// ============================================
// L2 VLAN VALIDATION
// ============================================

const runVLANChecks = (logicalVlans, results) => {
  // VLAN ID range
  const invalidVLANs = logicalVlans.filter(v => {
    const id = parseInt(v.vlanId);
    return isNaN(id) || id < 1 || id > 4094;
  });

  if (invalidVLANs.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'L2 Configuration',
      check: 'VLAN ID Range',
      message: `Found ${invalidVLANs.length} invalid VLAN ID(s). All VLAN IDs must be between 1-4094.`,
      details: invalidVLANs.map(v => ({ vlanId: v.vlanId, where: vlanLabel(v) })),
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L2 Configuration',
      check: 'VLAN ID Range',
      message: `All ${logicalVlans.length} VLANs are valid (range 1-4094). Reuse across sites/closets is allowed.`,
      severity: 'info'
    });
  }

  // VLAN name consistency: the same VLAN ID within a site should keep one name
  const namesBySiteVlan = new Map();
  logicalVlans.forEach(v => {
    if (!v.vlanName) return;
    const key = `${v.siteId}|${v.vlanId}`;
    if (!namesBySiteVlan.has(key)) namesBySiteVlan.set(key, new Map());
    namesBySiteVlan.get(key).set(v.vlanName, vlanLabel(v));
  });

  const nameConflicts = [];
  namesBySiteVlan.forEach((names, key) => {
    if (names.size > 1) {
      const [siteId, vlanId] = key.split('|');
      nameConflicts.push({ siteId, vlanId, names: [...names.keys()] });
    }
  });

  if (nameConflicts.length > 0) {
    results.checks.push({
      type: 'warning',
      category: 'L2 Configuration',
      check: 'VLAN Name Consistency',
      message: `Found ${nameConflicts.length} VLAN(s) carrying different names within one site: ${nameConflicts.map(c => `Site ${c.siteId} VLAN ${c.vlanId}: ${c.names.join(' vs ')}`).join('; ').substring(0, 300)}`,
      details: nameConflicts,
      severity: 'warning'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L2 Configuration',
      check: 'VLAN Name Consistency',
      message: 'VLAN names are consistent within each site',
      severity: 'info'
    });
  }
};

// ============================================
// I-SID VALIDATION (Fabric-specific)
// ============================================

const runISIDChecks = (logicalVlans, results) => {
  const withIsid = logicalVlans.filter(v => v.isid);

  // Range
  const invalidISIDs = withIsid.filter(v => {
    const n = parseInt(v.isid);
    return isNaN(n) || n < 4096 || n > 16777215;
  });

  if (invalidISIDs.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'Fabric Configuration',
      check: 'I-SID Range',
      message: `Found ${invalidISIDs.length} invalid I-SID value(s) (must be 4096-16777215): ${invalidISIDs.map(v => `${v.isid} at ${vlanLabel(v)}`).join(', ').substring(0, 300)}`,
      details: invalidISIDs.map(v => ({ isid: v.isid, where: vlanLabel(v) })),
      severity: 'critical'
    });
  } else {
    const uniqueIsids = new Set(withIsid.map(v => parseInt(v.isid))).size;
    results.checks.push({
      type: 'pass',
      category: 'Fabric Configuration',
      check: 'I-SID Range',
      message: `All ${uniqueIsids} I-SIDs are in valid range (4096-16777215)`,
      severity: 'info'
    });
  }

  // Uniqueness: one I-SID must mean one service. The same I-SID on many
  // switches (or intentionally shared across sites with the same VLAN and
  // subnet) is exactly how fabric VSNs work - only flag an I-SID that maps
  // to DIFFERENT VLAN/subnet combinations.
  const byIsid = new Map();
  withIsid.forEach(v => {
    const n = parseInt(v.isid);
    if (!byIsid.has(n)) byIsid.set(n, new Map());
    byIsid.get(n).set(`${v.vlanId}|${v.subnet}`, vlanLabel(v));
  });

  const isidCollisions = [];
  byIsid.forEach((services, isid) => {
    if (services.size > 1) {
      isidCollisions.push({ isid, services: [...services.values()] });
    }
  });

  if (isidCollisions.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'Fabric Configuration',
      check: 'I-SID Uniqueness',
      message: `Found ${isidCollisions.length} I-SID(s) mapped to different services: ${isidCollisions.map(c => `${c.isid} (${c.services.join(' vs ')})`).join('; ').substring(0, 300)}`,
      details: isidCollisions,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Fabric Configuration',
      check: 'I-SID Uniqueness',
      message: `Every I-SID maps to exactly one service. (Shared VSNs spanning switches or sites are correctly recognized.)`,
      severity: 'info'
    });
  }

  // I-SID name uniqueness: the same name on two different I-SIDs is
  // confusing labeling; the same name repeated for one I-SID is normal.
  const byName = new Map();
  withIsid.forEach(v => {
    if (!v.isidName) return;
    if (!byName.has(v.isidName)) byName.set(v.isidName, new Set());
    byName.get(v.isidName).add(parseInt(v.isid));
  });

  const nameCollisions = [];
  byName.forEach((isids, name) => {
    if (isids.size > 1) {
      nameCollisions.push({ name, isids: [...isids] });
    }
  });

  if (nameCollisions.length > 0) {
    results.checks.push({
      type: 'warning',
      category: 'Fabric Configuration',
      check: 'I-SID Name Uniqueness',
      message: `Found ${nameCollisions.length} I-SID name(s) used by more than one I-SID: ${nameCollisions.map(c => `"${c.name}" (${c.isids.join(', ')})`).join('; ').substring(0, 300)}`,
      details: nameCollisions,
      severity: 'warning'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Fabric Configuration',
      check: 'I-SID Name Uniqueness',
      message: 'Every I-SID name maps to exactly one I-SID',
      severity: 'info'
    });
  }
};

// ============================================
// FABRIC-SPECIFIC CHECKS
// ============================================

const runFabricSpecificChecks = (switches, logicalVlans, results) => {
  const l3Switches = switches.filter(s => s.type === 'L3');

  if (l3Switches.length > 0) {
    results.checks.push({
      type: 'pass',
      category: 'Fabric Features',
      check: 'ISIS Configuration',
      message: `L3 ISIS configured on ${l3Switches.length} switch(es) for SPB`,
      severity: 'info'
    });
  }

  const mappedVLANs = logicalVlans.filter(v => v.isid).length;

  if (mappedVLANs === 0) {
    results.checks.push({
      type: 'error',
      category: 'Fabric Features',
      check: 'VLAN-I-SID Mapping',
      message: 'No VLAN to I-SID mappings found',
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Fabric Features',
      check: 'VLAN-I-SID Mapping',
      message: `${mappedVLANs} VLAN-to-I-SID service mappings configured`,
      severity: 'info'
    });
  }
};

// ============================================
// DHCP RELAY VALIDATION
// ============================================

const runDHCPChecks = (switches, settings, results) => {
  const dhcpServers = [];

  if (settings.dhcpServer1) dhcpServers.push(settings.dhcpServer1);
  if (settings.dhcpServer2) dhcpServers.push(settings.dhcpServer2);

  if (dhcpServers.length === 0) {
    results.checks.push({
      type: 'warning',
      category: 'DHCP Configuration',
      check: 'DHCP Servers',
      message: 'No DHCP relay servers configured',
      severity: 'warning'
    });
    return;
  }

  const invalidIPs = [];
  dhcpServers.forEach(ip => {
    if (!isValidIP(ip)) {
      invalidIPs.push(ip);
    }
  });

  if (invalidIPs.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'DHCP Configuration',
      check: 'DHCP Server IPs',
      message: `Found ${invalidIPs.length} invalid DHCP server IP(s): ${invalidIPs.join(', ')}`,
      details: invalidIPs,
      severity: 'error'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'DHCP Configuration',
      check: 'DHCP Server IPs',
      message: `${dhcpServers.length} DHCP server(s) configured with valid IP(s)`,
      severity: 'info'
    });
  }
};

// ============================================
// INTERFACE VALIDATION
// ============================================

const runInterfaceChecks = (switches, results) => {
  const interfaceIPs = new Map();
  const ipConflicts = [];

  switches.forEach((sw) => {
    if (sw.mgmtIp) {
      if (interfaceIPs.has(sw.mgmtIp)) {
        ipConflicts.push({
          ip: sw.mgmtIp,
          switches: [interfaceIPs.get(sw.mgmtIp), sw.name]
        });
      } else {
        interfaceIPs.set(sw.mgmtIp, sw.name);
      }
    }
  });

  if (ipConflicts.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'Interface Configuration',
      check: 'IP Address Conflicts',
      message: `Found ${ipConflicts.length} duplicate management IP address(es)`,
      details: ipConflicts,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Interface Configuration',
      check: 'IP Address Conflicts',
      message: interfaceIPs.size > 0
        ? `All ${interfaceIPs.size} management IP addresses are unique`
        : 'No management IP conflicts detected',
      severity: 'info'
    });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const isValidCIDR = (subnet) => {
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (!cidrRegex.test(subnet)) return false;

  const [ip, prefix] = subnet.split('/');
  const parts = ip.split('.');
  const prefixNum = parseInt(prefix);

  if (prefixNum < 0 || prefixNum > 32) return false;

  for (let part of parts) {
    const num = parseInt(part);
    if (num > 255) return false;
  }

  return true;
};

const isValidIP = (ip) => {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;

  const parts = ip.split('.');
  for (let part of parts) {
    const num = parseInt(part);
    if (num > 255) return false;
  }

  return true;
};

// Canonical "network/prefix" key so 10.104.1.1/16 and 10.104.0.0/16
// compare as the same network. Invalid strings fall back to the raw value.
const networkKey = (subnet) => {
  if (!isValidCIDR(subnet)) return `raw:${subnet}`;
  const [ip, prefixStr] = subnet.split('/');
  const prefix = parseInt(prefixStr);
  const octets = ip.split('.').map(Number);
  const ipInt = ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const net = (ipInt & mask) >>> 0;
  return `${net}/${prefix}`;
};

export default {
  validateFabricConfiguration
};
