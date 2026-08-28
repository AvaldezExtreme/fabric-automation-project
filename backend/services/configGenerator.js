export const generateL3Config = (switchData, settings = {}) => {
  const siteId = switchData.siteId;
  const switchName = switchData.name;
  const isidPrefix = switchData.isidPrefix;
  // Routed-closet designs carry a real per-switch loopback (from the Ports
  // column); it becomes the CLIP. Site-wide designs keep the legacy scheme.
  const mgmtClipIp = switchData.loopback
    ? `${switchData.loopback}/32`
    : `${siteId}.1.1.1/32`;
  
  // Use user input or default to 0.0.0.0
  const defaultGateway = settings.l3DefaultGateway || '0.0.0.0';
  const gatewayEnabled = settings.l3DefaultGateway ? 'yes' : 'no';
  
  let config = `! ============================================
! Switch: ${switchName}
! SiteID: ${siteId}
! Layer 3 Distribution Switch
! Generated: ${new Date().toISOString()}
! ============================================

enable
configure terminal

prompt ${switchName}

`;

  // Build VLAN creation commands
  const vlansToConfig = switchData.vlans || [];
  
  config += '! Create VLANs\n';
  vlansToConfig.forEach(vlan => {
    const vlanId = vlan.vlanId;
    const vlanName = vlan.vlanName;
    config += `vlan create ${vlanId} name ${vlanName} type port-mstprstp 0\n`;
  });
  
  // I-SID mappings
  config += '\n! Map VLANs to I-SIDs\n';
  vlansToConfig.forEach(vlan => {
    config += `vlan i-sid ${vlan.vlanId} ${vlan.isid}\n`;
  });
  
 // I-SID names
  config += '\n! I-SID Names\n';
  vlansToConfig.forEach(vlan => {
    config += `i-sid name ${vlan.isid} ${vlan.isidName}\n`;
  });
  
  // Segmented VRF (Fabric Engine 9.4+, from the intake wizard).
  // Member interfaces get a trust class: trusted (default), untrusted, or
  // unrestricted (the FW link). Syntax per the Segmented VRF reference decks.
  const segVrf = settings.segmentedVrf && settings.segmentedVrf.enabled ? settings.segmentedVrf : null;
  const vrfClassFor = (vlan) => {
    if (!segVrf) return null;
    const cls = (segVrf.classes || {})[vlan.vlanId];
    return cls === 'untrusted' ? 'untrusted' : 'trusted';
  };

  if (segVrf) {
    const isidBase = 3000000 + (parseInt(segVrf.vrfId) || 10) * 10;
    config += `! Segmented VRF (Fabric Engine 9.4+) - Premier license required
ip vrf ${segVrf.vrfName} vrfid ${segVrf.vrfId}
router vrf ${segVrf.vrfName}
segmented
ipvpn
i-sid ${isidBase}
i-sid ${isidBase + 1} untrusted
i-sid ${isidBase + 2} unrestricted
ipvpn enable
isis redistribute direct
isis redistribute direct enable
exit
isis apply redistribute direct vrf ${segVrf.vrfName}

`;
  }

  // VLAN interfaces with DHCP relay.
  // Routed-access switches (York-style closet routing) only route their own
  // closet's VLANs - site-wide VLANs (e.g. wireless L2 VSNs) stay L2-only
  // here, because their gateway lives elsewhere. Giving every closet an IP
  // on a shared subnet would create district-wide duplicate addresses.
  const l2OnlyVlans = [];
  config += '\n! Configure VLAN Interfaces\n';
  vlansToConfig.forEach(vlan => {
    if (switchData.routedAccess && !vlan.closet) {
      l2OnlyVlans.push(vlan.vlanId);
      return;
    }
    const subnet = vlan.subnet;
    if (subnet && subnet !== 'NaN' && subnet.toLowerCase() !== 'nan') {
      const [network, cidr] = subnet.split('/');
      if (network && cidr) {
        const octets = network.split('.');
        const netmask = cidrToNetmask(cidr);
        const gatewayIp = `${octets[0]}.${octets[1]}.${octets[2]}.1`;
        
        const vrfLine = segVrf ? `vrf ${segVrf.vrfName}${vrfClassFor(vlan) === 'untrusted' ? ' untrusted' : ''}\n` : '';
        config += `
interface vlan ${vlan.vlanId}
${vrfLine}ip address ${gatewayIp} ${netmask}
${settings.enableSpbMulticast === false ? '' : 'ip spb-multicast enable\n'}ip igmp upnp-filter
ip dhcp-relay
enable
ip dhcp-relay fwd-path ${settings.dhcpServer1 || '10.1.1.202'} enable
ip dhcp-relay fwd-path ${settings.dhcpServer2 || '10.1.1.207'} enable
exit
`;
      }
    }
  });

  if (l2OnlyVlans.length > 0) {
    config += `\n! Site-wide L2 VSNs carried without IP on this switch: VLAN ${l2OnlyVlans.join(', ')}\n`;
  }

  // IP Multicast over Fabric Connect requires the global SPBM enable
  // (default is disabled - FE 9.4 Cmd Ref: spbm <1-100> multicast enable).
  // Only emitted when the user explicitly enabled multicast; legacy
  // projects (flag absent) keep their historical output untouched.
  if (settings.enableSpbMulticast === true) {
    config += `
! IP Multicast over Fabric Connect - global enable (SPBM instance 1)
router isis
spbm 1 multicast enable
exit
`;
  }

  // Segmented VRF firewall link: the UNRESTRICTED path (L3 core <-> FW).
  // All inter-VLAN traffic the fabric denies is hairpinned through here.
  if (segVrf && segVrf.fwVlanId) {
    const fwPrefix = (segVrf.fwSubnet || '').split('/')[1] || '24';
    const fwIsid = parseInt(`2${String(siteId).padStart(2, "0")}${String(segVrf.fwVlanId).padStart(4, "0")}`);
    config += `
! Firewall link (Segmented VRF unrestricted path)
vlan create ${segVrf.fwVlanId} name FW-Link type port-mstprstp 0
vlan i-sid ${segVrf.fwVlanId} ${fwIsid}
interface vlan ${segVrf.fwVlanId}
vrf ${segVrf.vrfName} unrestricted
ip address ${segVrf.switchIp} ${cidrToNetmask(fwPrefix)}
exit

! Default route inside the VRF - towards the firewall
router vrf ${segVrf.vrfName}
ip route 0.0.0.0 0.0.0.0 ${segVrf.fwIp} weight 1
exit

`;
  }

  // Management clip
  config += `
! Management CLIP
no mgmt clip
mgmt clip
ip add ${mgmtClipIp}
enable
exit

`;

  // Default route (only if provided)
  if (gatewayEnabled === 'yes') {
    config += `! Default Route
ip route 0.0.0.0 0.0.0.0 ${defaultGateway} weight 1

`;
  } else {
    config += `! Default Route - NOT CONFIGURED (bypass enabled)
! ip route 0.0.0.0 0.0.0.0 <ISP_GATEWAY> weight 1

`;
  }

  // Auto-sense commands (only once!)
  if (switchData.autoSenseCommands && switchData.autoSenseCommands.length > 0) {
    // Camera FA line only when the camera vendor supports Fabric Attach
    // (Verkada, Axis >=12.0, i-PRO). Absent flag keeps legacy behavior.
    const asCmds = switchData.autoSenseCommands.filter(
      cmd => !(settings.cameraFaCapable === false && cmd.type === 'camera')
    );
    if (asCmds.length > 0) {
      config += '! Auto-Sense Device Type Handling\n';
      asCmds.forEach(cmd => {
        config += cmd.command + '\n';
      });
    }
  }
  
  // WAN configuration if provided
  if (settings.wanLinkIp) {
    config += `
! WAN Link Configuration
interface vlan 1000
ip address ${settings.wanLinkIp} ${settings.wanLinkNetmask || '255.255.255.0'}
exit
`;
  }
  
  config += `
save config
`;
  
  return config;
};

export const generateL2Config = (switchData, settings = {}) => {
  const switchName = switchData.name;
  const siteId = switchData.siteId;
  const isidPrefix = switchData.isidPrefix;
  const location = switchData.location || 'Unknown Location';
  
  // Use M3 default gateway from Excel
  const l2DefaultGateway = switchData.l2DefaultGateway || '10.0.0.254';
  
  let config = `! ============================================
! Switch: ${switchName}
! SiteID: ${siteId}
! Layer 2 Access Switch
! Generated: ${new Date().toISOString()}
! ============================================

enable
configure terminal

prompt ${switchName}
banner custom
banner displaymotd
banner motd "${location}"

`;

  // Get management VLAN info - use MgmtVLAN column (Column Q) directly
  const vlansToConfig = switchData.vlans || [];
  // Extreme wireless: SSID VLANs ride Fabric Attach — the APs signal them,
  // so they are NOT configured statically on L2 access switches. A VLAN is
  // an SSID VLAN via the wizard flag (v.ssid) or the Configure-step picker
  // (settings.ssidVlanIds), so Excel/template projects get this too.
  const skipSsid = settings.extremeWireless === true;
  const mgmtVlanId = switchData.mgmtVlan ? parseInt(switchData.mgmtVlan) : 8; // Default to 8 if not specified
  const pickedSsid = new Set(settings.ssidVlanIds || []);
  // The mgmt VLAN can never be an SSID VLAN - the switch needs it to exist
  const isSsid = (v) => v.vlanId !== mgmtVlanId && (!!v.ssid || pickedSsid.has(v.vlanId));
  const l2Vlans = vlansToConfig.filter(v => !(skipSsid && isSsid(v)));
  const ssidSkipped = vlansToConfig.filter(v => skipSsid && isSsid(v));
  
  // Find the VLAN object for the management VLAN
  const mgmtVlan = vlansToConfig.find(v => v.vlanId === mgmtVlanId);
  
  let mgmtIp = '10.0.0.1';
  let mgmtGateway = l2DefaultGateway;
  
  if (mgmtVlan && mgmtVlan.subnet) {
    const [network, cidr] = mgmtVlan.subnet.split('/');
    if (network && cidr) {
      const octets = network.split('.');
      const lastOctet = switchData.mgmtIpOctet ? parseInt(switchData.mgmtIpOctet) : 1;
      console.log(`DEBUG L2 ${switchData.name}: MgmtVLAN=${mgmtVlanId}, mgmtIpOctet="${switchData.mgmtIpOctet}", final IP="${octets[0]}.${octets[1]}.${octets[2]}.${lastOctet}"`);
      mgmtIp = `${octets[0]}.${octets[1]}.${octets[2]}.${lastOctet}`;
      mgmtGateway = l2DefaultGateway;
    }
  } else {
    // If no subnet found, use default
    console.log(`DEBUG L2 ${switchData.name}: Using default mgmt config for VLAN ${mgmtVlanId}`);
  }
  
  // Create VLANs
  config += '! Create VLANs\n';
  if (ssidSkipped.length > 0) {
    config += `! SSID VLANs ${ssidSkipped.map(v => v.vlanId).join(', ')} omitted - delivered by Fabric Attach (Extreme wireless)\n`;
  }
  l2Vlans.forEach(vlan => {
    config += `vlan create ${vlan.vlanId} name ${vlan.vlanName} type port-mstprstp 0\n`;
  });

  // I-SID mappings
  config += '\n! Map VLANs to I-SIDs\n';
  l2Vlans.forEach(vlan => {
    config += `vlan i-sid ${vlan.vlanId} ${vlan.isid}\n`;
  });

 // I-SID names
  config += '\n! I-SID Names\n';
  l2Vlans.forEach(vlan => {
    config += `i-sid name ${vlan.isid} ${vlan.isidName}\n`;
  });

  // IP Multicast config-lite (FE 9.4 User Guide p.1953/1964): the L2 edge
  // joins ROUTED SPB multicast - the same mode as the L3 core's SVIs - with
  // no IP address on the VLAN. mvpn-isid 0 = GRT scope (FACE designs route
  // in the GRT; an L3VSN design would use that VSN's I-SID instead). This
  // replaces per-VLAN igmp snooping, which is bridged-mode and whose 0.0.0.0
  // querier would fight the L3 core's querier. No routed-spb-querier-addr
  // per design decision. The global SPBM enable is still required.
  if (settings.enableSpbMulticast === true) {
    config += `
! IP Multicast over Fabric Connect - global enable (SPBM instance 1)
router isis
spbm 1 multicast enable
exit

! IP Multicast config-lite per C-VLAN (routed SPB multicast, GRT scope)
`;
    l2Vlans.forEach(vlan => {
      config += `interface vlan ${vlan.vlanId}
mvpn-isid 0
ip spb-multicast enable
exit
`;
    });
  }

 // Calculate dynamic L2 gateway: 10.{SiteID}.{MgmtVLAN}.1
  const dynamicL2Gateway = `10.${siteId}.${mgmtVlanId}.1`;
  
  // Management configuration (using dynamic gateway based on site and mgmt vlan)
  config += `
! Management Configuration
no mgmt vlan
mgmt vlan ${mgmtVlanId}
ip add ${mgmtIp}/24
ip route 0.0.0.0 0.0.0.0 next-hop ${dynamicL2Gateway} weight 1
enable
exit

`;

  // Auto-sense commands (only once!)
  if (switchData.autoSenseCommands && switchData.autoSenseCommands.length > 0) {
    // Camera FA line only when the camera vendor supports Fabric Attach
    // (Verkada, Axis >=12.0, i-PRO). Absent flag keeps legacy behavior.
    const asCmds = switchData.autoSenseCommands.filter(
      cmd => !(settings.cameraFaCapable === false && cmd.type === 'camera')
    );
    if (asCmds.length > 0) {
      config += '! Auto-Sense Device Type Handling\n';
      asCmds.forEach(cmd => {
        config += cmd.command + '\n';
      });
    }
  }
  
  config += `
save config
`;
  
  return config;
};

const cidrToNetmask = (cidr) => {
  const num = parseInt(cidr);
  const mask = (0xffffffff << (32 - num)) >>> 0;
  return [
    (mask >>> 24) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 8) & 0xff,
    mask & 0xff
  ].join('.');
};