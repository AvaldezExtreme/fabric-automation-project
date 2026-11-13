// ============================================
// Fabric Validation Engine
// Version: V2608262
// Purpose: Comprehensive validation for Fabric configurations.
// All uniqueness checks run against LOGICAL VLANs (site + VLAN + closet),
// not per-switch copies - a VSN spanning many switches is the point of
// fabric, not a conflict.
// ============================================

import { mgmtAddressFor } from './mgmtAddressing.js';

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

  runSubnetOverlapChecks(switches, withSubnet, results);
};

// Every routed subnet FACE will configure: VLAN subnets plus the onboarding
// gateway, uplinks and Fabric Extend ISP links attached on the Configure step
const collectRanges = (switches, withSubnet) => {
  const out = [];
  const seen = new Set();
  const add = (cidr, label, kind) => {
    if (!isValidCIDR(cidr)) return;
    const key = `${networkKey(cidr)}|${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    const [start, end] = cidrRange(cidr);
    out.push({ cidr, label, kind, start, end });
  };
  withSubnet.forEach(v => add(v.subnet, vlanLabel(v), 'vlan'));
  switches.forEach(sw => {
    if (sw.onboarding && sw.onboarding.ip) add(sw.onboarding.ip, `Site ${sw.siteId} onboarding gateway (VLAN 4048)`, 'extra');
    if (sw.uplink && sw.uplink.ip) add(sw.uplink.ip, `Site ${sw.siteId} uplink (VLAN ${sw.uplink.vlanId})`, 'extra');
    if (sw.fabricExtend && sw.fabricExtend.wanIp) add(sw.fabricExtend.wanIp, `Site ${sw.siteId} Fabric Extend ISP link`, 'extra');
  });
  return out;
};

const runSubnetOverlapChecks = (switches, withSubnet, results) => {
  const ranges = collectRanges(switches, withSubnet);

  // Overlap = address ranges intersect. Two VLANs on the very same network
  // are already reported as Subnet Conflicts above, so skip only that case.
  const overlaps = [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start <= sorted[i].end; j++) {
      const a = sorted[i], b = sorted[j];
      if (a.start === b.start && a.end === b.end && a.kind === 'vlan' && b.kind === 'vlan') continue;
      overlaps.push({ a: `${a.cidr} (${a.label})`, b: `${b.cidr} (${b.label})` });
    }
  }
  if (overlaps.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'L3 Configuration',
      check: 'Subnet Overlaps',
      message: `Found ${overlaps.length} overlapping subnet pair(s) - one range sits inside another, so routing for the shared addresses breaks: ${overlaps.map(o => `${o.a} overlaps ${o.b}`).join('; ').substring(0, 400)}`,
      details: overlaps,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L3 Configuration',
      check: 'Subnet Overlaps',
      message: `No overlapping address ranges across ${ranges.length} subnet(s), including onboarding, uplink and Fabric Extend links`,
      severity: 'info'
    });
  }

  // The typed address sits in a different /24 than its network (e.g.
  // 10.124.33.0/19 - the network is 10.124.32.0/19). FACE builds the gateway
  // from the typed first three octets (.33.1): a valid host, but rarely what
  // the plan meant. Gateway-style entries like 10.10.2.1/24 are fine.
  const notNetwork = [];
  const seen = new Set();
  withSubnet.forEach(v => {
    if (seen.has(v.subnet) || !isValidCIDR(v.subnet)) return;
    seen.add(v.subnet);
    const [start] = cidrRange(v.subnet);
    const typedIp = v.subnet.split('/')[0];
    const o = typedIp.split('.');
    const gateway = `${o[0]}.${o[1]}.${o[2]}.1`;
    // typed as the gateway itself (10.12.1.1/16) is fine - that IS what FACE uses
    if ((ipToInt(typedIp) >>> 8) !== (start >>> 8) && gateway !== typedIp) {
      notNetwork.push({ subnet: v.subnet, network: `${intToIp(start)}/${v.subnet.split('/')[1]}`, gateway, usedBy: vlanLabel(v) });
    }
  });
  if (notNetwork.length > 0) {
    results.checks.push({
      type: 'warning',
      category: 'L3 Configuration',
      check: 'Subnet Network Address',
      message: `${notNetwork.length} subnet(s) don't start on their network - check the intended gateway: ${notNetwork.map(n => `${n.subnet} (${n.usedBy}) is network ${n.network}; FACE will use gateway ${n.gateway}`).join('; ').substring(0, 400)}`,
      details: notNetwork,
      severity: 'warning'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L3 Configuration',
      check: 'Subnet Network Address',
      message: "Every subnet's gateway lands on its network (first three octets + .1)",
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

// Management addressing exactly as the configs and CSVs build it
// (mgmtAddressing.js). Before V2611132 this read sw.mgmtIp, a field that
// never existed, so it always passed without checking anything.
const runInterfaceChecks = (switches, results) => {
  const problems = [];
  const byIp = new Map();
  const clips = new Map();

  switches.forEach((sw) => {
    const a = mgmtAddressFor(sw);
    if (sw.type === 'L3') {
      if (clips.has(a.clip)) problems.push(`CLIP ${a.clip} is used by both ${clips.get(a.clip)} and ${sw.name}`);
      else clips.set(a.clip, sw.name);
      return;
    }
    if (!a.subnet) {
      problems.push(`${sw.name}: mgmt VLAN ${a.vlanId} has no subnet in this site - the switch gets a placeholder mgmt IP`);
      return;
    }
    if (!a.valid) {
      problems.push(`${sw.name}: mgmt IP ${a.ip} is not a valid address`);
      return;
    }
    const hostMax = Math.min(254, Math.pow(2, Math.max(0, 32 - parseInt(a.prefix))) - 2);
    if (parseInt(a.prefix) >= 24 && a.octet > hostMax) {
      problems.push(`${sw.name}: mgmt IP ${a.ip} falls outside ${a.subnet} - more switches than the mgmt subnet holds`);
    }
    if (a.ip === a.gateway) {
      problems.push(`${sw.name}: mgmt IP ${a.ip} is the mgmt gateway (the L3 core's address on VLAN ${a.vlanId})`);
    }
    if (byIp.has(a.ip)) problems.push(`mgmt IP ${a.ip} is used by both ${byIp.get(a.ip)} and ${sw.name}`);
    else byIp.set(a.ip, sw.name);
  });

  if (problems.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'Interface Configuration',
      check: 'Management IP Addresses',
      message: `Found ${problems.length} management addressing problem(s): ${problems.join('; ').substring(0, 400)}`,
      details: problems,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Interface Configuration',
      check: 'Management IP Addresses',
      message: `All ${byIp.size} L2 management IPs are unique, valid and inside their mgmt subnet; ${clips.size} L3 CLIP(s) unique`,
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

const ipToInt = (ip) => ip.split('.').map(Number).reduce((n, o) => ((n << 8) + o) >>> 0, 0);
const intToIp = (n) => [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');

// [first, last] address of a CIDR as unsigned ints
const cidrRange = (subnet) => {
  const [ip, prefixStr] = subnet.split('/');
  const prefix = parseInt(prefixStr);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const start = (ipToInt(ip) & mask) >>> 0;
  return [start, (start | (~mask >>> 0)) >>> 0];
};

export default {
  validateFabricConfiguration
};
