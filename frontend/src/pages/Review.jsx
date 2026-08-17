import React, { useState } from 'react';

function Review({ data, onNext, onError }) {
  const [selectedSwitch, setSelectedSwitch] = useState(null);

  const handleNext = () => {
    onNext(data);
  };

  const groupBySite = (switches) => {
    const grouped = {};
    switches.forEach(sw => {
      const site = `${sw.location} (Site ${sw.siteId})`;
      if (!grouped[site]) {
        grouped[site] = [];
      }
      grouped[site].push(sw);
    });
    return grouped;
  };

  const siteGroups = groupBySite(data.switches);

  return (
    <div className="page-review">
      <h2>Step 3: Review Network Topology</h2>
      <p className="page-description">Review extracted configuration and network hierarchy</p>

      <div className="grid grid-3" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-value">{Object.keys(siteGroups).length}</div>
          <div className="stat-label">Sites</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.switches.filter(s => s.name.includes('MDF')).length}</div>
          <div className="stat-label">MDFs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.switches.filter(s => s.name.includes('IDF')).length}</div>
          <div className="stat-label">IDFs</div>
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>🏢 Network Hierarchy</h3>
        <div className="hierarchy-view">
          {Object.entries(siteGroups).map(([site, switches]) => (
            <div key={site} className="card">
              <div className="card-header">
                <h4>{site}</h4>
                <span className="badge">{switches.length} switches</span>
              </div>
              
              <div style={{ marginTop: '1rem' }}>
                {/* MDF Switches */}
                {switches.filter(s => s.name.includes('MDF')).length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: '#6f2da8' }}>Distribution Layer (MDF):</strong>
                    <div style={{ marginLeft: '1rem', marginTop: '0.5rem' }}>
                      {switches.filter(s => s.name.includes('MDF')).map(sw => (
                        <div
                          key={sw.name}
                          className="switch-item"
                          onClick={() => setSelectedSwitch(sw)}
                          style={{
                            cursor: 'pointer',
                            padding: '0.75rem',
                            margin: '0.25rem 0',
                            background: selectedSwitch?.name === sw.name ? 'rgba(111, 45, 168, 0.15)' : '#f5f5f5',
                            borderRadius: '0.5rem',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <strong>{sw.name}</strong>
                          <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
                            {sw.type} • {sw.vlans?.length || 0} VLANs
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* IDF Switches */}
                {switches.filter(s => s.name.includes('IDF')).length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: '#8b3fbf' }}>Access Layer (IDF):</strong>
                    <div style={{ marginLeft: '1rem', marginTop: '0.5rem' }}>
                      {switches.filter(s => s.name.includes('IDF')).map(sw => (
                        <div
                          key={sw.name}
                          className="switch-item"
                          onClick={() => setSelectedSwitch(sw)}
                          style={{
                            cursor: 'pointer',
                            padding: '0.75rem',
                            margin: '0.25rem 0',
                            background: selectedSwitch?.name === sw.name ? 'rgba(111, 45, 168, 0.15)' : '#f5f5f5',
                            borderRadius: '0.5rem',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <strong>{sw.name}</strong>
                          <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: '#6b7280' }}>
                            {sw.type} • {sw.vlans?.length || 0} VLANs • Closet: {sw.closet}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedSwitch && (
        <div style={{ marginBottom: '2rem' }}>
          <h3>📊 Switch Details: {selectedSwitch.name}</h3>
          <div className="card">
            <div className="grid grid-3">
              <div>
                <strong>Type:</strong> {selectedSwitch.type}
              </div>
              <div>
                <strong>Site ID:</strong> {selectedSwitch.siteId}
              </div>
              <div>
                <strong>Location:</strong> {selectedSwitch.location}
              </div>
              <div>
                <strong>Closet:</strong> {selectedSwitch.closet}
              </div>
              <div>
                <strong>ISID Prefix:</strong> {selectedSwitch.isidPrefix}
              </div>
              <div>
                <strong>VLAN Count:</strong> {selectedSwitch.vlans?.length || 0}
              </div>
            </div>

            {selectedSwitch.vlans && selectedSwitch.vlans.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4>VLANs</h4>
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
                    {selectedSwitch.vlans.map((vlan, idx) => (
                      <tr key={idx}>
                        <td>{vlan.vlanId}</td>
                        <td>{vlan.vlanName}</td>
                        <td>{vlan.subnet}</td>
                        <td>{vlan.isid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem' }}>
        <strong>⚠️ Note:</strong> Review the network structure carefully. Click on any switch to see its VLAN configuration.
      </div>

      <button onClick={handleNext} className="btn btn-primary">
        ✓ Generate Configurations
      </button>
    </div>
  );
}

export default Review;
