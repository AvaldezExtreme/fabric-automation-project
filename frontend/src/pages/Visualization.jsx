// ============================================
// Topology Visualization - Interactive & PDF Export
// Version: V2608173
// Purpose: Professional topology visualization with PDF export
// ============================================

import React, { useState, useRef } from 'react';

function Visualization({ data, onNext, onBack }) {
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedSwitch, setSelectedSwitch] = useState(null);
  const [exportMode, setExportMode] = useState(null);
  const canvasRef = useRef(null);

  if (!data || !data.switches || data.switches.length === 0) {
    return <div style={styles.noData}>No topology data available</div>;
  }

  // Get unique sites
  const sitesMap = new Map();
  data.switches.forEach(sw => {
    if (!sitesMap.has(sw.siteId)) {
      sitesMap.set(sw.siteId, {
        id: sw.siteId,
        name: sw.location || `Site ${sw.siteId}`,
        switches: []
      });
    }
    sitesMap.get(sw.siteId).switches.push(sw);
  });

  const sites = Array.from(sitesMap.values()).sort((a, b) => a.id - b.id);
  const currentSite = selectedSite || sites[0];
  const switchesInSite = currentSite.switches || [];

  // Get connections between switches (based on topology from upload)
  const getConnections = () => {
    const connections = [];
    switchesInSite.forEach((sw1, idx1) => {
      switchesInSite.forEach((sw2, idx2) => {
        if (idx1 < idx2) {
          // Create connection based on switch relationships
          if (sw1.type === 'L3' && sw2.type === 'L2') {
            connections.push({ from: sw1.name, to: sw2.name, type: 'fabric' });
          } else if (sw1.type === 'L2' && sw2.type === 'L2') {
            connections.push({ from: sw1.name, to: sw2.name, type: 'mesh' });
          }
        }
      });
    });
    return connections;
  };

  const connections = getConnections();
  const selectedSwitchData = switchesInSite.find(s => s.name === selectedSwitch);

  // Generate PDF export
  const generatePDF = async (scope) => {
    setExportMode(scope);
    setTimeout(() => {
      const element = document.getElementById('pdf-content');
      if (!element) return;

      // Use html2pdf library (load from CDN)
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

      script.onload = () => {
        const opt = {
          margin: [10, 10, 10, 10],
          filename: `FACE-Topology-${scope === 'all' ? 'All-Sites' : currentSite.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a3' }
        };

        html2pdf().set(opt).from(element).save();
        setExportMode(null);
      };

      document.head.appendChild(script);
    }, 100);
  };

  return (
    <div className="page-visualization" style={styles.container}>
      <h2>Step 6: Network Topology Visualization</h2>
      <p className="page-description">
        Interactive topology view - Click a site to view its topology, click switches for details
      </p>

      <div style={styles.mainLayout}>
        {/* Left Panel: Site Selector & Topology Canvas */}
        <div style={styles.leftPanel}>
          {/* Site Selector */}
          <div style={styles.siteSelector}>
            <h3 style={styles.sectionTitle}>📍 Select Site</h3>
            <div style={styles.siteTabs}>
              {sites.map(site => (
                <button
                  key={site.id}
                  onClick={() => {
                    setSelectedSite(site);
                    setSelectedSwitch(null);
                  }}
                  style={{
                    ...styles.siteTab,
                    backgroundColor: currentSite.id === site.id ? '#5B059C' : '#E8E8E8',
                    color: currentSite.id === site.id ? 'white' : '#333'
                  }}
                >
                  {site.name} <span style={styles.switchCount}>({site.switches.length})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Topology Canvas */}
          <div style={styles.canvasContainer}>
            <h3 style={styles.sectionTitle}>🔗 Network Topology</h3>
            <svg
              ref={canvasRef}
              width="100%"
              height="400"
              style={styles.canvas}
              viewBox="0 0 800 400"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3, 0 6" fill="#5B059C" />
                </marker>
              </defs>

              {/* Draw connections first (background) */}
              {connections.map((conn, idx) => {
                const fromIdx = switchesInSite.findIndex(s => s.name === conn.from);
                const toIdx = switchesInSite.findIndex(s => s.name === conn.to);
                const fromX = 100 + fromIdx * 150;
                const fromY = 200;
                const toX = 100 + toIdx * 150;
                const toY = 200;

                return (
                  <g key={`conn-${idx}`}>
                    {/* Connection line */}
                    <line
                      x1={fromX}
                      y1={fromY}
                      x2={toX}
                      y2={toY}
                      stroke={conn.type === 'fabric' ? '#5B059C' : '#FF9900'}
                      strokeWidth="2"
                      markerEnd="url(#arrowhead)"
                    />
                    {/* Connection label */}
                    <text
                      x={(fromX + toX) / 2}
                      y={(fromY + toY) / 2 - 10}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#666"
                      fontWeight="bold"
                    >
                      {conn.type === 'fabric' ? 'Fabric' : 'Mesh'}
                    </text>
                  </g>
                );
              })}

              {/* Draw switches */}
              {switchesInSite.map((sw, idx) => {
                const x = 100 + idx * 150;
                const y = 200;
                const isSelected = sw.name === selectedSwitch;

                return (
                  <g
                    key={sw.name}
                    onClick={() => setSelectedSwitch(isSelected ? null : sw.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Switch box */}
                    <rect
                      x={x - 50}
                      y={y - 40}
                      width="100"
                      height="80"
                      fill={isSelected ? '#5B059C' : sw.type === 'L3' ? '#00CC99' : '#FF9900'}
                      stroke={isSelected ? '#fff' : '#333'}
                      strokeWidth={isSelected ? '3' : '2'}
                      rx="8"
                    />

                    {/* Switch name */}
                    <text
                      x={x}
                      y={y - 15}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="bold"
                      fill="white"
                    >
                      {sw.name}
                    </text>

                    {/* Switch type */}
                    <text
                      x={x}
                      y={y + 5}
                      textAnchor="middle"
                      fontSize="11"
                      fill="white"
                    >
                      {sw.type} Switch
                    </text>

                    {/* VLAN count */}
                    <text
                      x={x}
                      y={y + 25}
                      textAnchor="middle"
                      fontSize="10"
                      fill="white"
                      opacity="0.8"
                    >
                      {(sw.vlans?.length || 0)} VLANs
                    </text>
                  </g>
                );
              })}

              {/* Background info */}
              <text x="10" y="30" fontSize="12" fill="#999">
                Click a switch for details
              </text>
            </svg>
          </div>

          {/* Export Options */}
          <div style={styles.exportSection}>
            <h3 style={styles.sectionTitle}>📥 Export to PDF</h3>
            <div style={styles.exportButtons}>
              <button
                onClick={() => generatePDF('site')}
                style={styles.exportBtn}
              >
                📄 {currentSite.name} Site Only
              </button>
              <button
                onClick={() => generatePDF('all')}
                style={{ ...styles.exportBtn, backgroundColor: '#00CC99' }}
              >
                📊 All Sites Network
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Switch Details */}
        <div style={styles.rightPanel}>
          {selectedSwitchData ? (
            <div>
              <h3 style={styles.sectionTitle}>🖥️ Switch Details</h3>

              <div style={styles.detailsCard}>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Name:</span>
                  <span style={styles.value}>{selectedSwitchData.name}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Type:</span>
                  <span style={{
                    ...styles.value,
                    backgroundColor: selectedSwitchData.type === 'L3' ? '#00CC99' : '#FF9900',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    display: 'inline-block'
                  }}>
                    {selectedSwitchData.type} Switch
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Site ID:</span>
                  <span style={styles.value}>{selectedSwitchData.siteId}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Location:</span>
                  <span style={styles.value}>{selectedSwitchData.location || 'Not specified'}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Closet:</span>
                  <span style={styles.value}>{selectedSwitchData.closet || 'Not specified'}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Management IP:</span>
                  <span style={styles.value}>{selectedSwitchData.mgmtIp || 'Not configured'}</span>
                </div>
                <div style={styles.divider}></div>

                <h4 style={styles.subTitle}>VLANs & I-SIDs</h4>
                <div style={styles.vlanList}>
                  {selectedSwitchData.vlans && selectedSwitchData.vlans.length > 0 ? (
                    selectedSwitchData.vlans.map((vlan, idx) => (
                      <div key={idx} style={styles.vlanItem}>
                        <div style={styles.vlanId}>
                          VLAN {vlan.vlanId}
                        </div>
                        <div style={styles.vlanName}>
                          {vlan.name}
                        </div>
                        <div style={styles.vlanIsid}>
                          I-SID: {vlan.isid || vlan.i_sid || 'N/A'}
                        </div>
                        {vlan.subnet && (
                          <div style={styles.vlanSubnet}>
                            Subnet: {vlan.subnet}
                          </div>
                        )}
                        {vlan.ip && (
                          <div style={styles.vlanIp}>
                            IP: {vlan.ip}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#999' }}>No VLANs configured</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>👆</div>
              <h4>Click a switch to view details</h4>
              <p>Select a switch from the topology diagram to see its configuration including:</p>
              <ul style={styles.featureList}>
                <li>Management IP address</li>
                <li>Assigned VLANs</li>
                <li>I-SID mappings</li>
                <li>Subnet information</li>
                <li>Device type</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Hidden PDF content (for export) */}
      <div id="pdf-content" style={{ display: 'none' }}>
        <PDFContent
          sites={exportMode === 'all' ? sites : [currentSite]}
          data={data}
        />
      </div>

      {/* Navigation */}
      <div style={styles.navButtons}>
        <button onClick={onBack} style={styles.backBtn}>
          ← Back
        </button>
        <button onClick={() => onNext(data)} style={styles.nextBtn}>
          Complete ✓
        </button>
      </div>
    </div>
  );
}

// PDF Content Component
function PDFContent({ sites, data }) {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1>FACE - Network Topology Report</h1>
        <p>Fabric Auto Configuration Engine v2.0 (V2608173)</p>
        <p style={{ color: '#999' }}>
          Generated: {new Date().toLocaleString()}
        </p>
      </div>

      {sites.map(site => (
        <div key={site.id} style={{ pageBreakAfter: 'always', marginBottom: '40px' }}>
          <h2 style={{ borderBottom: '3px solid #5B059C', paddingBottom: '10px' }}>
            📍 {site.name} (Site {site.id})
          </h2>

          {/* Site Overview */}
          <div style={{ marginTop: '20px', marginBottom: '20px' }}>
            <h3>Site Overview</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  <td style={styles.tableCell}>Total Switches</td>
                  <td style={styles.tableCell}>{site.switches.length}</td>
                </tr>
                <tr>
                  <td style={styles.tableCell}>L2 Switches</td>
                  <td style={styles.tableCell}>
                    {site.switches.filter(s => s.type === 'L2').length}
                  </td>
                </tr>
                <tr style={{ backgroundColor: '#f0f0f0' }}>
                  <td style={styles.tableCell}>L3 Switches</td>
                  <td style={styles.tableCell}>
                    {site.switches.filter(s => s.type === 'L3').length}
                  </td>
                </tr>
                <tr>
                  <td style={styles.tableCell}>Total VLANs</td>
                  <td style={styles.tableCell}>
                    {site.switches.reduce((sum, s) => sum + (s.vlans?.length || 0), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Switches Detail */}
          <h3 style={{ marginTop: '30px' }}>Switches in This Site</h3>
          {site.switches.map(sw => (
            <div key={sw.name} style={{ marginBottom: '20px', paddingLeft: '20px', borderLeft: '3px solid #5B059C' }}>
              <h4>{sw.name}</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <tbody>
                  <tr style={{ backgroundColor: '#f9f9f9' }}>
                    <td style={styles.tableCell}>Type</td>
                    <td style={styles.tableCell}>{sw.type} Switch</td>
                  </tr>
                  <tr>
                    <td style={styles.tableCell}>Management IP</td>
                    <td style={styles.tableCell}>{sw.mgmtIp || 'Not configured'}</td>
                  </tr>
                  <tr style={{ backgroundColor: '#f9f9f9' }}>
                    <td style={styles.tableCell}>VLANs</td>
                    <td style={styles.tableCell}>{sw.vlans?.length || 0}</td>
                  </tr>
                </tbody>
              </table>

              {/* VLANs */}
              {sw.vlans && sw.vlans.length > 0 && (
                <div style={{ marginTop: '10px', fontSize: '10px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#5B059C', color: 'white' }}>
                        <th style={styles.tableCell}>VLAN ID</th>
                        <th style={styles.tableCell}>Name</th>
                        <th style={styles.tableCell}>I-SID</th>
                        <th style={styles.tableCell}>Subnet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sw.vlans.map((v, idx) => (
                        <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9f9f9' }}>
                          <td style={styles.tableCell}>{v.vlanId}</td>
                          <td style={styles.tableCell}>{v.name}</td>
                          <td style={styles.tableCell}>{v.isid || v.i_sid || 'N/A'}</td>
                          <td style={styles.tableCell}>{v.subnet || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #ccc', fontSize: '10px', color: '#999' }}>
        <p>© 2026 Extreme Networks, Inc. | FACE - Fabric Auto Configuration Engine v2.0</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1400px',
    padding: '20px'
  },
  noData: {
    padding: '2rem',
    color: '#6b7280'
  },
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginTop: '20px'
  },
  leftPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  rightPanel: {
    backgroundColor: '#f9f9f9',
    border: '2px solid #E8E8E8',
    borderRadius: '8px',
    padding: '20px',
    overflow: 'auto',
    maxHeight: '800px'
  },
  siteSelector: {
    backgroundColor: 'white',
    border: '1px solid #E8E8E8',
    borderRadius: '8px',
    padding: '15px'
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#5B059C',
    marginBottom: '12px',
    marginTop: '0'
  },
  siteTabs: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  siteTab: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.2s'
  },
  switchCount: {
    fontSize: '11px',
    opacity: 0.8
  },
  canvasContainer: {
    backgroundColor: 'white',
    border: '1px solid #E8E8E8',
    borderRadius: '8px',
    padding: '15px'
  },
  canvas: {
    border: '1px solid #E8E8E8',
    borderRadius: '6px',
    backgroundColor: '#fafafa'
  },
  exportSection: {
    backgroundColor: 'white',
    border: '1px solid #E8E8E8',
    borderRadius: '8px',
    padding: '15px'
  },
  exportButtons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  exportBtn: {
    flex: 1,
    minWidth: '150px',
    padding: '10px 16px',
    backgroundColor: '#5B059C',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500'
  },
  emptyState: {
    textAlign: 'center',
    color: '#999',
    paddingTop: '40px'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  featureList: {
    textAlign: 'left',
    display: 'inline-block',
    fontSize: '13px',
    color: '#666'
  },
  detailsCard: {
    backgroundColor: 'white',
    borderRadius: '6px',
    padding: '16px',
    border: '1px solid #E8E8E8'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '12px',
    borderBottom: '1px solid #f0f0f0'
  },
  label: {
    fontWeight: 'bold',
    color: '#5B059C',
    minWidth: '120px'
  },
  value: {
    color: '#333'
  },
  divider: {
    margin: '16px 0',
    borderTop: '1px solid #E8E8E8'
  },
  subTitle: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#333',
    marginTop: '0'
  },
  vlanList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  vlanItem: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #E8E8E8',
    borderRadius: '6px',
    padding: '12px',
    fontSize: '12px'
  },
  vlanId: {
    fontWeight: 'bold',
    color: '#5B059C',
    marginBottom: '4px'
  },
  vlanName: {
    color: '#333',
    fontSize: '11px'
  },
  vlanIsid: {
    color: '#666',
    fontSize: '11px'
  },
  vlanSubnet: {
    color: '#999',
    fontSize: '10px',
    marginTop: '4px'
  },
  vlanIp: {
    color: '#999',
    fontSize: '10px'
  },
  navButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between',
    marginTop: '24px'
  },
  backBtn: {
    backgroundColor: '#E8E8E8',
    color: '#333',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  nextBtn: {
    backgroundColor: '#5B059C',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  tableCell: {
    padding: '8px 12px',
    border: '1px solid #ddd'
  }
};

export default Visualization;
