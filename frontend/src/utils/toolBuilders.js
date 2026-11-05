// ============================================
// Command builders for the 🧰 toolbox - pure functions (no React), so they
// can be tested in Node. Every command is from the Fabric Engine 9.4 docs;
// page refs are in the comments and in the generated output.
// Each builder returns { errors: [...] } or { errors: [], blocks: [{title, text, note?}] }.
// ============================================

export const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,32}$/;
// slot/port[/sub][-slot/port[/sub]][,...]
const PORTS_RE = /^\d+\/\d+(\/\d+)?(-\d+\/\d+(\/\d+)?)?(,\d+\/\d+(\/\d+)?(-\d+\/\d+(\/\d+)?)?)*$/;
const SYSID_RE = /^[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}$/;

// Values the CLI parses as one WORD: quote anything with spaces
const word = (s) => (/\s/.test(s) ? `"${s.replace(/"/g, '')}"` : s);
const pad = (n, w) => String(n).padStart(w, '0');
const ipToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + parseInt(o), 0) >>> 0;
const intToIp = (n) => [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.');
const cidrMask = (len) => intToIp(len === 0 ? 0 : (~0 << (32 - len)) >>> 0);
const parseCidr = (cidr) => {
  const m = /^([\d.]+)\/(\d{1,2})$/.exec((cidr || '').trim());
  if (!m || !IP_RE.test(m[1]) || +m[2] < 8 || +m[2] > 30) return null;
  const len = +m[2];
  const net = (ipToInt(m[1]) & ipToInt(cidrMask(len))) >>> 0;
  return { network: intToIp(net), len, mask: cidrMask(len), gateway: intToIp(net + 1) };
};
const vlanList = (s) => (s || '').split(/[\s,]+/).filter(Boolean).map(Number);
const validVlan = (v) => Number.isInteger(v) && v >= 2 && v <= 4059;

// FACE I-SID convention (L2 VSN): 2 + site(2) + VLAN(4) -> site 10 VLAN 24 = 2100024
export const faceIsid = (site, vlan) => parseInt(`2${pad(site, 2)}${pad(vlan, 4)}`);

// ---------------------------------------------------------------- SNMP
// CmdRef p.656-672, UG p.3481-3487
export function buildSnmp(f) {
  const errors = [];
  const ip = f.trapIp.trim();
  if (!f.v2c && !f.v3) errors.push('Pick SNMP v2c, v3, or both');
  if (ip && !IP_RE.test(ip)) errors.push('Site Engine IP must be an IPv4 address (or leave it blank for a placeholder)');
  if (f.v2c) {
    if (!f.roCommunity.trim()) errors.push('v2c: enter a read-only community string');
    [f.roCommunity, f.rwCommunity].forEach(c => {
      if (c && (c.length > 32 || c.includes('@') || c.includes('::') || /\s/.test(c))) errors.push('v2c: community strings are 1-32 characters, no spaces, "@" or "::" (UG p.3485)');
    });
    if (f.rwCommunity && f.rwCommunity === f.roCommunity) errors.push('v2c: read-only and read-write communities must differ');
  }
  if (f.v3) {
    if (!NAME_RE.test(f.v3User.trim())) errors.push('v3: user name is 1-32 letters, numbers, dot, dash or underscore');
    if (f.authPw.length < 8 || f.privPw.length < 8) errors.push('v3: authentication and privacy passwords need at least 8 characters');
    if (f.v3Access === 'ro' && !NAME_RE.test(f.v3Group.trim())) errors.push('v3: read-only access needs a group name (1-32 characters)');
  }
  if (errors.length) return { errors: [...new Set(errors)] };

  const host = ip || '<SITE-ENGINE-IP>';
  const hostNote = ip ? [] : ['! >>> Replace <SITE-ENGINE-IP> with your Site Engine IP address <<<'];
  const base = ['enable', 'configure terminal', ''];
  if (f.location.trim()) base.push(`snmp-server location ${word(f.location.trim())}`);
  if (f.contact.trim()) base.push(`snmp-server contact ${word(f.contact.trim())}`);
  const blocks = [];

  if (f.v2c) {
    const v2 = [...base];
    if (f.location.trim() || f.contact.trim()) v2.push('');
    v2.push('! SNMPv2c communities - secname links each to a default group (UG p.3485)');
    v2.push(`snmp-server community ${f.roCommunity.trim()} index faceRO secname readview`);
    if (f.rwCommunity.trim()) v2.push(`snmp-server community ${f.rwCommunity.trim()} index faceRW secname initialview`);
    v2.push('', '! SNMPv2c traps to Site Engine (CmdRef p.660)', ...hostNote, `snmp-server host ${host} v2c readview`, '', 'save config');
    blocks.push({ title: '1 · SNMPv2c — paste as one block', text: v2.join('\n') });
  }

  if (f.v3) {
    const group = f.v3Access === 'ro' ? f.v3Group.trim() : 'initial';
    if (f.v3Access === 'ro') {
      const g = [...(f.v2c ? ['enable', 'configure terminal'] : base), ''];
      g.push('! SNMPv3 read-only group (CmdRef p.657-658) - verify on your first switch');
      g.push(`snmp-server group ${group} "" auth-priv read-view root`);
      g.push(`snmp-server group ${group} "" auth-priv notify-view root`);
      blocks.push({ title: `${blocks.length + 1} · SNMPv3 group — paste as one block`, text: g.join('\n') });
    }
    const needsBase = !f.v2c && f.v3Access !== 'ro';
    const u = [...(needsBase ? base : ['enable', 'configure terminal']), ''];
    u.push(`! SNMPv3 user: SHA authentication + AES privacy, ${f.v3Access === 'ro' ? `read-only group "${group}"` : 'full access via the default "initial" group'} (UG p.3486)`);
    u.push(`snmp-server user ${f.v3User.trim()} group ${group} sha aes`);
    if (f.inlineAnswers) u.push(f.authPw, f.authPw, f.privPw, f.privPw);
    blocks.push({
      title: `${blocks.length + 1} · SNMPv3 user`,
      text: u.join('\n'),
      note: f.inlineAnswers
        ? "The four lines after the user command answer the switch's password prompts. If your terminal pastes too fast, paste up to the user command and type the passwords at the prompts instead."
        : "The switch will PROMPT for the passwords after this command (they can't go on the command line): authentication password, re-enter it, privacy password, re-enter it."
    });
    blocks.push({
      title: `${blocks.length + 1} · SNMPv3 traps to Site Engine`,
      text: ['configure terminal', '', '! SNMPv3 traps (CmdRef p.662)', ...hostNote, `snmp-server host ${host} v3 authPriv ${f.v3User.trim()}`, '', 'save config'].join('\n')
    });
  }
  return { errors: [], blocks };
}

// ---------------------------------------------------------------- Add / remove a VLAN
// Same lines FACE's generator uses for a site VLAN (configGenerator.js), so a
// day-2 VLAN looks exactly like one FACE built on day 1.
// vlan create/i-sid/delete CmdRef p.733/736, i-sid name p.561,
// dhcp-relay p.166, spb-multicast p.216; config-lite mvpn-isid UG p.1964.
export function buildVlan(f) {
  const errors = [];
  const site = parseInt(f.site);
  const vlan = parseInt(f.vlanId);
  if (!(site >= 1 && site <= 99)) errors.push('Site number must be 1-99');
  if (!validVlan(vlan)) errors.push('VLAN ID must be 2-4059');
  if (vlan === 4000) errors.push('VLAN 4000 is reserved for the Fabric Extend ISP port');
  if (!/^[A-Za-z]{1,4}$/.test((f.siteCode || '').trim())) errors.push('Site code: letters only, max 4 (e.g. LHS)');
  const isid = f.isid ? parseInt(f.isid) : (site && vlan ? faceIsid(site, vlan) : NaN);
  if (!(isid >= 1 && isid <= 15999999)) errors.push('I-SID must be 1-15999999');
  if (f.mode === 'add') {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test((f.vlanName || '').trim())) errors.push('VLAN name: 1-64 letters, numbers, dot, dash or underscore');
    if (!parseCidr(f.subnet)) errors.push('Subnet must look like 10.10.50.0/24 (prefix 8-30)');
    [f.dhcp1, f.dhcp2].forEach(d => { if (d && !IP_RE.test(d.trim())) errors.push(`DHCP server "${d}" is not an IPv4 address`); });
  }
  if (errors.length) return { errors: [...new Set(errors)] };

  const code = f.siteCode.trim().toUpperCase();
  const isidName = `${code}-${(f.vlanName || '').trim()}`;
  const blocks = [];

  if (f.mode === 'add') {
    const net = parseCidr(f.subnet);
    const l3 = ['enable', 'configure terminal', '', `! Add VLAN ${vlan} (${f.vlanName.trim()}) to site ${site} - L3 core`];
    l3.push(`vlan create ${vlan} name ${f.vlanName.trim()} type port-mstprstp 0`);
    l3.push(`vlan i-sid ${vlan} ${isid}`);
    l3.push(`i-sid name ${isid} ${isidName}`);
    l3.push('', `interface vlan ${vlan}`, `ip address ${net.gateway} ${net.mask}`);
    if (f.multicast) l3.push('ip spb-multicast enable');
    l3.push('ip igmp upnp-filter', 'ip dhcp-relay', 'enable');
    [f.dhcp1, f.dhcp2].filter(d => d && d.trim()).forEach(d => l3.push(`ip dhcp-relay fwd-path ${d.trim()} enable`));
    l3.push('exit', '', 'save config');
    blocks.push({ title: '1 · L3 core of the site', text: l3.join('\n'), note: `Gateway ${net.gateway} (${net.network}/${net.len}), I-SID ${isid}.` });

    const l2 = ['enable', 'configure terminal', '', `! Add VLAN ${vlan} (${f.vlanName.trim()}) to site ${site} - L2 access`];
    l2.push(`vlan create ${vlan} name ${f.vlanName.trim()} type port-mstprstp 0`);
    l2.push(`vlan i-sid ${vlan} ${isid}`);
    l2.push(`i-sid name ${isid} ${isidName}`);
    if (f.multicast) l2.push('', '! IP Multicast config-lite (GRT) - same as FACE-generated access configs', `interface vlan ${vlan}`, 'mvpn-isid 0', 'ip spb-multicast enable', 'exit');
    l2.push('', 'save config');
    blocks.push({ title: '2 · Every L2 access switch at the site', text: l2.join('\n'), note: 'Skip this on the access switches if it is an SSID VLAN delivered by Fabric Attach (Extreme wireless).' });
  } else {
    const warn = `! Removes VLAN ${vlan} / I-SID ${isid} - make sure no ports or devices still use it`;
    blocks.push({
      title: '1 · Every switch at the site (access switches first, L3 core last)',
      text: ['enable', 'configure terminal', '', warn, `no i-sid name ${isid}`, `vlan delete ${vlan}`, '', 'save config'].join('\n'),
      note: 'Deleting the VLAN on the L3 core also removes its gateway IP and DHCP relay.'
    });
  }
  return { errors: [], blocks };
}

// ---------------------------------------------------------------- Access ports
// auto-sense enable CmdRef p.133 / UG p.35, name p.303, poe-shutdown p.309,
// shutdown p.320, encapsulation dot1q p.154, default-vlan-id p.139,
// vlan members p.739
export function buildPorts(f) {
  const errors = [];
  const ports = (f.ports || '').replace(/\s/g, '');
  if (!PORTS_RE.test(ports)) errors.push('Ports must look like 1/1-1/24 or 1/5,1/7,2/1-2/12');
  const vlans = vlanList(f.vlans);
  if (f.mode === 'access' && (vlans.length !== 1 || !validVlan(vlans[0]))) errors.push('Static access: enter exactly one VLAN (2-4059)');
  if (f.mode === 'trunk' && (vlans.length === 0 || !vlans.every(validVlan))) errors.push('Tagged: enter one or more VLANs (2-4059), comma separated');
  if (f.portName && f.portName.length > 64) errors.push('Port name: max 64 characters');
  if (errors.length) return { errors };

  const intf = `interface gigabitEthernet ${ports}`;
  const extras = [];
  if (f.portName && f.portName.trim()) extras.push(`name ${word(f.portName.trim())}`);
  if (f.poe === 'off') extras.push('poe poe-shutdown');
  if (f.poe === 'on') extras.push('no poe poe-shutdown');
  const out = ['enable', 'configure terminal', ''];
  let note = '';

  if (f.mode === 'autosense') {
    out.push(`! Ports ${ports}: back to Auto-sense (FACE default)`, intf, 'auto-sense enable', ...extras, 'no shutdown', 'exit');
    note = 'Turning Auto-sense on resets these ports to defaults - any static VLAN or MLT config on them is removed (UG p.35).';
  } else if (f.mode === 'access') {
    const v = vlans[0];
    out.push(`! Ports ${ports}: static untagged access in VLAN ${v}`, intf, 'no auto-sense enable', ...extras, 'no shutdown', 'exit');
    out.push(`vlan members remove 1 ${ports}`, `vlan members add ${v} ${ports}`, intf, `default-vlan-id ${v}`, 'exit');
    note = `VLAN ${v} must already exist on this switch (with its I-SID). Turning Auto-sense off returns the ports to VLAN 1 first, then they are moved into VLAN ${v}.`;
  } else if (f.mode === 'trunk') {
    out.push(`! Ports ${ports}: 802.1Q tagged for VLAN ${vlans.join(', ')}`, intf, 'no auto-sense enable', 'encapsulation dot1q', ...extras, 'no shutdown', 'exit');
    vlans.forEach(v => out.push(`vlan members add ${v} ${ports}`));
    note = 'Each VLAN must already exist on this switch (with its I-SID). For an uplink to another fabric switch you do not need this - Auto-sense forms the fabric link on its own.';
  } else {
    out.push(`! Ports ${ports}: administratively down`, intf, ...extras, 'shutdown', 'exit');
    note = 'Ports stay down until "no shutdown". Auto-sense setting is left as is.';
  }
  out.push('', 'save config');
  return { errors: [], blocks: [{ title: '1 · Paste on the switch', text: out.join('\n'), note }] };
}

// ---------------------------------------------------------------- Core pair (vIST + SMLT)
// UG p.2685-2687 (vIST over SPB), CmdRef p.804 (smlt-peer-system-id, required),
// p.805 (virtual BMAC optional - derived automatically, so not set),
// p.586 (mlt member), UG p.2690-2691 (vlan mlt, interface mlt / smlt).
export function buildCorePair(f) {
  const errors = [];
  const a = { name: (f.aName || '').trim(), sysId: (f.aSysId || '').trim(), ip: (f.aIp || '').trim() };
  const b = { name: (f.bName || '').trim(), sysId: (f.bSysId || '').trim(), ip: (f.bIp || '').trim() };
  if (!a.name || !b.name) errors.push('Name both core switches');
  if (!SYSID_RE.test(a.sysId) || !SYSID_RE.test(b.sysId)) errors.push('System IDs look like a051.c6eb.c865 - get each with "show isis system-id"');
  if (a.sysId && a.sysId.toLowerCase() === b.sysId.toLowerCase()) errors.push('The two system IDs must differ');
  const vist = parseInt(f.vistVlan);
  if (!validVlan(vist)) errors.push('vIST VLAN must be 2-4059');
  if (vist === 4000) errors.push('VLAN 4000 is reserved for the Fabric Extend ISP port');
  const isid = parseInt(f.vistIsid);
  if (!(isid >= 1 && isid <= 15999999)) errors.push('vIST I-SID must be 1-15999999 and used nowhere else');
  const len = parseInt(f.prefix);
  if (!IP_RE.test(a.ip) || !IP_RE.test(b.ip) || !(len >= 24 && len <= 30)) errors.push('vIST IPs must be IPv4 addresses with a /24-/30 prefix');
  else if (((ipToInt(a.ip) & ipToInt(cidrMask(len))) >>> 0) !== ((ipToInt(b.ip) & ipToInt(cidrMask(len))) >>> 0)) errors.push('Both vIST IPs must be in the same subnet');
  else if (a.ip === b.ip) errors.push('The two vIST IPs must differ');
  const smlts = (f.smlts || []).filter(s => s.mlt || s.ports || s.vlans);
  smlts.forEach((s, i) => {
    const id = parseInt(s.mlt);
    if (!(id >= 1 && id <= 512)) errors.push(`SMLT row ${i + 1}: MLT ID must be 1-512`);
    if (!PORTS_RE.test((s.ports || '').replace(/\s/g, ''))) errors.push(`SMLT row ${i + 1}: ports must look like 1/47-1/48`);
    const v = vlanList(s.vlans);
    if (v.length === 0 || !v.every(validVlan)) errors.push(`SMLT row ${i + 1}: enter the VLANs it carries (2-4059)`);
  });
  if (new Set(smlts.map(s => s.mlt)).size !== smlts.length) errors.push('Each SMLT needs its own MLT ID');
  if (errors.length) return { errors: [...new Set(errors)] };

  const mask = cidrMask(len);
  const forSwitch = (me, peer) => {
    const out = ['enable', 'configure terminal', '', `! ===== ${me.name}: vIST with ${peer.name} =====`];
    out.push('! Peer system ID - required for SMLT over SPB (CmdRef p.804)');
    out.push('router isis', `spbm 1 smlt-peer-system-id ${peer.sysId.toLowerCase()}`, 'exit', '');
    out.push('! vIST VLAN - its I-SID must not be used anywhere else (UG p.2685)');
    out.push(`vlan create ${vist} name vIST type port-mstprstp 0`, `vlan i-sid ${vist} ${isid}`);
    out.push(`interface vlan ${vist}`, `ip address ${me.ip} ${mask}`, 'exit', '');
    out.push(`virtual-ist peer-ip ${peer.ip} vlan ${vist}`);
    smlts.forEach(s => {
      const ports = s.ports.replace(/\s/g, '');
      const v = vlanList(s.vlans);
      out.push('', `! SMLT ${s.mlt}${s.desc ? ` - ${s.desc}` : ''}: ports ${ports}, VLAN ${v.join(', ')}`);
      out.push(`interface gigabitEthernet ${ports}`, 'no auto-sense enable', 'exit');
      out.push(`mlt ${s.mlt} enable`, `mlt ${s.mlt} member ${ports}`);
      if (v.length > 1 || s.tagged) out.push(`mlt ${s.mlt} encapsulation dot1q`);
      v.forEach(x => out.push(`vlan mlt ${x} ${s.mlt}`));
      out.push(`interface mlt ${s.mlt}`, 'smlt', 'exit');
      out.push(`interface gigabitEthernet ${ports}`, 'no shutdown', 'exit');
    });
    out.push('', 'save config');
    return out.join('\n');
  };
  const note = 'The fabric link between the two cores comes up by itself through Auto-sense. Every SMLT VLAN must exist with the SAME I-SID on both cores (UG p.2685).';
  return {
    errors: [],
    blocks: [
      { title: `1 · ${a.name}`, text: forSwitch(a, b), note },
      { title: `2 · ${b.name}`, text: forSwitch(b, a), note: 'Mirror of block 1 - only the peer system ID and vIST IPs swap.' }
    ]
  };
}

// ---------------------------------------------------------------- Verification pack
// All commands confirmed in CmdRef 9.4 (pages in the list below).
const CHECKS = {
  all: [
    ['show sys-info', 'Right model and serial; uptime matches the last reboot.', 1799],
    ['show software', 'Running release is the expected Fabric Engine 9.4.x.', 1766],
    ['show isis adjacencies', 'Every expected fabric neighbor listed and UP.', 1603],
    ['show isis spbm', 'SPBM instance present with its B-VIDs.', 1644],
    ['show auto-sense', 'Ports in the expected Auto-sense states (NNI toward the fabric, UNI toward devices).', 1234],
    ['show lldp neighbor', 'The expected neighbor on each uplink port.', 1098],
    ['show ssh global', 'SSH enabled.', 1781],
    ['show web-server', 'Web server on, secure-only (HTTPS only).', 1824]
  ],
  l3: [
    ['show vlan i-sid', 'Each VLAN maps to its I-SID (FACE: 2 + site + VLAN, e.g. site 10 VLAN 24 = 2100024).', 1815],
    ['show ip interface', 'Each VLAN interface up with its .1 gateway.', 1428],
    ['show ip route', 'Expected routes, including the default route if one was set.', 115],
    ['show ip dhcp-relay fwd-path', 'Both DHCP servers listed and enabled for each user VLAN.', 1400]
  ],
  l2: [
    ['show vlan i-sid', 'Same VLAN-to-I-SID pairs as the site L3 core.', 1815],
    ['show i-sid', 'The site I-SIDs are present.', 1360]
  ],
  fe: [
    ['show isis logical-interface', 'One logical interface per tunnel, toward the hub (or each remote on the hub).', 1615],
    ['show isis adjacencies', 'An UP adjacency over each Fabric Extend tunnel.', 1603]
  ],
  multicast: [['show isis spbm ip-multicast-route', 'Streams appear once a sender and a receiver are active.', 1646]],
  wireless: [
    ['show fa elements', 'Access points listed as Fabric Attach clients.', 1345],
    ['show fa interface', 'Fabric Attach active on the AP ports.', 1347]
  ],
  voice: [['show auto-sense voice', 'Voice I-SID set, and C-VID = the VOICE VLAN.', 1234]],
  vist: [
    ['show virtual-ist', 'Peer IP correct and the vIST is up.', 1809],
    ['show mlt', 'SMLT MLTs up with their member ports.', 1708],
    ['show smlt', 'Each SMLT is up on both cores.', 1762]
  ],
  snmp: [['show snmp-server host', 'Site Engine listed as a trap receiver.', 1766]]
};
export const CHECK_GROUPS = [
  ['l3', 'L3 core'], ['l2', 'L2 access'], ['fe', 'Fabric Extend endpoint'], ['multicast', 'IP multicast'],
  ['wireless', 'Extreme wireless (FA)'], ['voice', 'IP phones'], ['vist', 'Core pair (vIST/SMLT)'], ['snmp', 'SNMP']
];

export function buildVerify(sel) {
  const groups = ['all', ...CHECK_GROUPS.map(g => g[0]).filter(k => sel[k])];
  const seen = new Set();
  const rows = [];
  groups.forEach(g => CHECKS[g].forEach(([cmd, good, page]) => {
    if (seen.has(cmd)) return;
    seen.add(cmd);
    rows.push({ cmd, good, page });
  }));
  const text = rows.map(r => r.cmd).join('\n');
  return { errors: [], rows, blocks: [{ title: 'Paste these (read-only - they change nothing)', text }] };
}
