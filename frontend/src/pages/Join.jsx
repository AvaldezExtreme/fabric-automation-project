// ============================================
// Join Page - single-use invite link (/join/<token>)
// Version: V2611051
// Purpose: a customer opens the link their SE sent, picks a username and
//          password, and is signed straight in with a customer account.
// ============================================

import React, { useEffect, useState } from 'react';
import '../styles/Auth.css';
import tokenService from '../services/tokenService.js';

function Join({ token, onJoined }) {
  const [invite, setInvite] = useState(null); // { org, expiresAt }
  const [loadError, setLoadError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/join/${encodeURIComponent(token)}`)
      .then(async r => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'This invite link is not valid.');
        setInvite(j);
      })
      .catch(err => setLoadError(err.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const r = await fetch(`/api/join/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not create the account');
      tokenService.setToken(j.token, j.user);
      window.history.replaceState(null, '', '/');
      onJoined(j.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-background"></div>
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <div className="logo-icon">⚡</div>
              <div className="logo-text">
                <div className="logo-brand">Extreme Networks</div>
                <div className="logo-product">FACE - Fabric Auto Configuration Engine</div>
              </div>
            </div>
          </div>

          {loadError ? (
            <div className="auth-form">
              <h1>Invite link unavailable</h1>
              <div className="auth-error"><span className="error-icon">⚠️</span><span>{loadError}</span></div>
              <p className="auth-subtitle"><a href="/">Go to the sign-in page</a></p>
            </div>
          ) : !invite ? (
            <div className="auth-form"><p className="auth-subtitle">Checking your invite…</p></div>
          ) : (
            <form onSubmit={submit} className="auth-form">
              <h1>Create your account</h1>
              <p className="auth-subtitle">
                You've been invited to FACE for <strong>{invite.org}</strong>. Pick a username and password.
                This link works once.
              </p>
              {error && <div className="auth-error"><span className="error-icon">⚠️</span><span>{error}</span></div>}

              <div className="form-group">
                <label htmlFor="join-username">Username</label>
                <div className="input-wrapper">
                  <span className="input-icon">👤</span>
                  <input id="join-username" value={username} onChange={e => setUsername(e.target.value)}
                    placeholder="3-32 letters, numbers, . - _" autoComplete="username" disabled={busy} />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="join-password">Password</label>
                <div className="input-wrapper">
                  <span className="input-icon">🔒</span>
                  <input id="join-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="At least 10 characters" autoComplete="new-password" disabled={busy} />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="join-confirm">Confirm password</label>
                <div className="input-wrapper">
                  <span className="input-icon">🔒</span>
                  <input id="join-confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    autoComplete="new-password" disabled={busy} />
                </div>
              </div>
              <button type="submit" className="auth-submit" disabled={busy || !username || !password || !confirm}>
                {busy ? 'Creating account…' : 'Create account & sign in'}
              </button>
              <p className="auth-subtitle" style={{ marginTop: '12px', fontSize: '0.8rem' }}>
                FACE doesn't store your network data — project files stay on your PC.
                Sign-ins and config generations are logged to your account.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default Join;
