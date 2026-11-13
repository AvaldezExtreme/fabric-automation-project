// One place that decides every switch's management addressing, so the L2
// config, mgmt.csv, the Site Engine CSV and the validator can never disagree
// (before V2611132 each computed its own: the CSVs used 10.<site>.<VLAN>.x and
// switch-name suffixes, which broke on VLAN 1024 and restarted per closet).
//
// L2: mgmt VLAN subnet's first three octets + the switch's per-site sequence
//     number (mgmtIpOctet); gateway = first three octets + .1 - the same
//     address the L3 core puts on that VLAN's SVI.
// L3: the CLIP the L3 config builds (Ports-column loopback, else <site>.1.1.1),
//     plus its own SVI address on the mgmt VLAN (first three octets + .1).

export const cidrToMask = (prefix) => {
  const n = parseInt(prefix);
  const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
  return [24, 16, 8, 0].map(s => (mask >>> s) & 255).join('.');
};

const validOctets = (ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every(o => parseInt(o) <= 255);

export const mgmtAddressFor = (sw) => {
  const vlanId = sw.mgmtVlan ? parseInt(sw.mgmtVlan) : 8;
  const vlan = (sw.vlans || []).find(v => v.vlanId === vlanId) || null;
  const subnet = vlan && vlan.subnet && vlan.subnet.includes('/') ? vlan.subnet : null;
  const first3 = subnet ? subnet.split('/')[0].split('.').slice(0, 3).join('.') : null;
  const prefix = subnet ? subnet.split('/')[1] : '24';
  const out = {
    vlanId,
    isid: vlan ? vlan.isid : null,
    subnet,
    prefix,
    mask: cidrToMask(prefix),
    gateway: first3 ? `${first3}.1` : null,
    clip: sw.loopback ? sw.loopback : `${sw.siteId}.1.1.1`
  };
  if (sw.type === 'L3') {
    // Its own SVI on the mgmt VLAN (the gateway the L2s point at) - only when
    // the config really puts one there: a declared mgmt VLAN with a subnet,
    // and not a site-wide VLAN on a routed closet (those stay L2-only,
    // York-style). Otherwise the switch is managed through its CLIP.
    const ownsSvi = !!sw.mgmtVlan && !!out.gateway && !(sw.routedAccess && !vlan.closet);
    return ownsSvi
      ? { ...out, ip: out.gateway, viaClip: false, valid: validOctets(out.gateway) }
      : { ...out, ip: out.clip, viaClip: true, prefix: '32', mask: '255.255.255.255', gateway: null, valid: validOctets(out.clip) };
  }
  const octet = sw.mgmtIpOctet ? parseInt(sw.mgmtIpOctet) : 1;
  const ip = first3 ? `${first3}.${octet}` : null;
  return { ...out, octet, ip, valid: !!ip && validOctets(ip) };
};
