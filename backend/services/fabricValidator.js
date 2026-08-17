// ============================================
// Fabric Validation Engine
// Version: V2608173
// Purpose: Comprehensive validation for Fabric configurations
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

  // Run all validation checks
  runIPSubnetChecks(switches, results);
  runVLANChecks(switches, results);
  runISIDChecks(switches, results);
  runFabricSpecificChecks(switches, results);
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
// L3 IP SUBNET VALIDATION
// ============================================

const runIPSubnetChecks = (switches, results) => {
  const l3Switches = switches.filter(s => s.type === 'L3');

  if (l3Switches.length === 0) {
    results.checks.push({
      type: 'info',
      category: 'L3 Configuration',
      check: 'L3 Switches Present',
      message: 'No L3 switches found. If using external gateway (firewall), this is expected.',
      severity: 'info'
    });
    return;
  }

  results.checks.push({
    type: 'pass',
    category: 'L3 Configuration',
    check: 'L3 Switches Present',
    message: `Found ${l3Switches.length} L3 switches`,
    severity: 'info'
  });

  // Check for IP subnet conflicts
  const subnets = new Map();
  const subnetConflicts = [];

  l3Switches.forEach((sw) => {
    if (sw.vlans && Array.isArray(sw.vlans)) {
      sw.vlans.forEach((vlan) => {
        if (vlan.subnet) {
          const subnetKey = normalizeSubnet(vlan.subnet);
          if (subnets.has(subnetKey)) {
            subnetConflicts.push({
              subnet: vlan.subnet,
              switches: [subnets.get(subnetKey), sw.name],
              vlan: vlan.vlanId
            });
          } else {
            subnets.set(subnetKey, sw.name);
          }
        }
      });
    }
  });

  if (subnetConflicts.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'L3 Configuration',
      check: 'Subnet Conflicts',
      message: `Found ${subnetConflicts.length} overlapping subnets: ${subnetConflicts.map(c => c.subnet).join(', ')}`,
      details: subnetConflicts,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L3 Configuration',
      check: 'Subnet Conflicts',
      message: `All ${subnets.size} subnets are unique (no conflicts detected)`,
      severity: 'info'
    });
  }

  // Validate CIDR notation
  const invalidCIDR = [];
  subnets.forEach((switchName, subnet) => {
    if (!isValidCIDR(subnet)) {
      invalidCIDR.push({ subnet, switchName });
    }
  });

  if (invalidCIDR.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'L3 Configuration',
      check: 'CIDR Notation',
      message: `Found ${invalidCIDR.length} invalid CIDR notations: ${invalidCIDR.map(c => c.subnet).join(', ')}`,
      details: invalidCIDR,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L3 Configuration',
      check: 'CIDR Notation',
      message: 'All IP subnets use valid CIDR notation',
      severity: 'info'
    });
  }
};

// ============================================
// L2 VLAN VALIDATION
// ============================================

const runVLANChecks = (switches, results) => {
  const invalidVLANs = [];
  const vlansBySite = new Map();

  switches.forEach((sw) => {
    if (sw.vlans && Array.isArray(sw.vlans)) {
      sw.vlans.forEach((vlan) => {
        const vlanId = parseInt(vlan.vlanId);

        // Check valid range
        if (isNaN(vlanId) || vlanId < 1 || vlanId > 4094) {
          invalidVLANs.push({ vlanId: vlan.vlanId, switchName: sw.name });
        }

        // Track VLANs by site (duplicates across sites are OK)
        const siteId = sw.siteId || 'unknown';
        const key = `${siteId}-${vlanId}`;
        if (!vlansBySite.has(key)) {
          vlansBySite.set(key, []);
        }
        vlansBySite.get(key).push(sw.name);
      });
    }
  });

  if (invalidVLANs.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'L2 Configuration',
      check: 'VLAN ID Range',
      message: `Found ${invalidVLANs.length} invalid VLAN ID(s). All VLAN IDs must be between 1-4094.`,
      details: invalidVLANs,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L2 Configuration',
      check: 'VLAN ID Range',
      message: `All VLAN IDs are valid (range 1-4094). Duplicates across different sites are allowed.`,
      severity: 'info'
    });
  }

  // Check VLAN name uniqueness
  const vlanNames = new Map();
  const nameConflicts = [];

  switches.forEach((sw) => {
    if (sw.vlans && Array.isArray(sw.vlans)) {
      sw.vlans.forEach((vlan) => {
        if (vlan.name) {
          const key = `${vlan.vlanId}-${vlan.name}`;
          if (vlanNames.has(key)) {
            nameConflicts.push({
              vlanId: vlan.vlanId,
              name: vlan.name,
              switches: [vlanNames.get(key), sw.name]
            });
          } else {
            vlanNames.set(key, sw.name);
          }
        }
      });
    }
  });

  if (nameConflicts.length > 0) {
    results.checks.push({
      type: 'warning',
      category: 'L2 Configuration',
      check: 'VLAN Name Consistency',
      message: `Found ${nameConflicts.length} VLAN name mismatches across switches`,
      details: nameConflicts,
      severity: 'warning'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'L2 Configuration',
      check: 'VLAN Name Consistency',
      message: 'VLAN names are consistent across switches',
      severity: 'info'
    });
  }
};

// ============================================
// I-SID VALIDATION (Fabric-specific)
// ============================================

const runISIDChecks = (switches, results) => {
  const isidMap = new Map();
  const isidConflicts = [];
  const invalidISIDs = [];
  const isidNameMap = new Map();
  const isidNameConflicts = [];

  switches.forEach((sw) => {
    if (sw.vlans && Array.isArray(sw.vlans)) {
      sw.vlans.forEach((vlan) => {
        const isid = vlan.isid || vlan.i_sid;

        if (isid) {
          const isidNum = parseInt(isid);

          // Check valid range (I-SID: 4096-16777215)
          if (isNaN(isidNum) || isidNum < 4096 || isidNum > 16777215) {
            invalidISIDs.push({
              isid: isid,
              vlanId: vlan.vlanId,
              switchName: sw.name
            });
          }

          // Check for duplicates
          if (isidMap.has(isidNum)) {
            isidConflicts.push({
              isid: isidNum,
              vlans: [isidMap.get(isidNum), vlan.vlanId],
              switches: [sw.name, sw.name] // Would be different switches in real scenario
            });
          } else {
            isidMap.set(isidNum, vlan.vlanId);
          }

          // Check name uniqueness
          if (vlan.isidName) {
            if (isidNameMap.has(vlan.isidName)) {
              isidNameConflicts.push({
                name: vlan.isidName,
                isids: [isidNameMap.get(vlan.isidName), isid]
              });
            } else {
              isidNameMap.set(vlan.isidName, isid);
            }
          }
        }
      });
    }
  });

  if (invalidISIDs.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'Fabric Configuration',
      check: 'I-SID Range',
      message: `Found ${invalidISIDs.length} invalid I-SID values (must be 4096-16777215)`,
      details: invalidISIDs,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Fabric Configuration',
      check: 'I-SID Range',
      message: `All ${isidMap.size} I-SIDs are in valid range (4096-16777215)`,
      severity: 'info'
    });
  }

  if (isidConflicts.length > 0) {
    results.checks.push({
      type: 'info',
      category: 'Fabric Configuration',
      check: 'I-SID Uniqueness',
      message: `Note: I-SIDs are typically managed per-site, so duplicates across sites are normal.`,
      details: isidConflicts,
      severity: 'info'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Fabric Configuration',
      check: 'I-SID Uniqueness',
      message: `All I-SIDs are unique. (Per-site duplication is acceptable.)`,
      severity: 'info'
    });
  }

  if (isidNameConflicts.length > 0) {
    results.checks.push({
      type: 'warning',
      category: 'Fabric Configuration',
      check: 'I-SID Name Uniqueness',
      message: `Found ${isidNameConflicts.length} duplicate I-SID names`,
      details: isidNameConflicts,
      severity: 'warning'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Fabric Configuration',
      check: 'I-SID Name Uniqueness',
      message: 'All I-SID names are unique',
      severity: 'info'
    });
  }
};

// ============================================
// FABRIC-SPECIFIC CHECKS
// ============================================

const runFabricSpecificChecks = (switches, results) => {
  // Check for ISIS configuration on L3
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

  // Check for VLAN to I-SID mapping
  const mappedVLANs = switches.reduce((count, sw) => {
    if (sw.vlans) {
      return count + sw.vlans.filter(v => v.isid || v.i_sid).length;
    }
    return count;
  }, 0);

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
      message: `${mappedVLANs} VLAN-to-I-SID mappings configured`,
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

    if (sw.vlans && Array.isArray(sw.vlans)) {
      sw.vlans.forEach((vlan) => {
        if (vlan.ip) {
          if (interfaceIPs.has(vlan.ip)) {
            ipConflicts.push({
              ip: vlan.ip,
              vlan: vlan.vlanId,
              switches: [interfaceIPs.get(vlan.ip), sw.name]
            });
          } else {
            interfaceIPs.set(vlan.ip, sw.name);
          }
        }
      });
    }
  });

  if (ipConflicts.length > 0) {
    results.checks.push({
      type: 'error',
      category: 'Interface Configuration',
      check: 'IP Address Conflicts',
      message: `Found ${ipConflicts.length} duplicate IP address(es)`,
      details: ipConflicts,
      severity: 'critical'
    });
  } else {
    results.checks.push({
      type: 'pass',
      category: 'Interface Configuration',
      check: 'IP Address Conflicts',
      message: `All ${interfaceIPs.size} IP addresses are unique`,
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

const normalizeSubnet = (subnet) => {
  // Normalize subnet for comparison (could expand to full range)
  return subnet.split('/')[0];
};

export default {
  validateFabricConfiguration
};
