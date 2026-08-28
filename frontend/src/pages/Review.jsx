// ============================================
// Review Page
// Version: V2608201
// Purpose: Review parsed data with inline editing - fix typos here
//          instead of round-tripping back to Excel
// ============================================

import React, { useState } from 'react';
import { isMdfSwitch, buildClosetTopology } from '../utils/closetTopology.js';
import { isFaDelivered, faDeliveredCount, FA_TOOLTIP } from '../utils/faDelivered.js';

function Review({ data, onNext, onError, onUpdate, onEditingChange }) {
  const [switches, setSwitches] = useState(data.switches);
  const [selectedName, setSelectedName] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [justSaved, setJustSaved] = useState(false);

  const setEditingState = (value) => {
    setEditing(value);
    if (onEditingChange) onEditingChange(value);
  };

  // Safety: never leave the app thinking an edit is open after unmount
  React.useEffect(() => {
    return () => { if (onEditingChange) onEditingChange(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSwitch = switches.find(s => s.name === selectedName) || null;

  const handleNext = () => {
    onNext({ ...data, switches });
  };

  const startEdit = () => {
    setDraft({
      name: selectedSwitch.name,
      closet: selectedSwitch.closet || '',
      mgmtVlan: selectedSwitch.mgmtVlan || '',
      defaultGateway: selectedSwitch.defaultGateway || '',
      vlans: (selectedSwitch.vlans || []).map(v => ({
        origVlanId: v.vlanId,
        vlanId: v.vlanId,
        vlanName: v.vlanName || '',
        subnet: v.subnet || '',
        isid: v.isid || ''
      }))
    });
    setJustSaved(false);
    setEditingState(true);
  };

  const cancelEdit = () => {
    setEditingState(false);
    setDraft(null);
  };

  const saveEdit = () => {
    const orig = selectedSwitch;

    // Basic sanity checks before committing
    for (const v of draft.vlans) {
      const id = parseInt(v.vlanId);
      if (isNaN(id) || id < 1 || id > 4094) {
        onError(`VLAN ID "${v.vlanId}" must be between 1 and 4094`);
        return;
      }
      const isid = parseInt(v.isid);
      if (isNaN(isid) || isid < 4096 || isid > 16777215) {
        onError(`I-SID "${v.isid}" must be between 4096 and 16777215`);
        return;
      }
    }

    const updated = switches.map(sw => {
      // The edited switch: apply field + VLAN changes
      if (sw.name === orig.name && sw.siteId === orig.siteId) {
        return {
          ...sw,
          name: draft.name.trim() || sw.name,
          closet: draft.closet,
          mgmtVlan: draft.mgmtVlan,
          defaultGateway: draft.defaultGateway,
          vlans: sw.vlans.map(v => {
            const edited = draft.vlans.find(dv => dv.origVlanId === v.vlanId);
            return edited
              ? { ...v, vlanId: parseInt(edited.vlanId), vlanName: edited.vlanName, subnet: edited.subnet, isid: parseInt(edited.isid) }
              : v;
          })
        };
      }
      // Same site: VLANs are shared site-wide, so apply VLAN edits here too
      if (sw.siteId === orig.siteId) {
        return {
          ...sw,
          vlans: sw.vlans.map(v => {
            const edited = draft.vlans.find(dv => dv.origVlanId === v.vlanId);
            return edited
              ? { ...v, vlanId: parseInt(edited.vlanId), vlanName: edited.vlanName, subnet: edited.subnet, isid: parseInt(edited.isid) }
              : v;
          })
        };
      }
      return sw;
    });

    setSwitches(updated);
    // Push edits to app state immediately so Save Project and later steps
    // see them without requiring 'Generate Configurations' first
    if (onUpdate) onUpdate({ ...data, switches: updated });

    setSelectedName(draft.name.trim() || orig.name);
    setEditingState(false);
    setDraft(null);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 6000);
  };

  const groupBySite = (sws) => {
    const grouped = {};
    sws.forEach(sw => {
      const site = `${sw.location} (Site ${sw.siteId})`;
      if (!grouped[site]) {
        grouped[site] = [];
      }
      grouped[site].push(sw);
    });
    return grouped;
  };

  const siteGroups = groupBySite(switches);

  const inputStyle = {
    width: '100%', padding: '6px 8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--text-primary)',
    borderRadius: '6px', fontSize: '0.85rem'
  };

  // Switch row + (when selected) its details card INLINE right below it,
  // so there's no scrolling to the bottom of a long hierarchy to see them
  const renderSwitchItem = (sw) => (
    <React.Fragment key={sw.name}>
      <div
        className="switch-item"
        onClick={() => {
          if (editing && !window.confirm('You have an unsaved edit in progress.\n\n• OK = switch anyway (your edit will be lost)\n• Cancel = stay so you can 💾 Save or Cancel first')) return;
          if (selectedName === sw.name) { setSelectedName(null); return; }
          setSelectedName(sw.name); setEditingState(false); setDraft(null);
        }}
        style={{
          cursor: 'pointer',
          padding: '0.75rem',
          margin: '0.25rem 0',
          background: selectedName === sw.name ? 'rgba(117, 25, 249, 0.18)' : 'var(--canvas-bg)',
          borderRadius: '0.5rem',
          border: selectedName === sw.name ? '1px solid var(--extreme-violet)' : '1px solid var(--border-color)'
        }}
      >
        <strong>{sw.name}</strong>
        <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {sw.type} • {sw.vlans?.length || 0} VLANs{faDeliveredCount(sw, data.settings) > 0 ? ` (${faDeliveredCount(sw, data.settings)} via FA)` : ''}{sw.closet ? ` • Closet: ${sw.closet}` : ''}
          {selectedName !== sw.name && <span style={{ marginLeft: '0.5rem', color: 'var(--extreme-violet)' }}>▸ click to inspect</span>}
        </span>
      </div>
      {selectedName === sw.name && renderDetails()}
    </React.Fragment>
  );

  return (
    <div className="page-review">
      <h2>Step 3: Review Network Topology</h2>
      <p className="page-description">
        Review extracted configuration — click a switch, then ✏️ Edit to fix anything without going back to Excel
      </p>

      <div className="grid grid-3" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(siteGroups).length}</div>
          <div className="stat-label">Sites</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{switches.filter(s => isMdfSwitch(s)).length}</div>
          <div className="stat-label">MDF Switches</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{switches.filter(s => !isMdfSwitch(s)).length}</div>
          <div className="stat-label">Access Switches</div>
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>🏢 Network Hierarchy</h3>
        <div className="hierarchy-view">
          {Object.entries(siteGroups).map(([site, sws]) => (
            <div key={site} className="card">
              <div className="card-header">
                <h4>{site}</h4>
                <span className="badge">{sws.length} switches</span>
              </div>

              <div style={{ marginTop: '1rem' }}>
                {(() => {
                  const topo = buildClosetTopology(sws);
                  const mdfList = topo.closets.get(topo.mdfKey) || [];
                  return (
                    <>
                      {mdfList.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <strong style={{ color: 'var(--extreme-violet)' }}>
                            🏛️ Distribution — {topo.mdfKey} ({mdfList.length} switch{mdfList.length === 1 ? '' : 'es'}):
                          </strong>
                          <div style={{ marginLeft: '1rem', marginTop: '0.5rem' }}>
                            {mdfList.map(renderSwitchItem)}
                          </div>
                        </div>
                      )}

                      {topo.accessClosets.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <strong style={{ color: 'var(--extreme-violet)' }}>
                            🚪 Access Closets ({topo.accessClosets.length}):
                          </strong>
                          {topo.accessClosets.map(closetKey => {
                            const list = topo.closets.get(closetKey);
                            return (
                              <div key={closetKey} style={{ marginLeft: '1rem', marginTop: '0.75rem' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                  {closetKey} ({list.length} switch{list.length === 1 ? '' : 'es'})
                                </span>
                                <div style={{ marginTop: '0.25rem' }}>
                                  {list.map(renderSwitchItem)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem', color: '#92400e' }}>
        <strong>💡 Tip:</strong> Click any switch to inspect it right where it sits — use ✏️ Edit to fix names, VLANs, subnets, or I-SIDs. Your edits flow into the generated configs.
      </div>

      <button onClick={handleNext} className="btn btn-primary" disabled={editing}>
        ✓ Generate Configurations
      </button>
      {editing && (
        <span style={{ marginLeft: '12px', fontSize: '0.85rem', color: '#92400e' }}>
          Save or cancel your edit first
        </span>
      )}
    </div>
  );

  // ---------- inline details card (rendered under the selected switch) ----------
  function renderDetails() {
    return (
        <div style={{ margin: '0.25rem 0 1rem 1rem', padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--extreme-violet)', borderRadius: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>📊 Switch Details: {selectedSwitch.name}</h3>
            {!editing ? (
              <button onClick={startEdit} className="btn btn-primary" style={{ padding: '8px 18px' }}>
                ✏️ Edit
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={saveEdit} className="btn btn-primary" style={{ padding: '8px 18px', background: '#059669' }}>
                  💾 Save
                </button>
                <button onClick={cancelEdit} className="btn" style={{ padding: '8px 18px', background: '#e5e7eb' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {editing && (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '0.75rem', color: '#92400e', fontSize: '0.9rem' }}>
              ✏️ <strong>You are editing.</strong> Your changes are NOT kept yet — click <strong>💾 Save</strong> to keep them, or <strong>Cancel</strong> to discard. Leaving this page without saving will lose them.
            </div>
          )}
          {justSaved && !editing && (
            <div style={{ background: '#d1fae5', border: '1px solid #6ee7b7', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '0.75rem', color: '#065f46', fontSize: '0.9rem' }}>
              ✅ <strong>Your edited data has been saved</strong> and is now part of the project — configs, topology, and exports will use it. Tip: click the header <strong>💾 Save Project</strong> to also write it to your project file.
            </div>
          )}

          <div className="card">
            {!editing ? (
              <div className="grid grid-3">
                <div><strong>Type:</strong> {selectedSwitch.type}</div>
                <div><strong>Site ID:</strong> {selectedSwitch.siteId}</div>
                <div><strong>Location:</strong> {selectedSwitch.location}</div>
                <div><strong>Closet:</strong> {selectedSwitch.closet}</div>
                <div><strong>Mgmt VLAN:</strong> {selectedSwitch.mgmtVlan}</div>
                <div><strong>Gateway:</strong> {selectedSwitch.defaultGateway}</div>
              </div>
            ) : (
              <div className="grid grid-3" style={{ gap: '12px' }}>
                <div>
                  <strong style={{ fontSize: '0.8rem' }}>Switch Name</strong>
                  <input style={inputStyle} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.8rem' }}>Closet</strong>
                  <input style={inputStyle} value={draft.closet} onChange={e => setDraft({ ...draft, closet: e.target.value })} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.8rem' }}>Mgmt VLAN</strong>
                  <input style={inputStyle} value={draft.mgmtVlan} onChange={e => setDraft({ ...draft, mgmtVlan: e.target.value })} />
                </div>
                <div>
                  <strong style={{ fontSize: '0.8rem' }}>Default Gateway</strong>
                  <input style={inputStyle} value={draft.defaultGateway} onChange={e => setDraft({ ...draft, defaultGateway: e.target.value })} />
                </div>
              </div>
            )}

            {selectedSwitch.vlans && selectedSwitch.vlans.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4>
                  VLANs
                  {editing && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#92400e', marginLeft: '10px' }}>
                      ⚠️ VLAN changes apply to every switch in this site
                    </span>
                  )}
                </h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>VLAN ID</th>
                      <th>Name</th>
                      <th>Subnet</th>
                      <th>I-SID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!editing ? (
                      selectedSwitch.vlans.map((vlan, idx) => {
                        const fa = isFaDelivered(vlan, selectedSwitch, data.settings);
                        return (
                          <tr key={idx} style={fa ? { opacity: 0.55 } : undefined} title={fa ? FA_TOOLTIP : undefined}>
                            <td>{vlan.vlanId}</td>
                            <td>
                              {vlan.vlanName}
                              {fa && (
                                <span style={{ marginLeft: '8px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--extreme-violet)', border: '1px solid var(--extreme-violet)', borderRadius: '999px', padding: '1px 8px', whiteSpace: 'nowrap' }}>
                                  📶 FA
                                </span>
                              )}
                            </td>
                            <td>{vlan.subnet}</td>
                            <td>{vlan.isid}</td>
                          </tr>
                        );
                      })
                    ) : (
                      draft.vlans.map((vlan, idx) => (
                        <tr key={idx}>
                          <td><input style={{ ...inputStyle, width: '70px' }} value={vlan.vlanId} onChange={e => {
                            const vlans = [...draft.vlans]; vlans[idx] = { ...vlans[idx], vlanId: e.target.value }; setDraft({ ...draft, vlans });
                          }} /></td>
                          <td><input style={inputStyle} value={vlan.vlanName} onChange={e => {
                            const vlans = [...draft.vlans]; vlans[idx] = { ...vlans[idx], vlanName: e.target.value }; setDraft({ ...draft, vlans });
                          }} /></td>
                          <td><input style={inputStyle} value={vlan.subnet} onChange={e => {
                            const vlans = [...draft.vlans]; vlans[idx] = { ...vlans[idx], subnet: e.target.value }; setDraft({ ...draft, vlans });
                          }} /></td>
                          <td><input style={{ ...inputStyle, width: '110px' }} value={vlan.isid} onChange={e => {
                            const vlans = [...draft.vlans]; vlans[idx] = { ...vlans[idx], isid: e.target.value }; setDraft({ ...draft, vlans });
                          }} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
    );
  }
}

export default Review;
