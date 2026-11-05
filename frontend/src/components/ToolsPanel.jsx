// ============================================
// Tools - command builders (starting with SNMP)
// Version: V2611053
// Purpose: build paste-ready Fabric Engine 9.4 CLI for one-off tasks.
//          Runs entirely in the browser: nothing is sent to the server or
//          saved, so SNMP strings and passwords never leave the user's PC.
// SNMP syntax: FE 9.4 Command Reference p.656-672, User Guide p.3481-3487.
// Site Engine normally onboards switches with its default SNMPv3 profile
// and pushes the final SNMP settings itself - this builder is for the
// cases where you want to set SNMP on a switch by hand.
// ============================================

import React, { useState } from 'react';

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '50px 16px', overflowY: 'auto' };
const panel = { background: 'var(--card-bg)', color: 'var(--text-primary)', borderRadius: '12px', width: '100%', maxWidth: '980px', padding: '20px 24px', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', border: '1px solid var(--border-color)' };
const input = { padding: '7px 9px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--canvas-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box' };
const btn = { padding: '7px 14px', borderRadius: '6px', border: 'none', background: 'var(--extreme-violet)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' };
const ghost = { ...btn, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)' };
const label = { display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '3px' };
const field = { marginBottom: '10px' };
const fieldset = { border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' };
const code = { background: '#0f172a', color: '#e2e8f0', borderRadius: '8px', padding: '12px 14px', fontFamily: 'Consolas, Menlo, monospace', fontSize: '0.8rem', whiteSpace: 'pre', overflowX: 'auto', margin: 0 };

// Values the CLI parses as a single WORD: quote anything with spaces
const word = (s) => (/\s/.test(s) ? `"${s.replace(/"/g, '')}"` : s);
const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,32}$/;

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
      <pre style={code}>{text}</pre>
    </div>
  );
}

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
  if (errors.length) return { errors };

  const host = ip || '<SITE-ENGINE-IP>';
  const hostNote = ip ? '' : '! >>> Replace <SITE-ENGINE-IP> with your Site Engine IP address <<<\n';
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
    v2.push('', '! SNMPv2c traps to Site Engine (CmdRef p.660)');
    v2.push(`${hostNote}snmp-server host ${host} v2c readview`.replace(/\n$/, ''));
    v2.push('', 'save config');
    blocks.push({ title: '1 · SNMPv2c — paste as one block', text: v2.join('\n') });
  }

  if (f.v3) {
    const n = blocks.length;
    const group = f.v3Access === 'ro' ? f.v3Group.trim() : 'initial';
    if (f.v3Access === 'ro') {
      const g = [...(f.v2c ? ['enable', 'configure terminal'] : base), ''];
      g.push(`! SNMPv3 read-only group (CmdRef p.657-658) - verify on your first switch`);
      g.push(`snmp-server group ${group} "" auth-priv read-view root`);
      g.push(`snmp-server group ${group} "" auth-priv notify-view root`);
      blocks.push({ title: `${n + 1} · SNMPv3 group — paste as one block`, text: g.join('\n') });
    }
    const userCmd = `snmp-server user ${f.v3User.trim()} group ${group} sha aes`;
    const promptLines = [f.authPw, f.authPw, f.privPw, f.privPw];
    const needsBase = !f.v2c && f.v3Access !== 'ro';
    const u = [...(needsBase ? base : ['enable', 'configure terminal']), ''];
    u.push(`! SNMPv3 user: SHA authentication + AES privacy, ${f.v3Access === 'ro' ? `read-only group "${group}"` : 'full access via the default "initial" group'} (UG p.3486)`);
    u.push(userCmd);
    if (f.inlineAnswers) u.push(...promptLines);
    blocks.push({
      title: `${blocks.length + 1} · SNMPv3 user`,
      text: u.join('\n'),
      note: f.inlineAnswers
        ? 'The four lines after the user command answer the switch\'s password prompts. If your terminal pastes too fast, paste up to the user command and type the passwords at the prompts instead.'
        : 'The switch will PROMPT for the passwords after this command (they can\'t go on the command line): authentication password, re-enter it, privacy password, re-enter it.'
    });
    blocks.push({
      title: `${blocks.length + 1} · SNMPv3 traps to Site Engine`,
      text: ['configure terminal', '', '! SNMPv3 traps (CmdRef p.662)', `${hostNote}snmp-server host ${host} v3 authPriv ${f.v3User.trim()}`.replace(/\n$/, ''), '', 'save config'].join('\n')
    });
  }
  return { errors: [], blocks };
}

function SnmpBuilder() {
  const [f, setF] = useState({
    v2c: false, v3: true,
    location: '', contact: '', trapIp: '',
    roCommunity: '', rwCommunity: '',
    v3User: '', authPw: '', privPw: '', v3Access: 'rw', v3Group: 'faceRO', inlineAnswers: false
  });
  const [showPw, setShowPw] = useState(false);
  const [result, setResult] = useState(null);
  const set = (patch) => { setF({ ...f, ...patch }); setResult(null); };

  return (
    <div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px', padding: '8px 10px', borderLeft: '3px solid var(--extreme-violet)', background: 'var(--canvas-bg)', borderRadius: '6px' }}>
        Site Engine normally reaches new switches with its default SNMPv3 profile and then pushes your SNMP settings itself —
        use this when you want to set SNMP on a switch by hand. Everything here stays in your browser: nothing is sent to FACE's server or saved.
      </div>

      <div style={{ display: 'flex', gap: '18px', marginBottom: '12px' }}>
        <label style={{ fontSize: '0.9rem', cursor: 'pointer' }}><input type="checkbox" checked={f.v2c} onChange={e => set({ v2c: e.target.checked })} /> SNMP v2c</label>
        <label style={{ fontSize: '0.9rem', cursor: 'pointer' }}><input type="checkbox" checked={f.v3} onChange={e => set({ v3: e.target.checked })} /> SNMP v3</label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
        <div style={fieldset}>
          <strong style={{ fontSize: '0.85rem' }}>Common</strong>
          <div style={{ ...field, marginTop: '8px' }}><span style={label}>Site Engine IP (trap receiver) — blank = placeholder</span>
            <input style={input} placeholder="e.g. 10.1.1.50" value={f.trapIp} onChange={e => set({ trapIp: e.target.value })} /></div>
          <div style={field}><span style={label}>Location (optional)</span>
            <input style={input} placeholder="e.g. Central Office MDF" value={f.location} onChange={e => set({ location: e.target.value })} /></div>
          <div style={field}><span style={label}>Contact (optional)</span>
            <input style={input} placeholder="e.g. Network Team x1234" value={f.contact} onChange={e => set({ contact: e.target.value })} /></div>
        </div>

        {f.v2c && (
          <div style={fieldset}>
            <strong style={{ fontSize: '0.85rem' }}>SNMP v2c</strong>
            <div style={{ ...field, marginTop: '8px' }}><span style={label}>Read-only community</span>
              <input style={input} type={showPw ? 'text' : 'password'} value={f.roCommunity} onChange={e => set({ roCommunity: e.target.value })} /></div>
            <div style={field}><span style={label}>Read-write community (optional)</span>
              <input style={input} type={showPw ? 'text' : 'password'} value={f.rwCommunity} onChange={e => set({ rwCommunity: e.target.value })} /></div>
          </div>
        )}

        {f.v3 && (
          <div style={fieldset}>
            <strong style={{ fontSize: '0.85rem' }}>SNMP v3 (SHA + AES)</strong>
            <div style={{ ...field, marginTop: '8px' }}><span style={label}>User name</span>
              <input style={input} placeholder="e.g. siteengine" value={f.v3User} onChange={e => set({ v3User: e.target.value })} /></div>
            <div style={field}><span style={label}>Authentication password (8+)</span>
              <input style={input} type={showPw ? 'text' : 'password'} value={f.authPw} onChange={e => set({ authPw: e.target.value })} /></div>
            <div style={field}><span style={label}>Privacy password (8+)</span>
              <input style={input} type={showPw ? 'text' : 'password'} value={f.privPw} onChange={e => set({ privPw: e.target.value })} /></div>
            <div style={field}><span style={label}>Access</span>
              <select style={input} value={f.v3Access} onChange={e => set({ v3Access: e.target.value })}>
                <option value="rw">Full access (default "initial" group)</option>
                <option value="ro">Read-only (creates a group)</option>
              </select></div>
            {f.v3Access === 'ro' && (
              <div style={field}><span style={label}>Read-only group name</span>
                <input style={input} value={f.v3Group} onChange={e => set({ v3Group: e.target.value })} /></div>
            )}
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

      {result && result.errors.length > 0 && (
        <div style={{ background: 'rgba(255,51,51,0.12)', border: '1px solid #ff3333', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.85rem' }}>
          {result.errors.map(e => <div key={e}>⚠️ {e}</div>)}
        </div>
      )}
      {result && result.blocks && result.blocks.map(b => <CopyBlock key={b.title} {...b} />)}
    </div>
  );
}

export function ToolsPanel({ onClose }) {
  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>🧰 Command builder</h2>
          <button style={ghost} onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
          <button style={btn}>SNMP</button>
        </div>
        <SnmpBuilder />
      </div>
    </div>
  );
}
