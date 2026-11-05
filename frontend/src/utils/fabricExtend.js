// Fabric Extend (FE-IP over an ISP) - shared by the Wizard and the Configure
// step so wizard and Excel/template projects build tunnels the same way.
// FE 9.4 UG p.1316-1319: sites joined by FE-IP tunnels run as ONE SPB fabric,
// so moving a site to dark fiber later only swaps its tunnel for a fiber NNI.
//
// cfg shape: { enabled, hubSiteId, sites: { [siteId]: { link: 'extend'|'fiber',
//              wanPort, wanIp, ispGw } } }

export const FE_BROUTER_VLAN = 4000; // internal VLAN behind the ISP brouter port

export const FE_MTU_NOTE =
  'Confirm the end-to-end MTU with each ISP before cutover - the tunnel adds overhead on top of ' +
  'customer frames (switch system MTU defaults to 1950). Have the ISP raise the path MTU to fit; ' +
  'the FE tunnel IS-IS MTU (default 1600, range 750-1600) only covers IS-IS control packets (FE 9.4 UG p.1312).';

export const FE_PLATFORM_NOTE = 'Tunnel endpoints should be 5520 or 7520 cores.';

const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const ipToInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + parseInt(o), 0) >>> 0;
const sameSubnet = (ipCidr, gw) => {
  const [ip, len] = ipCidr.split('/');
  const mask = (~0 << (32 - parseInt(len))) >>> 0;
  return ((ipToInt(ip) & mask) >>> 0) === ((ipToInt(gw) & mask) >>> 0);
};

// Sites that terminate a tunnel: the hub plus every non-fiber site
export const feEndpointIds = (cfg, siteIds) =>
  siteIds.filter(id => id === cfg.hubSiteId || (cfg.sites[id] || {}).link !== 'fiber');

// The site's core that terminates the tunnel: an MDF L3 if there is one,
// else the first L3 switch of the site
export const coreFor = (switches, siteId) => {
  const l3 = switches.filter(sw => sw.siteId === siteId && sw.type === 'L3');
  return l3.find(sw => /MDF/i.test(`${sw.closet || ''} ${sw.name}`)) || l3[0] || null;
};

// sites: [{ siteId, label }] ; returns an error string or null
export const validateFabricExtend = (cfg, sites, switches, vlanIds = []) => {
  if (!cfg || !cfg.enabled) return null;
  if (sites.length < 2) return 'Fabric Extend needs at least two sites (the hub plus one remote)';
  if (!sites.some(s => s.siteId === cfg.hubSiteId)) return 'Fabric Extend: pick the hub site';
  const ids = feEndpointIds(cfg, sites.map(s => s.siteId));
  if (ids.length < 2) return 'Fabric Extend: set at least one site to "Fabric Extend (ISP)"';
  for (const id of ids) {
    const who = (sites.find(s => s.siteId === id) || {}).label || `Site ${id}`;
    const s = cfg.sites[id] || {};
    if (!/^\d+\/\d+(\/\d+)?$/.test((s.wanPort || '').trim())) return `${who}: ISP port must look like 1/48`;
    const [ip, len] = (s.wanIp || '').trim().split('/');
    if (!IP_RE.test(ip || '') || !(parseInt(len) >= 8 && parseInt(len) <= 31)) return `${who}: ISP-facing IP must be like 203.0.113.2/30`;
    if (!IP_RE.test((s.ispGw || '').trim())) return `${who}: ISP gateway must be an IP address`;
    if (!sameSubnet(s.wanIp.trim(), s.ispGw.trim())) return `${who}: ISP gateway ${s.ispGw} is not in ${s.wanIp}`;
    if (ip === s.ispGw.trim()) return `${who}: ISP-facing IP and gateway can't be the same`;
    if (switches && !coreFor(switches, id)) return `${who} terminates a Fabric Extend tunnel but has no L3 core switch`;
  }
  const wanIps = ids.map(id => cfg.sites[id].wanIp.trim().split('/')[0]);
  if (new Set(wanIps).size !== wanIps.length) return 'Every site needs its own ISP-facing IP (they are the tunnel endpoints)';
  if (vlanIds.map(Number).includes(FE_BROUTER_VLAN)) return `VLAN ${FE_BROUTER_VLAN} is reserved for the Fabric Extend ISP port - this project already uses it`;
  return null;
};

// Returns a NEW switch array: any previous fabricExtend removed, then the
// hub-and-spoke tunnel plan attached to each endpoint site's core.
export const applyFabricExtend = (switches, cfg, sites) => {
  const out = switches.map(sw => {
    if (!sw.fabricExtend) return sw;
    const { fabricExtend, ...rest } = sw;
    return rest;
  });
  if (!cfg || !cfg.enabled) return out;
  const label = (id) => String((sites.find(s => s.siteId === id) || {}).label || `SITE${id}`)
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
  const tip = (id) => cfg.sites[id].wanIp.trim().split('/')[0];
  const remotes = feEndpointIds(cfg, sites.map(s => s.siteId)).filter(id => id !== cfg.hubSiteId);
  const attach = (id, tunnels) => {
    const core = coreFor(out, id);
    if (!core) return;
    const s = cfg.sites[id];
    const idx = out.indexOf(core);
    out[idx] = {
      ...core,
      fabricExtend: {
        wanPort: s.wanPort.trim(), wanIp: s.wanIp.trim(), ispGw: s.ispGw.trim(),
        brouterVlan: FE_BROUTER_VLAN, hub: id === cfg.hubSiteId, tunnels
      }
    };
  };
  if (remotes.length === 0) return out;
  attach(cfg.hubSiteId, remotes.map((id, i) => ({ id: i + 1, destIp: tip(id), name: `FE-to-${label(id)}` })));
  remotes.forEach(id => attach(id, [{ id: 1, destIp: tip(cfg.hubSiteId), name: `FE-to-${label(cfg.hubSiteId)}` }]));
  return out;
};

// Rebuild a cfg from switches that already carry fabricExtend (wizard
// projects, saved projects) so the Configure step opens pre-filled
export const cfgFromSwitches = (switches) => {
  const carriers = switches.filter(sw => sw.fabricExtend);
  if (carriers.length === 0) return null;
  const hub = carriers.find(sw => sw.fabricExtend.hub);
  const cfg = { enabled: true, hubSiteId: hub ? hub.siteId : carriers[0].siteId, sites: {} };
  carriers.forEach(sw => {
    cfg.sites[sw.siteId] = { link: 'extend', wanPort: sw.fabricExtend.wanPort, wanIp: sw.fabricExtend.wanIp, ispGw: sw.fabricExtend.ispGw };
  });
  // sites without a tunnel in an FE project were reached over dark fiber
  [...new Set(switches.map(sw => sw.siteId))].forEach(id => { if (!cfg.sites[id]) cfg.sites[id] = { link: 'fiber' }; });
  return cfg;
};
