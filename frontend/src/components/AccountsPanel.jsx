// ============================================
// Accounts panels
// Version: V2611051
// AdminPanel: invites (single-use links), users (enable/disable, reset
//             password), activity log. Admin role only.
// ChangePasswordPanel: a customer changes their own password.
// ============================================

import React, { useEffect, useState } from 'react';
import tokenService from '../services/tokenService.js';

const api = async (path, opts = {}) => {
  const r = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenService.getToken()}`, ...(opts.headers || {}) }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
};

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 16px', overflowY: 'auto' };
const panel = { background: 'var(--card-bg)', color: 'var(--text-primary)', borderRadius: '12px', width: '100%', maxWidth: '920px', padding: '20px 24px', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', border: '1px solid var(--border-color)' };
const input = { padding: '7px 9px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--canvas-bg)', color: 'var(--text-primary)', fontSize: '0.88rem' };
const btn = { padding: '7px 14px', borderRadius: '6px', border: 'none', background: 'var(--extreme-violet)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' };
const ghost = { ...btn, background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)' };
const th = { textAlign: 'left', padding: '6px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' };
const td = { padding: '6px 8px', fontSize: '0.85rem', borderBottom: '1px solid var(--border-color)' };

export function AdminPanel({ onClose }) {
  const [tab, setTab] = useState('invites');
  const [enabled, setEnabled] = useState(null);
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ org: '', days: 7, note: '' });
  const [newLink, setNewLink] = useState(null);
  const [tempPw, setTempPw] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setError('');
    try {
      const s = await api('/api/admin/status');
      setEnabled(s.accountsEnabled);
      if (!s.accountsEnabled) return;
      const [u, i, a] = await Promise.all([api('/api/admin/users'), api('/api/admin/invites'), api('/api/admin/activity')]);
      setUsers(u.users); setInvites(i.invites); setActivity(a.activity);
    } catch (err) {
      setError(err.message === 'Insufficient permissions' ? 'Your session predates admin roles - sign out and back in once.' : err.message);
    }
  };
  useEffect(() => { load(); }, []);

  const createInvite = async () => {
    setError(''); setNewLink(null); setCopied(false);
    try {
      const r = await api('/api/admin/invites', { method: 'POST', body: JSON.stringify(form) });
      setNewLink({ url: `${window.location.origin}/join/${r.token}`, org: r.org, expiresAt: r.expiresAt });
      setForm({ org: '', days: 7, note: '' });
      load();
    } catch (err) { setError(err.message); }
  };
  const act = async (fn) => { setError(''); try { await fn(); load(); } catch (err) { setError(err.message); } };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } };

  const inviteStatus = (i) => i.used_at ? `Used by ${i.used_by}` : i.revoked ? 'Revoked' : new Date(i.expires_at) < new Date() ? 'Expired' : 'Open';

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0 }}>👥 Customer access</h2>
          <button style={ghost} onClick={onClose}>Close</button>
        </div>

        {error && <div style={{ background: 'rgba(255,51,51,0.12)', border: '1px solid #ff3333', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '0.85rem' }}>⚠️ {error}</div>}

        {enabled === false && (
          <div style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '0.9rem' }}>
            Customer accounts are off: no database is connected. Add a PostgreSQL database to the Railway project and
            set this service's <code>DATABASE_URL</code> variable to it, then redeploy. Your admin login works either way.
          </div>
        )}

        {enabled && (
          <>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {[['invites', `Invites (${invites.length})`], ['users', `Users (${users.length})`], ['activity', 'Activity']].map(([k, l]) => (
                <button key={k} style={tab === k ? btn : ghost} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>

            {tab === 'invites' && (
              <>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px' }}>
                  <label style={{ fontSize: '0.75rem' }}>Customer / organization<br />
                    <input style={{ ...input, width: '220px' }} value={form.org} placeholder="e.g. Horry County Schools" onChange={e => setForm({ ...form, org: e.target.value })} />
                  </label>
                  <label style={{ fontSize: '0.75rem' }}>Note (optional)<br />
                    <input style={{ ...input, width: '200px' }} value={form.note} placeholder="e.g. network lead" onChange={e => setForm({ ...form, note: e.target.value })} />
                  </label>
                  <label style={{ fontSize: '0.75rem' }}>Expires in<br />
                    <select style={input} value={form.days} onChange={e => setForm({ ...form, days: parseInt(e.target.value) })}>
                      {[1, 3, 7, 14, 30].map(d => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
                    </select>
                  </label>
                  <button style={btn} disabled={!form.org.trim()} onClick={createInvite}>Create invite link</button>
                </div>

                {newLink && (
                  <div style={{ padding: '10px 12px', border: '2px solid var(--extreme-violet)', borderRadius: '8px', marginBottom: '14px' }}>
                    <div style={{ fontSize: '0.8rem', marginBottom: '6px' }}>
                      Single-use link for <strong>{newLink.org}</strong>, valid until {fmt(newLink.expiresAt)}. <strong>Copy it now</strong> — it can't be shown again.
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input readOnly style={{ ...input, flex: 1, fontFamily: 'monospace', fontSize: '0.78rem' }} value={newLink.url} onFocus={e => e.target.select()} />
                      <button style={btn} onClick={() => copy(newLink.url)}>{copied ? '✓ Copied' : 'Copy'}</button>
                    </div>
                  </div>
                )}

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>#</th><th style={th}>Customer</th><th style={th}>Note</th><th style={th}>Created</th><th style={th}>Expires</th><th style={th}>Status</th><th style={th}></th></tr></thead>
                  <tbody>
                    {invites.map(i => (
                      <tr key={i.id}>
                        <td style={td}>{i.id}</td><td style={td}>{i.org}</td><td style={td}>{i.note || ''}</td>
                        <td style={td}>{fmt(i.created_at)}</td><td style={td}>{fmt(i.expires_at)}</td><td style={td}>{inviteStatus(i)}</td>
                        <td style={td}>{inviteStatus(i) === 'Open' && <button style={ghost} onClick={() => act(() => api(`/api/admin/invites/${i.id}/revoke`, { method: 'POST' }))}>Revoke</button>}</td>
                      </tr>
                    ))}
                    {invites.length === 0 && <tr><td style={td} colSpan={7}>No invites yet.</td></tr>}
                  </tbody>
                </table>
              </>
            )}

            {tab === 'users' && (
              <>
                {tempPw && (
                  <div style={{ padding: '10px 12px', border: '2px solid var(--extreme-violet)', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem' }}>
                    Temporary password for <strong>{tempPw.username}</strong>: <code style={{ fontSize: '0.95rem' }}>{tempPw.temporaryPassword}</code>
                    {' '}— send it to them; they can change it with 🔑 after signing in. It won't be shown again.
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={th}>Username</th><th style={th}>Customer</th><th style={th}>Created</th><th style={th}>Last sign-in</th><th style={th}>Status</th><th style={th}></th></tr></thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={u.enabled ? undefined : { opacity: 0.55 }}>
                        <td style={td}><strong>{u.username}</strong></td><td style={td}>{u.org}</td>
                        <td style={td}>{fmt(u.created_at)}</td><td style={td}>{fmt(u.last_login_at)}</td>
                        <td style={td}>{u.enabled ? 'Active' : 'Disabled'}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <button style={ghost} onClick={() => act(() => api(`/api/admin/users/${u.id}/enabled`, { method: 'POST', body: JSON.stringify({ enabled: !u.enabled }) }))}>{u.enabled ? 'Disable' : 'Enable'}</button>{' '}
                          <button style={ghost} onClick={() => act(async () => { if (!window.confirm(`Reset ${u.username}'s password?`)) return; setTempPw(await api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' })); })}>Reset password</button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && <tr><td style={td} colSpan={6}>No customer accounts yet — create an invite link.</td></tr>}
                  </tbody>
                </table>
              </>
            )}

            {tab === 'activity' && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>When</th><th style={th}>User</th><th style={th}>Event</th><th style={th}>Detail</th></tr></thead>
                <tbody>
                  {activity.map((a, idx) => (
                    <tr key={idx}><td style={td}>{fmt(a.at)}</td><td style={td}>{a.username}</td><td style={td}>{a.event}</td><td style={td}>{a.detail || ''}</td></tr>
                  ))}
                  {activity.length === 0 && <tr><td style={td} colSpan={4}>No activity yet.</td></tr>}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ChangePasswordPanel({ onClose }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) return setMsg({ err: true, text: 'New passwords do not match' });
    try {
      await api('/api/account/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      setMsg({ err: false, text: 'Password changed.' });
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) { setMsg({ err: true, text: err.message }); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <form style={{ ...panel, maxWidth: '420px' }} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ marginTop: 0 }}>🔑 Change password</h2>
        {msg && <div style={{ marginBottom: '10px', fontSize: '0.85rem', color: msg.err ? '#ff3333' : 'var(--success, #00CC99)' }}>{msg.text}</div>}
        {[['Current password', current, setCurrent, 'current-password'], ['New password (10+ characters)', next, setNext, 'new-password'], ['Confirm new password', confirm, setConfirm, 'new-password']].map(([l, v, set, ac]) => (
          <label key={l} style={{ display: 'block', fontSize: '0.8rem', marginBottom: '10px' }}>{l}<br />
            <input type="password" autoComplete={ac} style={{ ...input, width: '100%' }} value={v} onChange={e => set(e.target.value)} />
          </label>
        ))}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" style={ghost} onClick={onClose}>Close</button>
          <button type="submit" style={btn} disabled={!current || !next || !confirm}>Change password</button>
        </div>
      </form>
    </div>
  );
}
