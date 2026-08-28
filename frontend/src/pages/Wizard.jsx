// ============================================
// Intake Wizard (Tier 3.1)
// Version: V2608267
// Purpose: Build a FACE project from discovery questions - no Excel needed.
// Vertical -> sites -> services -> closets -> optional Segmented VRF
// (FE 9.4) -> generates switches in the exact parser output shape.
// ============================================

import React, { useState } from 'react';
import SegmentedVrfPanel, { defaultSegVrf, validateSegVrf } from '../components/SegmentedVrfPanel.jsx';

const BRAND = {
  purple: '#5B059C', indigo: '#20004C', violet: '#7519F9',
  steel: '#7D76F2', success: '#00CC99', warning: '#FF9900', error: '#FF3333'
};

// Vertical presets: terminology + seeded VLAN service sets
const VERTICALS = {
  'K-12': {
    icon: '/icons/k12.svg', siteNoun: 'School',
    services: [
      { vlanId: 8, name: 'Netmgmt', deviceType: 'ap' },
      { vlanId: 16, name: 'VoIP', deviceType: 'voice' },
      { vlanId: 24, name: 'Data', deviceType: 'data' },
      { vlanId: 32, name: 'Cameras', deviceType: 'camera' },
      { vlanId: 40, name: 'Guest', deviceType: '' }
    ]
  },
  'Higher-Ed': {
    icon: '/icons/higher-ed.svg', siteNoun: 'Campus Building',
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
    icon: '/icons/sl-gov.svg', siteNoun: 'Office',
    services: [
      { vlanId: 8, name: 'Netmgmt', deviceType: 'ap' },
      { vlanId: 16, name: 'VoIP', deviceType: 'voice' },
      { vlanId: 24, name: 'Staff', deviceType: 'data' },
      { vlanId: 32, name: 'Security', deviceType: 'camera' },
      { vlanId: 40, name: 'PublicWiFi', deviceType: '' }
    ]
  },
  'Enterprise': {
    icon: '/icons/enterprise.svg', siteNoun: 'Branch',
    services: [
      { vlanId: 8, name: 'Netmgmt', deviceType: 'ap' },
      { vlanId: 16, name: 'VoIP', deviceType: 'voice' },
      { vlanId: 24, name: 'Corp', deviceType: 'data' },
      { vlanId: 32, name: 'IoT', deviceType: '' },
      { vlanId: 40, name: 'Guest', deviceType: '' }
    ]
  }
};

// Official Extreme Networks icons (Icon-Library-2025)
const ARCHITECTURES = [
  { key: 'single', icon: '/icons/fabric.svg', title: 'One Fabric', desc: 'Dark fiber between sites - one fabric across the district. I-SIDs unique everywhere.' },
  { key: 'siloed', icon: '/icons/cloud-local.svg', title: 'Siloed Fabrics', desc: 'ISP between sites - each site is its own fabric island.' },
  { key: 'extend', icon: '/icons/cloud-mesh.svg', title: 'Fabric Extend', desc: 'Extend the fabric across an ISP between sites.' },
  { key: 'hybrid', icon: '/icons/cloud.svg', title: 'Hybrid', desc: 'Mix of both - some sites on dark fiber (one fabric), others reached across ISP links (Fabric Extend).' }
];

const pad = (n, w) => String(n).padStart(w, '0');
const isidFor = (site, vlan) => parseInt(`2${pad(site, 2)}${pad(vlan, 4)}`);
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
  const [subnetCustom, setSubnetCustom] = useState(false);
  const [siteCount, setSiteCount] = useState('');
  const [vlanCount, setVlanCount] = useState('');
  const [env, setEnv] = useState({ extremeWireless: true, cameraFaCapable: true, enableSpbMulticast: true });
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
    setServices(VERTICALS[v].services.map(s => ({ ...s, ssid: !!s.ssid })));
    setSegVrf(prev => ({ ...defaultSegVrf(VERTICALS[v].services), enabled: prev.enabled }));
    // K-12 districts always have a Central Office - seed it as site #1
    if (v === 'K-12') {
      setSites([{ site: 1, code: 'CO', location: 'Central Office' }]);
    }
  };

  // Resize the sites list to a requested count (preserves what's entered)
  const applySiteCount = () => {
    const n = parseInt(siteCount);
    if (isNaN(n) || n < 1 || n > 98) { setError('Enter a count between 1 and 98'); return; }
    setError('');
    setSites(prev => {
      const keep = prev.slice(0, n + (vertical === 'K-12' ? 1 : 0));
      const out = [...keep];
      let nextNum = Math.max(0, ...out.map(x => x.site || 0));
      const target = n + (vertical === 'K-12' && out.some(x => x.code === 'CO') ? 1 : 0);
      while (out.length < target) {
        nextNum = Math.floor(nextNum / 10) * 10 + 10; // next clean multiple of 10
        out.push({ site: nextNum, code: '', location: '' });
      }
      return out;
    });
  };

  // Resize the VLAN services list to a requested count
  const applyVlanCount = () => {
    const n = parseInt(vlanCount);
    if (isNaN(n) || n < 1 || n > 50) { setError('Enter a VLAN count between 1 and 50'); return; }
    setError('');
    setServices(prev => {
      const out = prev.slice(0, n);
      while (out.length < n) out.push({ vlanId: '', name: '', deviceType: '', ssid: false });
      return out;
    });
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
        if (!/^[A-Za-z]{1,4}$/.test(s.code.trim())) return setError(`Code "${s.code}" must be LETTERS only, max 4 characters`), false;
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
    if (step === 4) {
      const segErr = validateSegVrf(segVrf, services);
      if (segErr) return setError(segErr), false;
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
        closet: '',
        ssid: !!svc.ssid
      }));
      vlanCount += vlans.length;

      const mgmtVlanObj = vlans.find(v => /mgmt/i.test(v.vlanName)) || vlans[0];
      const gw = mgmtVlanObj.subnet.split('/')[0].split('.').slice(0, 3).join('.') + '.1';

      // auto-sense: first VLAN per device type (mirrors the parser)
      const typeMap = {};
      vlans.forEach(v => { if (v.deviceType && !typeMap[v.deviceType]) typeMap[v.deviceType] = v; });
      const autoSense = [];
      if (typeMap.data) autoSense.push({ type: 'data', command: `auto-sense data i-sid ${typeMap.data.isid}` });
      // c-vid = the VOICE VLAN ID (FE 9.4 User Guide p.83-85: LLDP-MED
      // advertises the voice VLAN; the phone tags voice traffic with it)
      if (typeMap.voice) autoSense.push({ type: 'voice', command: `auto-sense voice i-sid ${typeMap.voice.isid} c-vid ${typeMap.voice.vlanId}` });
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
        extremeWireless: env.extremeWireless,
        cameraFaCapable: env.cameraFaCapable,
        enableSpbMulticast: env.enableSpbMulticast,
        segmentedVrf: segVrf.enabled ? { ...segVrf, fwVlanId: parseInt(segVrf.fwVlanId), vrfId: parseInt(segVrf.vrfId) } : null
      },
      skipSerials: false,
      districtName: districtName.trim()
    });
  };

  // ---------- styles ----------
  const S = {
    card: { background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px', marginBottom: '14px' },
    pickCard: (active) => ({
      flex: '1 1 160px', padding: '16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
      border: active ? `2px solid ${BRAND.violet}` : '1px solid var(--border-color)',
      background: active ? 'rgba(117,25,249,0.15)' : 'var(--card-bg)', color: 'var(--text-primary)', boxShadow: active ? '0 4px 12px rgba(117,25,249,0.25)' : 'none'
    }),
    input: { padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', width: '100%', background: 'var(--card-bg)', color: 'var(--text-primary)' },
    smallInput: { padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', width: '90px', background: 'var(--card-bg)', color: 'var(--text-primary)' },
    btn: { padding: '10px 22px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, background: `linear-gradient(135deg, ${BRAND.violet}, ${BRAND.purple})`, color: 'white' },
    btnGhost: { padding: '10px 22px', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, background: 'var(--card-bg)', color: 'var(--text-primary)' },
    addBtn: { padding: '6px 14px', border: `1px dashed ${BRAND.violet}`, borderRadius: '6px', cursor: 'pointer', background: 'var(--card-bg)', color: 'var(--extreme-violet)', fontWeight: 600, fontSize: '0.85rem' },
    del: { border: 'none', background: '#fee2e2', color: '#b91c1c', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontWeight: 700 },
    th: { textAlign: 'left', padding: '6px 8px', fontSize: '0.8rem', color: 'var(--extreme-violet)' },
    label: { fontSize: '0.8rem', fontWeight: 700, color: 'var(--extreme-violet)', display: 'block', marginBottom: '4px' }
  };

  const stepDots = (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
      {STEPS.map((label, i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            padding: '4px 12px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
            background: i === step ? `linear-gradient(135deg, ${BRAND.violet}, ${BRAND.purple})` : i < step ? '#d1fae5' : 'var(--canvas-bg)',
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '54px', height: '54px', borderRadius: '50%', background: '#f1f5f9', pointerEvents: 'none' }}><img src={v.icon} alt={key} style={{ width: '34px', height: '34px' }} /></span>
                  <div style={{ fontWeight: 700 }}>{key}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{v.services.length} VLANs pre-seeded</div>
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '54px', height: '54px', borderRadius: '50%', background: '#f1f5f9', pointerEvents: 'none' }}><img src={a.icon} alt={a.title} style={{ width: '34px', height: '34px' }} /></span>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{a.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <span style={S.label}>Environment</span>
            <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
              <div>
                <span style={{ ...S.label, color: 'var(--text-primary)' }}>Wireless vendor</span>
                {[['Extreme (Fabric Attach)', true], ['Other', false]].map(([lbl, val]) => (
                  <label key={lbl} style={{ marginRight: '10px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="radio" name="wenv" checked={env.extremeWireless === val} onChange={() => setEnv({ ...env, extremeWireless: val })} /> {lbl}
                  </label>
                ))}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Extreme wireless → SSID VLANs ride Fabric Attach, skipped on L2 switches</div>
              </div>
              <div>
                <span style={{ ...S.label, color: 'var(--text-primary)' }}>Camera vendor</span>
                {[['Verkada / Axis (≥12.0) / i-PRO', true], ['Other / none', false]].map(([lbl, val]) => (
                  <label key={lbl} style={{ marginRight: '10px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="radio" name="cenv" checked={env.cameraFaCapable === val} onChange={() => setEnv({ ...env, cameraFaCapable: val })} /> {lbl}
                  </label>
                ))}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>FA-capable cameras → auto-sense fa camera line goes in; otherwise omitted</div>
              </div>
              <div>
                <span style={{ ...S.label, color: 'var(--text-primary)' }}>IP Multicast (L2 + L3 Fabric)</span>
                {[['Enabled', true], ['Disabled', false]].map(([lbl, val]) => (
                  <label key={lbl} style={{ marginRight: '10px', fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="radio" name="menv" checked={env.enableSpbMulticast === val} onChange={() => setEnv({ ...env, enableSpbMulticast: val })} /> {lbl}
                  </label>
                ))}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>L3: spb-multicast on SVIs · L2: IGMP snooping per C-VLAN + global SPBM enable</div>
              </div>
            </div>
          </div>

          <div style={{ ...S.card }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              ℹ️ The wizard builds <strong>site-wide VLAN</strong> designs (each site shares one VLAN set — the common case).
              Routed-closet designs (per-closet subnets, York-style) come in via the Excel upload path.
            </span>
          </div>
        </div>
      )}

      {/* ============ STEP 1: SITES ============ */}
      {step === 1 && (
        <div style={S.card}>
          <span style={S.label}>Your {noun.toLowerCase()}s — number drives I-SIDs and subnets, code drives switch names (letters only, max 4)</span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', padding: '10px', background: 'var(--canvas-bg)', borderRadius: '8px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              How many {noun.toLowerCase()}s do you have{vertical === 'K-12' ? ' (besides the Central Office)' : ''}?
            </span>
            <input style={{ ...S.smallInput, width: '70px' }} type="number" min="1" max="98" value={siteCount} onChange={e => setSiteCount(e.target.value)} />
            <button style={S.addBtn} onClick={applySiteCount}>Create rows</button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>Site #（1-99）</th><th style={S.th}>Code (e.g. LHS)</th><th style={S.th}>{noun} name</th><th style={S.th}></th>
            </tr></thead>
            <tbody>
              {sites.map((s, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '4px' }}><input style={S.smallInput} type="number" value={s.site} onChange={e => { const c = [...sites]; c[idx] = { ...c[idx], site: parseInt(e.target.value) || '' }; setSites(c); }} /></td>
                  <td style={{ padding: '4px' }}><input style={{ ...S.input, width: '140px', textTransform: 'uppercase' }} maxLength={4} value={s.code} onChange={e => { const c = [...sites]; c[idx] = { ...c[idx], code: e.target.value.replace(/[^A-Za-z]/g, '').substring(0, 4).toUpperCase() }; setSites(c); }} /></td>
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
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', padding: '10px', background: 'var(--canvas-bg)', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>How many VLANs per {noun.toLowerCase()}?</span>
              <input style={{ ...S.smallInput, width: '70px' }} type="number" min="1" max="50" value={vlanCount} onChange={e => setVlanCount(e.target.value)} />
              <button style={S.addBtn} onClick={applyVlanCount}>Create rows</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={S.th}>VLAN ID</th><th style={S.th}>Name</th><th style={S.th}>Device type (drives auto-sense)</th>{env.extremeWireless && <th style={S.th} title="Delivered by Fabric Attach - not configured on L2 switches">SSID VLAN?</th>}<th style={S.th}></th>
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
                    {env.extremeWireless && (
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <input type="checkbox" checked={!!svc.ssid} title="SSID VLAN - Fabric Attach adds it on L2 switches automatically"
                          onChange={e => { const c = [...services]; c[idx] = { ...c[idx], ssid: e.target.checked }; setServices(c); }} />
                      </td>
                    )}
                    <td style={{ padding: '4px' }}><button style={S.del} onClick={() => setServices(services.filter((_, i) => i !== idx))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {env.extremeWireless && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                📶 SSID VLANs are delivered by Fabric Attach on Extreme wireless — FACE will NOT configure them on L2 access switches (the APs signal them automatically). They stay on the L3 core for routing.
              </div>
            )}
            <div style={{ marginTop: '10px' }}>
              <button style={S.addBtn} onClick={() => setServices([...services, { vlanId: '', name: '', deviceType: '', ssid: false }])}>+ Add VLAN</button>
            </div>
          </div>

          <div style={S.card}>
            <span style={S.label}>Subnet plan — pick your addressing format</span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {['10.{site}.{vlan}.0/24', '172.{site}.{vlan}.0/24', '10.{vlan}.{site}.0/24'].map(preset => (
                <button key={preset} type="button"
                  onClick={() => { setSubnetTemplate(preset); setSubnetCustom(false); }}
                  style={{
                    padding: '8px 14px', borderRadius: '999px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                    border: (!subnetCustom && subnetTemplate === preset) ? '2px solid var(--extreme-violet)' : '1px solid var(--border-color)',
                    background: (!subnetCustom && subnetTemplate === preset) ? 'rgba(117,25,249,0.12)' : 'var(--card-bg)',
                    color: 'var(--text-primary)'
                  }}>
                  {preset.replace('{site}', 'SITE').replace('{vlan}', 'VLAN')}
                </button>
              ))}
              <button type="button"
                onClick={() => setSubnetCustom(true)}
                style={{
                  padding: '8px 14px', borderRadius: '999px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                  border: subnetCustom ? '2px solid var(--extreme-violet)' : '1px solid var(--border-color)',
                  background: subnetCustom ? 'rgba(117,25,249,0.12)' : 'var(--card-bg)',
                  color: 'var(--text-primary)'
                }}>
                ✏️ Custom…
              </button>
            </div>
            {subnetCustom && (
              <input style={S.input} value={subnetTemplate} onChange={e => setSubnetTemplate(e.target.value)} placeholder="e.g. 10.{site+100}.{vlan}.0/24 — tokens: {site} {site+100} {vlan}" />
            )}
            {sites[0] && services[0] && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                Preview for {sites[0].code || 'first site'} (site {sites[0].site}):&nbsp;
                {services.slice(0, 3).map(s => subnetFor(subnetTemplate, parseInt(sites[0].site), parseInt(s.vlanId) || 0)).join(' · ')}
                &nbsp;— gateways are .1, I-SIDs build as 2 + site + VLAN (e.g. {isidFor(parseInt(sites[0].site) || 10, parseInt(services[0].vlanId) || 8)})
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
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>switches:</span>
                  <input style={S.smallInput} type="number" min="1" value={c.count}
                    onChange={e => { const out = { ...closetsBySite }; out[s.code] = out[s.code].map((x, i) => i === idx ? { ...x, count: parseInt(e.target.value) || '' } : x); setClosetsBySite(out); }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
        <SegmentedVrfPanel services={services} value={segVrf} onChange={setSegVrf} />
      )}

      {/* ============ STEP 5: CREATE ============ */}
      {step === 5 && (
        <div style={S.card}>
          <h3 style={{ color: 'var(--extreme-violet)', marginTop: 0 }}>Ready to create: {districtName}</h3>
          <ul style={{ lineHeight: 1.9 }}>
            <li><strong>{vertical}</strong> · {ARCHITECTURES.find(a => a.key === architecture).title}</li>
            <li><strong>{sites.length}</strong> {noun.toLowerCase()}{sites.length === 1 ? '' : 's'}: {sites.map(s => s.code).join(', ')}</li>
            <li><strong>{services.length}</strong> VLAN services per site · subnets {subnetTemplate}</li>
            <li><strong>{sites.reduce((n, s) => n + (closetsBySite[s.code] || []).reduce((m, c) => m + (parseInt(c.count) || 0), 0), 0)}</strong> switches across {sites.reduce((n, s) => n + (closetsBySite[s.code] || []).length, 0)} closets</li>
            <li>Segmented VRF: <strong>{segVrf.enabled ? `ON — FW via VLAN ${segVrf.fwVlanId} at ${segVrf.fwIp}` : 'off'}</strong></li>
          </ul>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
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

export default Wizard;
