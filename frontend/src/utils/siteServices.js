// Per-site core services that depend on how sites are connected - shared by
// the Configure step (Excel, template and wizard projects all pass through it).
//
// Onboarding gateway: an IP on onboarding VLAN 4048 / I-SID 15999999 so new
// switches get DHCP, reach Site Engine, and Site Engine pushes their final IP
// config (FE 9.4 UG p.23, p.101-102). The onboarding I-SID spans the whole
// fabric, so there is ONE gateway per fabric:
//   siloed  -> every site is its own fabric -> every site's core
//   single / extend (incl. hybrid) -> one fabric -> the core site only
// Uplink: the routed hand-off out of the fabric. Siloed sites: the VLAN facing
// the ISP. Core site (one fabric / Fabric Extend): the VLAN facing the
// firewall. Fabric Extend remotes have no uplink - their ISP port is the
// tunnel's brouter port and everything else rides the fabric to the core.
//
// cfg shape: { onboarding: bool, sites: { [siteId]: { onboardingIp,
//              uplink: { vlanId, name, ip, port, nextHop } } } }

import { coreFor, FE_BROUTER_VLAN } from './fabricExtend.js';

export const ONBOARDING_VLAN = 4048;
export const ONBOARDING_SECONDARY_VLAN = 4049;
export const ONBOARDING_ISID = 15999999;

export const INTERCONNECTS = [
  { key: 'single', title: 'One fabric (dark fiber)', desc: 'All sites in one fabric. Onboarding gateway and firewall uplink on the core site only.' },
  { key: 'siloed', title: 'Siloed fabrics (ISP between sites)', desc: 'Each site is its own fabric. Every site core gets an onboarding gateway and an ISP uplink.' },
  { key: 'extend', title: 'Fabric Extend (tunnels across the ISP)', desc: 'Sites joined into one fabric. Onboarding gateway and firewall uplink on the core site only.' }
];

// Wizard architecture -> interconnect (hybrid = Fabric Extend with fiber sites)
export const interconnectFromArchitecture = (arch) =>
  arch === 'siloed' ? 'siloed' : (arch === 'extend' || arch === 'hybrid') ? 'extend' : arch === 'single' ? 'single' : null;

// Sites whose core carries the onboarding gateway / an uplink
export const serviceSiteIds = (mode, coreSiteId, siteIds) =>
  mode === 'siloed' ? [...siteIds] : siteIds.filter(id => id === coreSiteId);

// 10.48.<siteId>.1/24 (Claudio's standard); blank when the site ID can't be an octet
export const defaultOnboardingIp = (siteId) => {
  const n = parseInt(siteId);
  return Number.isInteger(n) && n >= 0 && n <= 255 ? `10.48.${n}.1/24` : '';
};

const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const ipToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + parseInt(o), 0) >>> 0;
const validCidr = (v) => {
  const [ip, len] = (v || '').trim().split('/');
  return IP_RE.test(ip || '') && parseInt(len) >= 8 && parseInt(len) <= 30;
};
const sameSubnet = (ipCidr, gw) => {
  const [ip, len] = ipCidr.split('/');
  const mask = (~0 << (32 - parseInt(len))) >>> 0;
  return ((ipToInt(ip) & mask) >>> 0) === ((ipToInt(gw) & mask) >>> 0);
};

const uplinkFilled = (u) => !!u && ['vlanId', 'name', 'ip', 'port', 'nextHop'].some(k => String(u[k] ?? '').trim() !== '');

// VLAN names are a single WORD on the switch
export const cleanVlanName = (name, fallback) =>
  (String(name || '').trim().replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 64)) || fallback;

// sites: [{ siteId, label }]; feCfg is the Fabric Extend cfg (for port clashes).
// Returns an error string or null.
export const validateSiteServices = (cfg, mode, coreSiteId, sites, switches, vlanIds = [], feCfg = null) => {
  const ids = serviceSiteIds(mode, coreSiteId, sites.map(s => s.siteId));
  const who = (id) => (sites.find(s => s.siteId === id) || {}).label || `Site ${id}`;
  const projectVlans = vlanIds.map(Number);
  const gateways = [];
  for (const id of ids) {
    const s = cfg.sites[id] || {};
    const hasCore = !switches || !!coreFor(switches, id);
    if (cfg.onboarding) {
      if (!hasCore) return `${who(id)} needs an L3 core switch for the onboarding gateway (or turn the onboarding gateway off)`;
      if (!validCidr(s.onboardingIp)) return `${who(id)}: onboarding gateway must look like 10.48.${id}.1/24`;
      gateways.push(s.onboardingIp.trim().split('/')[0]);
    }
    const u = s.uplink;
    if (!uplinkFilled(u)) continue;
    if (!hasCore) return `${who(id)} has an uplink but no L3 core switch`;
    const v = parseInt(u.vlanId);
    if (!(v >= 2 && v <= 4059)) return `${who(id)}: uplink VLAN must be 2-4059`;
    if ([ONBOARDING_VLAN, ONBOARDING_SECONDARY_VLAN].includes(v)) return `${who(id)}: VLAN ${v} is reserved for onboarding`;
    if (mode === 'extend' && v === FE_BROUTER_VLAN) return `${who(id)}: VLAN ${v} is reserved for the Fabric Extend ISP port`;
    if (projectVlans.includes(v)) return `${who(id)}: uplink VLAN ${v} is already a fabric VLAN in this project - the uplink needs its own VLAN`;
    if (!/^\d+\/\d+(\/\d+)?$/.test(String(u.port || '').trim())) return `${who(id)}: uplink port must look like 1/48`;
    if (!validCidr(u.ip)) return `${who(id)}: uplink IP must look like 10.254.253.42/24`;
    if (!IP_RE.test(String(u.nextHop || '').trim())) return `${who(id)}: uplink next hop must be an IP address`;
    if (!sameSubnet(u.ip.trim(), u.nextHop.trim())) return `${who(id)}: next hop ${u.nextHop} is not in ${u.ip}`;
    if (u.ip.trim().split('/')[0] === u.nextHop.trim()) return `${who(id)}: uplink IP and next hop can't be the same`;
    const fe = feCfg && feCfg.enabled && feCfg.sites ? feCfg.sites[id] : null;
    if (mode === 'extend' && fe && String(fe.wanPort || '').trim() === String(u.port).trim()) {
      return `${who(id)}: port ${u.port} is already the Fabric Extend ISP port - the uplink needs a different port`;
    }
  }
  if (new Set(gateways).size !== gateways.length) return 'Every onboarding gateway needs its own IP';
  return null;
};

// Returns a NEW switch array: previous onboarding/uplink removed, then
// re-attached to the core of each site that should carry them.
export const applySiteServices = (switches, cfg, mode, coreSiteId) => {
  const out = switches.map(sw => {
    if (!sw.onboarding && !sw.uplink) return sw;
    const { onboarding, uplink, ...rest } = sw;
    return rest;
  });
  const siteIds = [...new Set(out.map(sw => sw.siteId))];
  serviceSiteIds(mode, coreSiteId, siteIds).forEach(id => {
    const core = coreFor(out, id);
    if (!core) return;
    const s = cfg.sites[id] || {};
    const patch = {};
    if (cfg.onboarding && validCidr(s.onboardingIp)) patch.onboarding = { ip: s.onboardingIp.trim() };
    if (uplinkFilled(s.uplink)) {
      const u = s.uplink;
      const role = mode === 'siloed' ? 'isp' : 'firewall';
      patch.uplink = {
        role,
        vlanId: parseInt(u.vlanId),
        name: cleanVlanName(u.name, role === 'isp' ? 'ISP-WAN' : 'FW-Uplink'),
        ip: u.ip.trim(), port: String(u.port).trim(), nextHop: u.nextHop.trim()
      };
    }
    if (Object.keys(patch).length) {
      const idx = out.indexOf(core);
      out[idx] = { ...core, ...patch };
    }
  });
  return out;
};

// Seed the cfg from switches (Excel uplink columns, or a previous visit) and
// saved settings. Every site gets a default onboarding IP so switching modes
// never leaves a row blank.
export const siteServicesFromSwitches = (switches, settings = {}) => {
  const cfg = { onboarding: settings.onboardingGateway !== false, sites: {} };
  [...new Set(switches.map(sw => sw.siteId))].forEach(id => {
    const carriers = switches.filter(sw => sw.siteId === id);
    const withUplink = carriers.find(sw => sw.uplink);
    const withOnb = carriers.find(sw => sw.onboarding);
    const u = withUplink ? withUplink.uplink : null;
    cfg.sites[id] = {
      onboardingIp: withOnb ? withOnb.onboarding.ip : defaultOnboardingIp(id),
      uplink: u
        ? { vlanId: u.vlanId ?? '', name: u.name || '', ip: u.ip || '', port: u.port || '', nextHop: u.nextHop || '' }
        : { vlanId: '', name: '', ip: '', port: '', nextHop: '' }
    };
  });
  return cfg;
};
