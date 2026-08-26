// ============================================
// Review Page
// Version: V2608201
// Purpose: Review parsed data with inline editing - fix typos here
//          instead of round-tripping back to Excel
// ============================================

import React, { useState } from 'react';
import { isMdfSwitch, buildClosetTopology } from '../utils/closetTopology.js';

function Review({ data, onNext, onError, onUpdate }) {
  const [switches, setSwitches] = useState(data.switches);
  const [selectedName, setSelectedName] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

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
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
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
    setEditing(false);
    setDraft(null);
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
    width: '100%', padding: '6px 8px', border: '1px solid #d1b8f0',
    borderRadius: '6px', fontSize: '0.85rem'
  };

  const renderSwitchItem = (sw) => (
    <div
      key={sw.name}
      className="switch-item"
      onClick={() => { setSelectedName(sw.name); setEditing(false); setDraft(null); }}
      style={{
        cursor: 'pointer',
        padding: '0.75rem',
        margin: '0.25rem 0',
        background: selectedName === sw.name ? 'rgba(111, 45, 168, 0.15)' : '#f5f5f5',
        borderRadius: '0.5rem',
        border: '1px solid #e5e7eb'
      }}
    >
      <strong>{sw.name}</strong>
      <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
        {sw.type} • {sw.vlans?.length || 0} VLANs{sw.closet ? ` • Closet: ${sw.closet}` : ''}
      </span>
    </div>
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
                          <strong style={{ color: '#5B059C' }}>
                            🏛️ Distribution — {topo.mdfKey} ({mdfList.length} switch{mdfList.length === 1 ? '' : 'es'}):
                          </strong>
                          <div style={{ marginLeft: '1rem', marginTop: '0.5rem' }}>
                            {mdfList.map(renderSwitchItem)}
                          </div>
                        </div>
                      )}

                      {topo.accessClosets.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <strong style={{ color: '#7519F9' }}>
                            🚪 Access Closets ({topo.accessClosets.length}):
                          </strong>
                          {topo.accessClosets.map(closetKey => {
                            const list = topo.closets.get(closetKey);
                            return (
                              <div key={closetKey} style={{ marginLeft: '1rem', marginTop: '0.75rem' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#666' }}>
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

      {selectedSwitch && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>📊 Switch Details: {selectedSwitch.name}</h3>
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
                      selectedSwitch.vlans.map((vlan, idx) => (
                        <tr key={idx}>
                          <td>{vlan.vlanId}</td>
                          <td>{vlan.vlanName}</td>
                          <td>{vlan.subnet}</td>
                          <td>{vlan.isid}</td>
                        </tr>
                      ))
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
      )}

      <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem' }}>
        <strong>💡 Tip:</strong> Click any switch to inspect it — use ✏️ Edit to fix names, VLANs, subnets, or I-SIDs right here. Your edits flow into the generated configs.
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
}

export default Review;
