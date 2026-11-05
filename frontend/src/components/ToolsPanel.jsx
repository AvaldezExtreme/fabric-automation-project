// ============================================
// Tools - command builders
// Version: V2611054
// Purpose: paste-ready Fabric Engine 9.4 CLI for one-off / day-2 jobs.
//          Runs entirely in the browser: nothing is sent to the server or
//          saved, so strings and passwords never leave the user's PC.
// The command logic lives in utils/toolBuilders.js (pure, testable).
// ============================================

import React, { useState } from 'react';
import { buildSnmp, buildVlan, buildPorts, buildCorePair, buildVerify, faceIsid, CHECK_GROUPS } from '../utils/toolBuilders.js';

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '50px 16px', overflowY: 'auto' };
const panel = { background: 'var(--card-bg)', color: 'var(--text-primary)', borderRadius: '12px', width: '100%', maxWidth: '1000px', padding: '20px 24px', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', border: '1px solid var(--border-color)' };
const input = { padding: '7px 9px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--canvas-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box' };
const btn = { padding: '7px 14px', borderRadius: '6px', border: 'none', background: 'var(--extreme-violet)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' };
const ghost = { ...btn, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)' };
const labelS = { display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '3px' };
const fieldS = { marginBottom: '10px' };
const fieldset = { border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' };
const codeS = { background: '#0f172a', color: '#e2e8f0', borderRadius: '8px', padding: '12px 14px', fontFamily: 'Consolas, Menlo, monospace', fontSize: '0.8rem', whiteSpace: 'pre', overflowX: 'auto', margin: 0 };
const intro = { fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px', padding: '8px 10px', borderLeft: '3px solid var(--extreme-violet)', background: 'var(--canvas-bg)', borderRadius: '6px' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' };

const Field = ({ label, children }) => <div style={fieldS}><span style={labelS}>{label}</span>{children}</div>;

function CopyBlock({ title, text, note }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
  };
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <strong style={{ fontSize: '0.85rem' }}>{title}</strong>
        <button style={ghost} onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
      {note && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{note}</div>}
      <pre style={codeS}>{text}</pre>
    </div>
  );
}

function Result({ result }) {
  if (!result) return null;
  if (result.errors.length) {
    return (
      <div style={{ background: 'rgba(255,51,51,0.12)', border: '1px solid #ff3333', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.85rem' }}>
        {result.errors.map(e => <div key={e}>⚠️ {e}</div>)}
      </div>
    );
  }
  return result.blocks.map(b => <CopyBlock key={b.title} {...b} />);
}

// Hook: form state that clears the last result whenever an input changes
const useForm = (initial) => {
  const [f, setF] = useState(initial);
  const [result, setResult] = useState(null);
  const set = (patch) => { setF(prev => ({ ...prev, ...patch })); setResult(null); };
  return [f, set, result, setResult];
};

// ---------------------------------------------------------------- SNMP
function SnmpBuilder() {
  const [f, set, result, setResult] = useForm({
    v2c: false, v3: true, location: '', contact: '', trapIp: '',
    roCommunity: '', rwCommunity: '', v3User: '', authPw: '', privPw: '', v3Access: 'rw', v3Group: 'faceRO', inlineAnswers: false
  });
  const [showPw, setShowPw] = useState(false);
  const pw = showPw ? 'text' : 'password';
  return (
    <div>
      <div style={intro}>
        Site Engine normally reaches new switches with its default SNMPv3 profile and then pushes your SNMP settings itself —
        use this when you want to set SNMP on a switch by hand.
      </div>
      <div style={{ display: 'flex', gap: '18px', marginBottom: '12px' }}>
        <label style={{ fontSize: '0.9rem', cursor: 'pointer' }}><input type="checkbox" checked={f.v2c} onChange={e => set({ v2c: e.target.checked })} /> SNMP v2c</label>
        <label style={{ fontSize: '0.9rem', cursor: 'pointer' }}><input type="checkbox" checked={f.v3} onChange={e => set({ v3: e.target.checked })} /> SNMP v3</label>
      </div>
      <div style={grid}>
        <div style={fieldset}>
          <strong style={{ fontSize: '0.85rem' }}>Common</strong>
          <div style={{ marginTop: '8px' }} />
          <Field label="Site Engine IP (trap receiver) — blank = placeholder"><input style={input} placeholder="e.g. 10.1.1.50" value={f.trapIp} onChange={e => set({ trapIp: e.target.value })} /></Field>
          <Field label="Location (optional)"><input style={input} placeholder="e.g. Central Office MDF" value={f.location} onChange={e => set({ location: e.target.value })} /></Field>
          <Field label="Contact (optional)"><input style={input} placeholder="e.g. Network Team x1234" value={f.contact} onChange={e => set({ contact: e.target.value })} /></Field>
        </div>
        {f.v2c && (
          <div style={fieldset}>
            <strong style={{ fontSize: '0.85rem' }}>SNMP v2c</strong>
            <div style={{ marginTop: '8px' }} />
            <Field label="Read-only community"><input style={input} type={pw} value={f.roCommunity} onChange={e => set({ roCommunity: e.target.value })} /></Field>
            <Field label="Read-write community (optional)"><input style={input} type={pw} value={f.rwCommunity} onChange={e => set({ rwCommunity: e.target.value })} /></Field>
          </div>
        )}
        {f.v3 && (
          <div style={fieldset}>
            <strong style={{ fontSize: '0.85rem' }}>SNMP v3 (SHA + AES)</strong>
            <div style={{ marginTop: '8px' }} />
            <Field label="User name"><input style={input} placeholder="e.g. siteengine" value={f.v3User} onChange={e => set({ v3User: e.target.value })} /></Field>
            <Field label="Authentication password (8+)"><input style={input} type={pw} value={f.authPw} onChange={e => set({ authPw: e.target.value })} /></Field>
            <Field label="Privacy password (8+)"><input style={input} type={pw} value={f.privPw} onChange={e => set({ privPw: e.target.value })} /></Field>
            <Field label="Access">
              <select style={input} value={f.v3Access} onChange={e => set({ v3Access: e.target.value })}>
                <option value="rw">Full access (default "initial" group)</option>
                <option value="ro">Read-only (creates a group)</option>
              </select>
            </Field>
            {f.v3Access === 'ro' && <Field label="Read-only group name"><input style={input} value={f.v3Group} onChange={e => set({ v3Group: e.target.value })} /></Field>}
            <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.inlineAnswers} onChange={e => set({ inlineAnswers: e.target.checked })} /> Put the password answers in the output (one paste)
            </label>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '4px 0 14px' }}>
        <button style={btn} onClick={() => setResult(buildSnmp(f))}>Build commands</button>
        <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}><input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} /> Show strings/passwords</label>
      </div>
      <Result result={result} />
    </div>
  );
}

// ---------------------------------------------------------------- VLAN
function VlanBuilder({ project }) {
  const [f, set, result, setResult] = useForm({
    mode: 'add', site: project.sites[0]?.siteId || '', siteCode: project.sites[0]?.code || '',
    vlanId: '', vlanName: '', subnet: '', isid: '', dhcp1: project.dhcp1, dhcp2: project.dhcp2, multicast: project.multicast
  });
  const autoIsid = parseInt(f.site) && parseInt(f.vlanId) ? faceIsid(parseInt(f.site), parseInt(f.vlanId)) : '';
  const autoSubnet = parseInt(f.site) && parseInt(f.vlanId) ? `10.${parseInt(f.site)}.${parseInt(f.vlanId)}.0/24` : '';
  const pickSite = (id) => { const s = project.sites.find(x => String(x.siteId) === String(id)); set({ site: id, siteCode: s ? s.code : f.siteCode }); };
  return (
    <div>
      <div style={intro}>
        Add a new VLAN to a site that's already running — built exactly the way FACE builds VLANs on day 1 (same I-SID numbering, gateway, DHCP relay and multicast).
        Or remove one cleanly.
      </div>
      <div style={{ display: 'flex', gap: '18px', marginBottom: '12px' }}>
        {[['add', 'Add a VLAN'], ['remove', 'Remove a VLAN']].map(([k, l]) => (
          <label key={k} style={{ fontSize: '0.9rem', cursor: 'pointer' }}><input type="radio" name="vlanmode" checked={f.mode === k} onChange={() => set({ mode: k })} /> {l}</label>
        ))}
      </div>
      <div style={grid}>
        <div style={fieldset}>
          <strong style={{ fontSize: '0.85rem' }}>Site</strong>
          <div style={{ marginTop: '8px' }} />
          {project.sites.length > 0 ? (
            <Field label="Site (from the open project)">
              <select style={input} value={f.site} onChange={e => pickSite(e.target.value)}>
                {project.sites.map(s => <option key={s.siteId} value={s.siteId}>{s.code} · Site {s.siteId}{s.location ? ` · ${s.location}` : ''}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Site number (1-99)"><input style={input} value={f.site} onChange={e => set({ site: e.target.value })} /></Field>
          )}
          <Field label="Site code (letters, max 4)"><input style={input} value={f.siteCode} onChange={e => set({ siteCode: e.target.value })} /></Field>
        </div>
        <div style={fieldset}>
          <strong style={{ fontSize: '0.85rem' }}>VLAN</strong>
          <div style={{ marginTop: '8px' }} />
          <Field label="VLAN ID"><input style={input} placeholder="e.g. 56" value={f.vlanId} onChange={e => set({ vlanId: e.target.value })} /></Field>
          {f.mode === 'add' && <Field label="Name"><input style={input} placeholder="e.g. Printers" value={f.vlanName} onChange={e => set({ vlanName: e.target.value })} /></Field>}
          <Field label={`I-SID — blank = FACE numbering${autoIsid ? ` (${autoIsid})` : ''}`}><input style={input} placeholder={String(autoIsid || '')} value={f.isid} onChange={e => set({ isid: e.target.value })} /></Field>
        </div>
        {f.mode === 'add' && (
          <div style={fieldset}>
            <strong style={{ fontSize: '0.85rem' }}>Addressing</strong>
            <div style={{ marginTop: '8px' }} />
            <Field label="Subnet (gateway = .1)">
              <input style={input} placeholder={autoSubnet || 'e.g. 10.10.56.0/24'} value={f.subnet} onChange={e => set({ subnet: e.target.value })} />
              {autoSubnet && !f.subnet && <button style={{ ...ghost, marginTop: '4px', padding: '3px 8px', fontSize: '0.75rem' }} onClick={() => set({ subnet: autoSubnet })}>Use {autoSubnet}</button>}
            </Field>
            <Field label="DHCP server 1"><input style={input} value={f.dhcp1} onChange={e => set({ dhcp1: e.target.value })} /></Field>
            <Field label="DHCP server 2 (optional)"><input style={input} value={f.dhcp2} onChange={e => set({ dhcp2: e.target.value })} /></Field>
            <label style={{ fontSize: '0.8rem', cursor: 'pointer' }}><input type="checkbox" checked={f.multicast} onChange={e => set({ multicast: e.target.checked })} /> IP multicast (same as the project setting)</label>
          </div>
        )}
      </div>
      <button style={{ ...btn, margin: '4px 0 14px' }} onClick={() => setResult(buildVlan({ ...f, subnet: f.subnet || '' }))}>Build commands</button>
      <Result result={result} />
    </div>
  );
}

// ---------------------------------------------------------------- Ports
function PortsBuilder() {
  const [f, set, result, setResult] = useForm({ ports: '', mode: 'access', vlans: '', portName: '', poe: 'keep' });
  return (
    <div>
      <div style={intro}>
        Change a range of access ports — set them back to Auto-sense, pin them to a VLAN, make them tagged, or shut them down.
        Fabric uplinks don't need this: Auto-sense brings them up on its own.
      </div>
      <div style={grid}>
        <div style={fieldset}>
          <Field label="Ports"><input style={input} placeholder="e.g. 1/13-1/24 or 1/5,1/7" value={f.ports} onChange={e => set({ ports: e.target.value })} /></Field>
          <Field label="What should they do?">
            <select style={input} value={f.mode} onChange={e => set({ mode: e.target.value })}>
              <option value="autosense">Auto-sense (FACE default)</option>
              <option value="access">Static access — one untagged VLAN</option>
              <option value="trunk">Tagged — one or more VLANs</option>
              <option value="shutdown">Shut down</option>
            </select>
          </Field>
          {(f.mode === 'access' || f.mode === 'trunk') && (
            <Field label={f.mode === 'access' ? 'VLAN' : 'VLANs (comma separated)'}><input style={input} placeholder={f.mode === 'access' ? 'e.g. 32' : 'e.g. 8,24,40'} value={f.vlans} onChange={e => set({ vlans: e.target.value })} /></Field>
          )}
        </div>
        <div style={fieldset}>
          <Field label="Port name / description (optional)"><input style={input} placeholder="e.g. Cameras wing B" value={f.portName} onChange={e => set({ portName: e.target.value })} /></Field>
          <Field label="PoE">
            <select style={input} value={f.poe} onChange={e => set({ poe: e.target.value })}>
              <option value="keep">Leave as is</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </Field>
        </div>
      </div>
      <button style={{ ...btn, margin: '4px 0 14px' }} onClick={() => setResult(buildPorts(f))}>Build commands</button>
      <Result result={result} />
    </div>
  );
}

// ---------------------------------------------------------------- Core pair
function CorePairBuilder() {
  const [f, set, result, setResult] = useForm({
    aName: '', aSysId: '', aIp: '192.168.255.1', bName: '', bSysId: '', bIp: '192.168.255.2', prefix: '30',
    vistVlan: '4001', vistIsid: '', smlts: [{ mlt: '', ports: '', vlans: '', desc: '' }]
  });
  const setRow = (i, patch) => set({ smlts: f.smlts.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  return (
    <div>
      <div style={intro}>
        Pair two core switches as a vIST cluster, with optional SMLT links down to a dual-homed device (firewall pair, legacy switch, server).
        Get each switch's system ID with <code>show isis system-id</code>. The link between the two cores comes up through Auto-sense.
      </div>
      <div style={grid}>
        {[['a', 'Core A'], ['b', 'Core B']].map(([k, l]) => (
          <div key={k} style={fieldset}>
            <strong style={{ fontSize: '0.85rem' }}>{l}</strong>
            <div style={{ marginTop: '8px' }} />
            <Field label="Switch name"><input style={input} placeholder={k === 'a' ? 'e.g. CO-MDF1-1' : 'e.g. CO-MDF1-2'} value={f[`${k}Name`]} onChange={e => set({ [`${k}Name`]: e.target.value })} /></Field>
            <Field label="IS-IS system ID"><input style={input} placeholder="e.g. a051.c6eb.c865" value={f[`${k}SysId`]} onChange={e => set({ [`${k}SysId`]: e.target.value })} /></Field>
            <Field label="vIST IP"><input style={input} value={f[`${k}Ip`]} onChange={e => set({ [`${k}Ip`]: e.target.value })} /></Field>
          </div>
        ))}
        <div style={fieldset}>
          <strong style={{ fontSize: '0.85rem' }}>vIST</strong>
          <div style={{ marginTop: '8px' }} />
          <Field label="vIST VLAN"><input style={input} value={f.vistVlan} onChange={e => set({ vistVlan: e.target.value })} /></Field>
          <Field label="vIST I-SID (used nowhere else)"><input style={input} placeholder="e.g. 9004001" value={f.vistIsid} onChange={e => set({ vistIsid: e.target.value })} /></Field>
          <Field label="Prefix length"><input style={input} value={f.prefix} onChange={e => set({ prefix: e.target.value })} /></Field>
        </div>
      </div>
      <div style={fieldset}>
        <strong style={{ fontSize: '0.85rem' }}>SMLT links (optional) — same ports on both cores</strong>
        {f.smlts.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1.2fr 32px', gap: '8px', marginTop: '8px' }}>
            <input style={input} placeholder="MLT ID" value={r.mlt} onChange={e => setRow(i, { mlt: e.target.value })} />
            <input style={input} placeholder="Ports e.g. 1/47-1/48" value={r.ports} onChange={e => setRow(i, { ports: e.target.value })} />
            <input style={input} placeholder="VLANs e.g. 8,24" value={r.vlans} onChange={e => setRow(i, { vlans: e.target.value })} />
            <input style={input} placeholder="Description e.g. Firewall pair" value={r.desc} onChange={e => setRow(i, { desc: e.target.value })} />
            <button style={{ ...ghost, padding: '4px' }} title="Remove row" onClick={() => set({ smlts: f.smlts.filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
        <button style={{ ...ghost, marginTop: '8px' }} onClick={() => set({ smlts: [...f.smlts, { mlt: '', ports: '', vlans: '', desc: '' }] })}>+ Add SMLT</button>
      </div>
      <button style={{ ...btn, margin: '4px 0 14px' }} onClick={() => setResult(buildCorePair(f))}>Build commands</button>
      <Result result={result} />
    </div>
  );
}

// ---------------------------------------------------------------- Verify
function VerifyBuilder({ project }) {
  const [sel, setSel] = useState({ l3: true, l2: false, fe: false, multicast: project.multicast, wireless: project.wireless, voice: true, vist: false, snmp: false });
  const r = buildVerify(sel);
  return (
    <div>
      <div style={intro}>
        Pick what this switch is, then paste the list. These are read-only <code>show</code> commands — they change nothing.
        The right-hand column says what a healthy switch looks like.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginBottom: '12px' }}>
        {CHECK_GROUPS.map(([k, l]) => (
          <label key={k} style={{ fontSize: '0.85rem', cursor: 'pointer' }}><input type="checkbox" checked={!!sel[k]} onChange={e => setSel({ ...sel, [k]: e.target.checked })} /> {l}</label>
        ))}
      </div>
      <CopyBlock title={r.blocks[0].title} text={r.blocks[0].text} />
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead><tr>
          <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid var(--border-color)' }}>Command</th>
          <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid var(--border-color)' }}>What good looks like</th>
        </tr></thead>
        <tbody>
          {r.rows.map(x => (
            <tr key={x.cmd}>
              <td style={{ padding: '6px', borderBottom: '1px solid var(--border-color)', fontFamily: 'Consolas, Menlo, monospace', whiteSpace: 'nowrap' }}>{x.cmd}</td>
              <td style={{ padding: '6px', borderBottom: '1px solid var(--border-color)' }}>{x.good} <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>(CmdRef p.{x.page})</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- Panel
const TABS = [['snmp', 'SNMP'], ['vlan', 'Add / remove VLAN'], ['ports', 'Ports'], ['pair', 'Core pair (vIST/SMLT)'], ['verify', 'Verify a switch']];

// Pull defaults from the open project (if any) so builders start pre-filled
const projectDefaults = (data) => {
  const seen = new Map();
  ((data && data.switches) || []).forEach(sw => {
    if (!seen.has(sw.siteId)) seen.set(sw.siteId, { siteId: sw.siteId, code: String(sw.isidPrefix || sw.serviceApp || '').toUpperCase().substring(0, 4), location: sw.location || '' });
  });
  const s = (data && data.settings) || {};
  return {
    sites: [...seen.values()].sort((a, b) => a.siteId - b.siteId),
    dhcp1: s.dhcpServer1 || '', dhcp2: s.dhcpServer2 || '',
    multicast: s.enableSpbMulticast !== false, wireless: s.extremeWireless === true
  };
};

export function ToolsPanel({ onClose, data }) {
  const [tab, setTab] = useState('snmp');
  const project = projectDefaults(data);
  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h2 style={{ margin: 0 }}>🧰 Command builder</h2>
          <button style={ghost} onClick={onClose}>Close</button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Fabric Engine 9.4 commands, checked against the official docs. Everything stays in your browser — nothing is sent to FACE's server or saved.
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          {TABS.map(([k, l]) => <button key={k} style={tab === k ? btn : ghost} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'snmp' && <SnmpBuilder />}
        {tab === 'vlan' && <VlanBuilder project={project} />}
        {tab === 'ports' && <PortsBuilder />}
        {tab === 'pair' && <CorePairBuilder />}
        {tab === 'verify' && <VerifyBuilder project={project} />}
      </div>
    </div>
  );
}
