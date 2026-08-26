// ============================================
// Intake Wizard (Tier 3.1)
// Version: V2608267
// Purpose: Build a FACE project from discovery questions - no Excel needed.
// Vertical -> sites -> services -> closets -> optional Segmented VRF
// (FE 9.4) -> generates switches in the exact parser output shape.
// ============================================

import React, { useState } from 'react';

const BRAND = {
  purple: '#5B059C', indigo: '#20004C', violet: '#7519F9',
  steel: '#7D76F2', success: '#00CC99', warning: '#FF9900', error: '#FF3333'
};

// Vertical presets: terminology + seeded VLAN service sets
const VERTICALS = {
  'K-12': {
    icon: '🏫', siteNoun: 'School',
    services: [
      { vlanId: 8, name: 'Netmgmt', deviceType: 'ap' },
      { vlanId: 16, name: 'VoIP', deviceType: 'voice' },
      { vlanId: 24, name: 'Data', deviceType: 'data' },
      { vlanId: 32, name: 'Cameras', deviceType: 'camera' },
      { vlanId: 40, name: 'Guest', deviceType: '' }
    ]
  },
  'Higher-Ed': {
    icon: '🎓', siteNoun: 'Campus Building',
    services: [
      { vlanId: 8, name: 'Netmgmt', deviceType: 'ap' },
      { vlanId: 16, name: 'VoIP', deviceType: 'voice' },
      { vlanId: 24, name: 'Faculty', deviceType: 'data' },
      { vlanId: 32, name: 'Labs', deviceType: 'data' },
      { vlanId: 40, name: 'Dorms', deviceType: '' },
      { vlanId: 48, name: 'Cameras', deviceType: 'camera' }
    ]
  },
  'S&L': {
    icon: '🏛️', siteNoun: 'Office',
    services: [
      { vlanId: 8, name: 'Netmgmt', deviceType: 'ap' },
      { vlanId: 16, name: 'VoIP', deviceType: 'voice' },
      { vlanId: 24, name: 'Staff', deviceType: 'data' },
      { vlanId: 32, name: 'Security', deviceType: 'camera' },
      { vlanId: 40, name: 'PublicWiFi', deviceType: '' }
    ]
  },
  'Enterprise': {
    icon: '🏢', siteNoun: 'Branch',
    services: [
      { vlanId: 8, name: 'Netmgmt', deviceType: 'ap' },
      { vlanId: 16, name: 'VoIP', deviceType: 'voice' },
      { vlanId: 24, name: 'Corp', deviceType: 'data' },
      { vlanId: 32, name: 'IoT', deviceType: '' },
      { vlanId: 40, name: 'Guest', deviceType: '' }
    ]
  }
};

const ARCHITECTURES = [
  { key: 'single', icon: '🕸️', title: 'One Fabric', desc: 'Dark fiber between sites - one fabric across the district. I-SIDs unique everywhere.' },
  { key: 'siloed', icon: '🏝️', title: 'Siloed Fabrics', desc: 'ISP between sites - each site is its own fabric island.' },
  { key: 'extend', icon: '🌉', title: 'Fabric Extend', desc: 'Extend the fabric across an ISP between sites.' }
];

// VLANs whose name/type suggests they should be Untrusted under Segmented VRF
const suggestUntrusted = (svc) =>
  /guest|iot|camera|public|dorm|byod|security/i.test(svc.name) || svc.deviceType === 'camera';

const pad = (n, w) => String(n).padStart(w, '0');
const isidFor = (site, vlan) => parseInt(`12${pad(site, 2)}${pad(vlan, 4)}`);
const subnetFor = (template, site, vlan) =>
  template.replaceAll('{site+100}', String(site + 100)).replaceAll('{site}', String(site)).replaceAll('{vlan}', String(vlan));

function Wizard({ onComplete, onCancel }) {
  const [step, setStep] = useState(0);
  const [vertical, setVertical] = useState(null);
  const [districtName, setDistrictName] = useState('');
  const [architecture, setArchitecture] = useState('single');
  const [sites, setSites] = useState([{ site: 10, code: '', location: '' }]);
  const [services, setServices] = useState([]);
  const [subnetTemplate, setSubnetTemplate] = useState('10.{site}.{vlan}.0/24');
  const [closetsBySite, setClosetsBySite] = useState({}); // code -> [{name, count}]
  const [segVrf, setSegVrf] = useState({
    enabled: false, vrfName: 'segvrf', vrfId: 10,
    fwVlanId: 192, fwSubnet: '192.168.254.0/24', switchIp: '192.168.254.2', fwIp: '192.168.254.1',
    classes: {} // vlanId -> 'trusted' | 'untrusted'
  });
  const [error, setError] = useState('');

  const noun = vertical ? VERTICALS[vertical].siteNoun : 'Site';
  const STEPS = ['Basics', `${noun}s`, 'Services', 'Closets', 'Segmented VRF', 'Create'];

  const pickVertical = (v) => {
    setVertical(v);
    setServices(VERTICALS[v].services.map(s => ({ ...s })));
    const classes = {};
    VERTICALS[v].services.forEach(s => { classes[s.vlanId] = suggestUntrusted(s) ? 'untrusted' : 'trusted'; });
    setSegVrf(prev => ({ ...prev, classes }));
  };

  // ---------- validation per step ----------
  const validate = () => {
    setError('');
    if (step === 0) {
      if (!vertical) return setError('Pick a vertical to continue'), false;
      if (!districtName.trim()) return setError('Give the project a name'), false;
    }
    if (step === 1) {
      if (sites.length === 0) return setError(`Add at least one ${noun.toLowerCase()}`), false;
      for (const s of sites) {
        if (!s.code.trim()) return setError(`Every ${noun.toLowerCase()} needs a short code (e.g. LHS)`), false;
        if (!s.site || s.site < 1 || s.site > 99) return setError('Site numbers must be 1-99 (they drive I-SIDs)'), false;
      }
      const nums = sites.map(s => s.site);
      if (new Set(nums).size !== nums.length) return setError('Site numbers must be unique'), false;
      const codes = sites.map(s => s.code.trim().toUpperCase());
      if (new Set(codes).size !== codes.length) return setError('Site codes must be unique'), false;
    }
    if (step === 2) {
      if (services.length === 0) return setError('Add at least one VLAN service'), false;
      for (const s of services) {
        const id = parseInt(s.vlanId);
        if (isNaN(id) || id < 1 || id > 4094) return setError(`VLAN "${s.vlanId}" must be 1-4094`), false;
        if (!s.name.trim()) return setError('Every VLAN needs a name'), false;
      }
      const ids = services.map(s => parseInt(s.vlanId));
      if (new Set(ids).size !== ids.length) return setError('VLAN IDs must be unique'), false;
    }
    if (step === 3) {
      for (const s of sites) {
        const closets = closetsBySite[s.code] || [];
        if (closets.length === 0) return setError(`${s.code} needs at least one closet`), false;
        for (const c of closets) {
          if (!c.name.trim()) return setError('Every closet needs a name'), false;
          if (!c.count || c.count < 1) return setError('Every closet needs at least 1 switch'), false;
        }
      }
    }
    if (step === 4 && segVrf.enabled) {
      const fwId = parseInt(segVrf.fwVlanId);
      if (isNaN(fwId) || fwId < 1 || fwId > 4094) return setError('FW link VLAN must be 1-4094'), false;
      if (services.some(s => parseInt(s.vlanId) === fwId)) return setError('FW link VLAN must not collide with a service VLAN'), false;
      if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(segVrf.fwSubnet)) return setError('FW link subnet must be CIDR (e.g. 192.168.254.0/24)'), false;
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(segVrf.switchIp)) return setError('Switch-side IP must be a valid IP'), false;
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(segVrf.fwIp)) return setError('Firewall IP must be a valid IP'), false;
    }
    return true;
  };

  const next = () => {
    if (!validate()) return;
    if (step === 1) {
      // seed closets for any new sites
      setClosetsBySite(prev => {
        const out = { ...prev };
        sites.forEach(s => { if (!out[s.code]) out[s.code] = [{ name: 'MDF1', count: 1 }, { name: 'IDF1', count: 1 }]; });
        return out;
      });
    }
    setStep(step + 1);
  };

  // ---------- build the project (parser output shape) ----------
  const createProject = () => {
    if (!validate()) return;
    const switches = [];
    let vlanCount = 0;

    sites.forEach(siteDef => {
      const site = parseInt(siteDef.site);
      const code = siteDef.code.trim().toUpperCase();
      const location = (siteDef.location || code).trim().toUpperCase();

      const vlans = services.map(svc => ({
        vlanId: parseInt(svc.vlanId),
        vlanName: svc.name.trim(),
        subnet: subnetFor(subnetTemplate, site, parseInt(svc.vlanId)),
        isid: isidFor(site, parseInt(svc.vlanId)),
        isidName: `${code}-${svc.name.trim()}`,
        deviceType: svc.deviceType || null,
        closet: ''
      }));
      vlanCount += vlans.length;

      const mgmtVlanObj = vlans.find(v => /mgmt/i.test(v.vlanName)) || vlans[0];
      const gw = mgmtVlanObj.subnet.split('/')[0].split('.').slice(0, 3).join('.') + '.1';

      // auto-sense: first VLAN per device type (mirrors the parser)
      const typeMap = {};
      vlans.forEach(v => { if (v.deviceType && !typeMap[v.deviceType]) typeMap[v.deviceType] = v; });
      const autoSense = [];
      if (typeMap.data) autoSense.push({ type: 'data', command: `auto-sense data i-sid ${typeMap.data.isid}` });
      if (typeMap.voice) autoSense.push({ type: 'voice', command: `auto-sense voice i-sid ${typeMap.voice.isid} c-vid ${(typeMap.data || typeMap.voice).vlanId}` });
      if (typeMap.ap) autoSense.push({ type: 'ap', command: `auto-sense fa wap-type1 i-sid ${typeMap.ap.isid}` });
      if (typeMap.camera) autoSense.push({ type: 'camera', command: `auto-sense fa camera i-sid ${typeMap.camera.isid}` });

      let octet = 0;
      (closetsBySite[code] || []).forEach(closet => {
        for (let i = 1; i <= parseInt(closet.count); i++) {
          octet += 1;
          const isMdfHead = closet.name.toUpperCase().includes('MDF') && i === 1;
          switches.push({
            name: `${code}-${closet.name.trim()}-${i}`,
            type: isMdfHead ? 'L3' : 'L2',
            siteId: site,
            location,
            serviceApp: code,
            mgmtVlan: mgmtVlanObj.vlanId,
            defaultGateway: gw,
            closet: closet.name.trim(),
            loopback: null,
            mgmtIpOctet: octet,
            vlans: [...vlans],
            isidPrefix: code.substring(0, 4).toUpperCase(),
            autoSenseCommands: autoSense,
            l2DefaultGateway: gw
          });
        }
      });
    });

    onComplete({
      file: { name: `Wizard: ${districtName.trim()}` },
      vlanCount,
      switches,
      serialMap: {},
      settings: {
        districtName: districtName.trim(),
        vertical,
        fabricArchitecture: architecture,
        accessModel: 'site-wide',
        segmentedVrf: segVrf.enabled ? { ...segVrf, fwVlanId: parseInt(segVrf.fwVlanId), vrfId: parseInt(segVrf.vrfId) } : null
      },
      skipSerials: false,
      districtName: districtName.trim()
    });
  };

  // ---------- styles ----------
  const S = {
    card: { background: 'white', border: '1px solid #e9defa', borderRadius: '10px', padding: '18px', marginBottom: '14px' },
    pickCard: (active) => ({
      flex: '1 1 160px', padding: '16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
      border: active ? `2px solid ${BRAND.violet}` : '1px solid #e0e0e0',
      background: active ? '#f6effe' : 'white', boxShadow: active ? '0 4px 12px rgba(117,25,249,0.25)' : 'none'
    }),
    input: { padding: '8px 10px', border: '1px solid #d1b8f0', borderRadius: '6px', fontSize: '0.9rem', width: '100%' },
    smallInput: { padding: '8px 10px', border: '1px solid #d1b8f0', borderRadius: '6px', fontSize: '0.9rem', width: '90px' },
    btn: { padding: '10px 22px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, background: `linear-gradient(135deg, ${BRAND.violet}, ${BRAND.purple})`, color: 'white' },
    btnGhost: { padding: '10px 22px', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, background: 'white', color: '#444' },
    addBtn: { padding: '6px 14px', border: `1px dashed ${BRAND.violet}`, borderRadius: '6px', cursor: 'pointer', background: '#faf8fd', color: BRAND.purple, fontWeight: 600, fontSize: '0.85rem' },
    del: { border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 700 },
    th: { textAlign: 'left', padding: '6px 8px', fontSize: '0.8rem', color: BRAND.purple },
    label: { fontSize: '0.8rem', fontWeight: 700, color: BRAND.purple, display: 'block', marginBottom: '4px' }
  };

  const stepDots = (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
      {STEPS.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
            background: i === step ? `linear-gradient(135deg, ${BRAND.violet}, ${BRAND.purple})` : i < step ? '#d1fae5' : '#eee',
            color: i === step ? 'white' : i < step ? '#065f46' : '#888'
          }}>
            {i < step ? '✓ ' : ''}{label}
          </div>
          {i < STEPS.length - 1 && <span style={{ color: '#ccc' }}>›</span>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="page-wizard">
      <h2>🧙 Start From Scratch</h2>
      <p className="page-description">Answer the discovery questions and FACE builds the project - no spreadsheet needed</p>

      {stepDots}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', marginBottom: '12px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* ============ STEP 0: BASICS ============ */}
      {step === 0 && (
        <div>
          <div style={S.card}>
            <span style={S.label}>What vertical is this customer?</span>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {Object.entries(VERTICALS).map(([key, v]) => (
                <div key={key} style={S.pickCard(vertical === key)} onClick={() => pickVertical(key)}>
                  <div style={{ fontSize: '1.8rem' }}>{v.icon}</div>
                  <div style={{ fontWeight: 700 }}>{key}</div>
                  <div style={{ fontSize: '0.75rem', color: '#777' }}>{v.services.length} VLANs pre-seeded</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <span style={S.label}>Project / customer name</span>
            <input style={S.input} placeholder="e.g. Franklin County Schools" value={districtName} onChange={e => setDistrictName(e.target.value)} />
          </div>

          <div style={S.card}>
            <span style={S.label}>Fabric architecture</span>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {ARCHITECTURES.map(a => (
                <div key={a.key} style={S.pickCard(architecture === a.key)} onClick={() => setArchitecture(a.key)}>
                  <div style={{ fontSize: '1.6rem' }}>{a.icon}</div>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div style={{ fontSize: '0.75rem', color: '#777' }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...S.card, background: '#faf8fd' }}>
            <span style={{ fontSize: '0.82rem', color: '#666' }}>
              ℹ️ The wizard builds <strong>site-wide VLAN</strong> designs (each site shares one VLAN set — the common case).
              Routed-closet designs (per-closet subnets, York-style) come in via the Excel upload path.
            </span>
          </div>
        </div>
      )}

      {/* ============ STEP 1: SITES ============ */}
      {step === 1 && (
        <div style={S.card}>
          <span style={S.label}>Your {noun.toLowerCase()}s — number drives I-SIDs and subnets, code drives switch names</span>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>Site #（1-99）</th><th style={S.th}>Code (e.g. LHS)</th><th style={S.th}>{noun} name</th><th style={S.th}></th>
            </tr></thead>
            <tbody>
              {sites.map((s, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '4px' }}><input style={S.smallInput} type="number" value={s.site} onChange={e => { const c = [...sites]; c[idx] = { ...c[idx], site: parseInt(e.target.value) || '' }; setSites(c); }} /></td>
                  <td style={{ padding: '4px' }}><input style={{ ...S.input, width: '140px', textTransform: 'uppercase' }} value={s.code} onChange={e => { const c = [...sites]; c[idx] = { ...c[idx], code: e.target.value.toUpperCase() }; setSites(c); }} /></td>
                  <td style={{ padding: '4px' }}><input style={S.input} placeholder={`e.g. Lincoln High ${noun}`} value={s.location} onChange={e => { const c = [...sites]; c[idx] = { ...c[idx], location: e.target.value }; setSites(c); }} /></td>
                  <td style={{ padding: '4px' }}><button style={S.del} onClick={() => setSites(sites.filter((_, i) => i !== idx))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '10px' }}>
            <button style={S.addBtn} onClick={() => setSites([...sites, { site: (Math.max(0, ...sites.map(s => s.site || 0)) + 10) || 10, code: '', location: '' }])}>
              + Add {noun}
            </button>
          </div>
        </div>
      )}

      {/* ============ STEP 2: SERVICES ============ */}
      {step === 2 && (
        <div>
          <div style={S.card}>
            <span style={S.label}>VLAN services (pre-seeded for {vertical} — adjust freely)</span>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={S.th}>VLAN ID</th><th style={S.th}>Name</th><th style={S.th}>Device type (drives auto-sense)</th><th style={S.th}></th>
              </tr></thead>
              <tbody>
                {services.map((svc, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '4px' }}><input style={S.smallInput} type="number" value={svc.vlanId} onChange={e => { const c = [...services]; c[idx] = { ...c[idx], vlanId: e.target.value }; setServices(c); }} /></td>
                    <td style={{ padding: '4px' }}><input style={S.input} value={svc.name} onChange={e => { const c = [...services]; c[idx] = { ...c[idx], name: e.target.value }; setServices(c); }} />
                      {/mgmt/i.test(svc.name) && <span style={{ fontSize: '0.7rem', color: BRAND.success, fontWeight: 700 }}> ← management VLAN</span>}
                    </td>
                    <td style={{ padding: '4px' }}>
                      <select style={S.input} value={svc.deviceType} onChange={e => { const c = [...services]; c[idx] = { ...c[idx], deviceType: e.target.value }; setServices(c); }}>
                        <option value="">— none —</option>
                        <option value="data">data (workstations)</option>
                        <option value="voice">voice (phones)</option>
                        <option value="ap">ap (wireless)</option>
                        <option value="camera">camera (security)</option>
                      </select>
                    </td>
                    <td style={{ padding: '4px' }}><button style={S.del} onClick={() => setServices(services.filter((_, i) => i !== idx))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '10px' }}>
              <button style={S.addBtn} onClick={() => setServices([...services, { vlanId: '', name: '', deviceType: '' }])}>+ Add VLAN</button>
            </div>
          </div>

          <div style={S.card}>
            <span style={S.label}>Subnet plan — tokens: {'{site}'}, {'{site+100}'}, {'{vlan}'}</span>
            <input style={S.input} value={subnetTemplate} onChange={e => setSubnetTemplate(e.target.value)} />
            {sites[0] && services[0] && (
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '8px' }}>
                Preview for {sites[0].code || 'first site'} (site {sites[0].site}):&nbsp;
                {services.slice(0, 3).map(s => subnetFor(subnetTemplate, parseInt(sites[0].site), parseInt(s.vlanId) || 0)).join(' · ')}
                &nbsp;— gateways are .1, I-SIDs build as 12 + site + VLAN (e.g. {isidFor(parseInt(sites[0].site) || 10, parseInt(services[0].vlanId) || 8)})
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ STEP 3: CLOSETS ============ */}
      {step === 3 && (
        <div>
          {sites.map(s => (
            <div key={s.code} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={S.label}>📍 {s.code} — {s.location || noun} (closet MDF's first switch becomes the L3 core)</span>
                {s.code === sites[0].code && sites.length > 1 && (
                  <button style={S.addBtn} onClick={() => {
                    const first = closetsBySite[sites[0].code] || [];
                    const out = { ...closetsBySite };
                    sites.forEach(x => { out[x.code] = first.map(c => ({ ...c })); });
                    setClosetsBySite(out);
                  }}>Copy this layout to all {noun.toLowerCase()}s</button>
                )}
              </div>
              {(closetsBySite[s.code] || []).map((c, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                  <input style={{ ...S.input, width: '180px' }} placeholder="Closet (MDF1, IDF1...)" value={c.name}
                    onChange={e => { const out = { ...closetsBySite }; out[s.code] = out[s.code].map((x, i) => i === idx ? { ...x, name: e.target.value.toUpperCase() } : x); setClosetsBySite(out); }} />
                  <span style={{ fontSize: '0.8rem', color: '#666' }}>switches:</span>
                  <input style={S.smallInput} type="number" min="1" value={c.count}
                    onChange={e => { const out = { ...closetsBySite }; out[s.code] = out[s.code].map((x, i) => i === idx ? { ...x, count: parseInt(e.target.value) || '' } : x); setClosetsBySite(out); }} />
                  <span style={{ fontSize: '0.75rem', color: '#999' }}>
                    → {c.name && c.count ? Array.from({ length: Math.min(c.count, 3) }, (_, i) => `${s.code}-${c.name}-${i + 1}`).join(', ') + (c.count > 3 ? '…' : '') : ''}
                  </span>
                  <button style={S.del} onClick={() => { const out = { ...closetsBySite }; out[s.code] = out[s.code].filter((_, i) => i !== idx); setClosetsBySite(out); }}>✕</button>
                </div>
              ))}
              <div style={{ marginTop: '8px' }}>
                <button style={S.addBtn} onClick={() => { const out = { ...closetsBySite }; out[s.code] = [...(out[s.code] || []), { name: `IDF${(out[s.code] || []).length}`, count: 1 }]; setClosetsBySite(out); }}>+ Add closet</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============ STEP 4: SEGMENTED VRF ============ */}
      {step === 4 && (
        <div>
          <div style={S.card}>
            <label style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={segVrf.enabled} onChange={e => setSegVrf({ ...segVrf, enabled: e.target.checked })} style={{ width: '18px', height: '18px' }} />
              <span style={{ fontWeight: 700, color: BRAND.purple }}>Set up Segmented VRF (Fabric Engine 9.4+)</span>
            </label>
            <div style={{ fontSize: '0.82rem', color: '#666', marginTop: '6px' }}>
              The fabric stays the default gateway for every subnet, but east-west routing is denied unless the firewall allows it.
              Requires Premier license; not supported on 4220 / 5320-16P/24P / 7830 (9.4).
            </div>
          </div>

          {segVrf.enabled && (
            <>
              <div style={S.card}>
                <span style={S.label}>Firewall link (the Unrestricted path — L3 core ↔ firewall)</span>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div><span style={S.label}>FW link VLAN</span><input style={S.smallInput} type="number" value={segVrf.fwVlanId} onChange={e => setSegVrf({ ...segVrf, fwVlanId: e.target.value })} /></div>
                  <div><span style={S.label}>Link subnet (CIDR)</span><input style={{ ...S.input, width: '180px' }} value={segVrf.fwSubnet} onChange={e => setSegVrf({ ...segVrf, fwSubnet: e.target.value })} /></div>
                  <div><span style={S.label}>Switch-side IP</span><input style={{ ...S.input, width: '150px' }} value={segVrf.switchIp} onChange={e => setSegVrf({ ...segVrf, switchIp: e.target.value })} /></div>
                  <div><span style={S.label}>Firewall IP (next hop)</span><input style={{ ...S.input, width: '150px' }} value={segVrf.fwIp} onChange={e => setSegVrf({ ...segVrf, fwIp: e.target.value })} /></div>
                </div>
              </div>

              <div style={S.card}>
                <span style={S.label}>Classify each VLAN (defaults suggested for {vertical})</span>
                {services.map(svc => {
                  const cls = segVrf.classes[svc.vlanId] || 'trusted';
                  return (
                    <div key={svc.vlanId} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3edfb' }}>
                      <span style={{ width: '160px', fontWeight: 600 }}>VLAN {svc.vlanId} — {svc.name}</span>
                      {['trusted', 'untrusted'].map(opt => (
                        <label key={opt} style={{
                          padding: '4px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                          background: cls === opt ? (opt === 'trusted' ? '#d1fae5' : '#ffedd5') : '#f3f4f6',
                          color: cls === opt ? (opt === 'trusted' ? '#065f46' : '#9a3412') : '#999',
                          border: cls === opt ? `1px solid ${opt === 'trusted' ? BRAND.success : BRAND.warning}` : '1px solid #e5e7eb'
                        }}>
                          <input type="radio" name={`cls-${svc.vlanId}`} style={{ display: 'none' }}
                            checked={cls === opt} onChange={() => setSegVrf({ ...segVrf, classes: { ...segVrf.classes, [svc.vlanId]: opt } })} />
                          {opt === 'trusted' ? '🟢 Trusted' : '🟠 Untrusted'}
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Live traffic-flow preview */}
              <div style={S.card}>
                <span style={S.label}>Traffic flow preview</span>
                <SegVrfPreview services={services} classes={segVrf.classes} fwVlan={segVrf.fwVlanId} />
              </div>
            </>
          )}
        </div>
      )}

      {/* ============ STEP 5: CREATE ============ */}
      {step === 5 && (
        <div style={S.card}>
          <h3 style={{ color: BRAND.purple, marginTop: 0 }}>Ready to create: {districtName}</h3>
          <ul style={{ lineHeight: 1.9 }}>
            <li><strong>{vertical}</strong> · {ARCHITECTURES.find(a => a.key === architecture).title}</li>
            <li><strong>{sites.length}</strong> {noun.toLowerCase()}{sites.length === 1 ? '' : 's'}: {sites.map(s => s.code).join(', ')}</li>
            <li><strong>{services.length}</strong> VLAN services per site · subnets {subnetTemplate}</li>
            <li><strong>{sites.reduce((n, s) => n + (closetsBySite[s.code] || []).reduce((m, c) => m + (parseInt(c.count) || 0), 0), 0)}</strong> switches across {sites.reduce((n, s) => n + (closetsBySite[s.code] || []).length, 0)} closets</li>
            <li>Segmented VRF: <strong>{segVrf.enabled ? `ON — FW via VLAN ${segVrf.fwVlanId} at ${segVrf.fwIp}` : 'off'}</strong></li>
          </ul>
          <div style={{ fontSize: '0.82rem', color: '#666' }}>
            You land in the normal workflow next — Configure serials, fine-tune anything in Review, then export configs.
            💾 Save Project in the header keeps it all in a local file.
          </div>
        </div>
      )}

      {/* ============ NAV ============ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '18px' }}>
        <button style={S.btnGhost} onClick={() => step === 0 ? onCancel() : (setError(''), setStep(step - 1))}>
          ← {step === 0 ? 'Back to Upload' : 'Back'}
        </button>
        {step < STEPS.length - 1 ? (
          <button style={S.btn} onClick={next}>Next →</button>
        ) : (
          <button style={{ ...S.btn, background: `linear-gradient(135deg, ${BRAND.success}, #00926b)` }} onClick={createProject}>
            ✨ Create Project
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Segmented VRF live preview (SVG) ----------
function SegVrfPreview({ services, classes, fwVlan }) {
  const trusted = services.filter(s => (classes[s.vlanId] || 'trusted') === 'trusted');
  const untrusted = services.filter(s => classes[s.vlanId] === 'untrusted');
  const W = 860;
  const chipH = 30, gap = 8;
  const colH = Math.max(trusted.length, untrusted.length) * (chipH + gap);
  const H = Math.max(300, 150 + colH);
  const coreY = H / 2;

  const chip = (svc, i, cls) => {
    const y = 120 + i * (chipH + gap);
    const x = cls === 'trusted' ? 20 : 20;
    const fill = cls === 'trusted' ? '#d1fae5' : '#ffedd5';
    const stroke = cls === 'trusted' ? '#00CC99' : '#FF9900';
    const txt = cls === 'trusted' ? '#065f46' : '#9a3412';
    const colX = cls === 'trusted' ? 20 : 250;
    return (
      <g key={`${cls}-${svc.vlanId}`}>
        <rect x={colX} y={y} width="190" height={chipH} rx="8" fill={fill} stroke={stroke} />
        <text x={colX + 95} y={y + 19} textAnchor="middle" fontSize="11" fontWeight="700" fill={txt}>
          VLAN {svc.vlanId} {svc.name}
        </text>
        {/* line to core */}
        <line x1={colX + 190} y1={y + chipH / 2} x2={510} y2={coreY} stroke={stroke} strokeWidth="1.5" opacity="0.5" />
      </g>
    );
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: '#20004C', borderRadius: '10px', fontFamily: "'DM Sans', sans-serif" }}>
      <text x={115} y={70} textAnchor="middle" fontSize="12" fontWeight="700" fill="#6ee7b7">🟢 TRUSTED</text>
      <text x={115} y={88} textAnchor="middle" fontSize="9" fill="#a7f3d0">talk to each other + to FW</text>
      <text x={345} y={70} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fdba74">🟠 UNTRUSTED</text>
      <text x={345} y={88} textAnchor="middle" fontSize="9" fill="#fed7aa">isolated — can ONLY reach the FW</text>

      {trusted.map((s, i) => chip(s, i, 'trusted'))}
      {untrusted.map((s, i) => chip(s, i, 'untrusted'))}

      {/* Core */}
      <rect x={510} y={coreY - 40} width={140} height={80} rx="12" fill="#00CC99" stroke="#fff" strokeWidth="1.5" />
      <text x={580} y={coreY - 10} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">L3 CORE</text>
      <text x={580} y={coreY + 8} textAnchor="middle" fontSize="9.5" fill="#eafff7">Segmented VRF</text>
      <text x={580} y={coreY + 24} textAnchor="middle" fontSize="9.5" fill="#eafff7">default GW for all</text>

      {/* Unrestricted link to FW */}
      <line x1={650} y1={coreY} x2={740} y2={coreY} stroke="#7D76F2" strokeWidth="4" strokeDasharray="8 5">
        <animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.2s" repeatCount="indefinite" />
      </line>
      <text x={695} y={coreY - 12} textAnchor="middle" fontSize="9" fontWeight="700" fill="#c4b5fd">UNRESTRICTED</text>
      <text x={695} y={coreY + 20} textAnchor="middle" fontSize="8.5" fill="#c4b5fd">VLAN {fwVlan}</text>

      {/* Firewall */}
      <rect x={740} y={coreY - 35} width={100} height={70} rx="12" fill="#FF3333" stroke="#fff" strokeWidth="1.5" />
      <text x={790} y={coreY - 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">🔥 FW</text>
      <text x={790} y={coreY + 14} textAnchor="middle" fontSize="8.5" fill="#ffe4e6">decides east-west</text>

      {/* Blocked lateral note */}
      <text x={230} y={H - 18} fontSize="10" fill="#fca5a5" fontWeight="700">✕ Untrusted ↔ Untrusted and Untrusted ↔ Trusted are BLOCKED in the fabric — only the FW can allow them</text>
    </svg>
  );
}

export default Wizard;
