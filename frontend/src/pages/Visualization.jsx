// ============================================
// Topology Visualization - Interactive & PDF Export
// Version: V2608174
// Purpose: Professional fabric topology with hierarchical layout,
//          animated links, and PDF export (bundled jsPDF/html2canvas)
// ============================================

import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// ---------- Layout helpers ----------

const CANVAS_W = 1000;
const NODE_W = 168;
const NODE_H = 78;
const L2_PER_ROW = 4;

function layoutSite(switches) {
  const l3 = switches.filter(sw => sw.type === 'L3');
  const l2 = switches.filter(sw => sw.type !== 'L3');

  const positions = new Map();

  // Core row (L3) centered on top
  const coreY = 110;
  l3.forEach((sw, i) => {
    const x = (CANVAS_W / (l3.length + 1)) * (i + 1);
    positions.set(sw.name, { x, y: coreY, sw });
  });

  // Access rows (L2) below, wrapped
  const startY = l3.length > 0 ? 300 : 140;
  const rows = Math.max(1, Math.ceil(l2.length / L2_PER_ROW));
  l2.forEach((sw, i) => {
    const row = Math.floor(i / L2_PER_ROW);
    const inRow = Math.min(L2_PER_ROW, l2.length - row * L2_PER_ROW);
    const col = i % L2_PER_ROW;
    const x = (CANVAS_W / (inRow + 1)) * (col + 1);
    const y = startY + row * 170;
    positions.set(sw.name, { x, y, sw });
  });

  const height = Math.max(420, startY + rows * 170 - 40);
  return { positions, l3, l2, height };
}

function truncate(str, max = 18) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ---------- Topology SVG (shared by screen + PDF) ----------

function TopologySVG({ site, selectedSwitch, onSelect, interactive = true }) {
  const [hovered, setHovered] = useState(null);
  const { positions, l3, l2, height } = layoutSite(site.switches);

  const links = [];
  if (l3.length > 0) {
    // Core interconnect (L3 <-> L3)
    for (let i = 0; i < l3.length - 1; i++) {
      links.push({ from: l3[i].name, to: l3[i + 1].name, kind: 'core' });
    }
    // Fabric uplinks: every L2 to every L3
    l2.forEach(a => l3.forEach(c => links.push({ from: c.name, to: a.name, kind: 'fabric' })));
  } else {
    // No core: chain the access switches
    for (let i = 0; i < l2.length - 1; i++) {
      links.push({ from: l2[i].name, to: l2[i + 1].name, kind: 'fabric' });
    }
  }

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CANVAS_W} ${height}`}
      style={{ display: 'block', borderRadius: '10px', background: 'linear-gradient(160deg, #1a0533 0%, #2d0a54 55%, #1a0533 100%)' }}
    >
      <defs>
        <linearGradient id="gradL3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e6ac" />
          <stop offset="100%" stopColor="#00926b" />
        </linearGradient>
        <linearGradient id="gradL2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb340" />
          <stop offset="100%" stopColor="#e07800" />
        </linearGradient>
        <linearGradient id="gradSel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9a4dff" />
          <stop offset="100%" stopColor="#5B059C" />
        </linearGradient>
        <filter id="nodeShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Site banner */}
      <text x={CANVAS_W / 2} y="38" textAnchor="middle" fontSize="20" fontWeight="700" fill="#ffffff" opacity="0.95">
        {site.name}
      </text>
      <text x={CANVAS_W / 2} y="60" textAnchor="middle" fontSize="12" fill="#c9a8ff">
        {l3.length} core · {l2.length} access · SPB Fabric
      </text>

      {/* Links */}
      {links.map((lnk, idx) => {
        const a = positions.get(lnk.from);
        const b = positions.get(lnk.to);
        if (!a || !b) return null;

        if (lnk.kind === 'core') {
          return (
            <line
              key={`lnk-${idx}`}
              x1={a.x + NODE_W / 2 - 10} y1={a.y}
              x2={b.x - NODE_W / 2 + 10} y2={b.y}
              stroke="#00e6ac" strokeWidth="4" opacity="0.85"
              strokeDasharray="10 6"
            >
              <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1.2s" repeatCount="indefinite" />
            </line>
          );
        }

        const y1 = a.y + NODE_H / 2 - 6;
        const y2 = b.y - NODE_H / 2 + 6;
        const path = `M ${a.x} ${y1} C ${a.x} ${y1 + 70}, ${b.x} ${y2 - 70}, ${b.x} ${y2}`;
        return (
          <path
            key={`lnk-${idx}`}
            d={path}
            fill="none"
            stroke="#b57bff"
            strokeWidth="2"
            opacity="0.55"
            strokeDasharray="7 5"
          >
            <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.4s" repeatCount="indefinite" />
          </path>
        );
      })}

      {/* Nodes */}
      {Array.from(positions.values()).map(({ x, y, sw }) => {
        const isSelected = sw.name === selectedSwitch;
        const isHovered = interactive && sw.name === hovered;
        const grad = isSelected ? 'url(#gradSel)' : sw.type === 'L3' ? 'url(#gradL3)' : 'url(#gradL2)';

        return (
          <g
            key={sw.name}
            transform={`translate(${x - NODE_W / 2}, ${y - NODE_H / 2})`}
            onClick={interactive ? () => onSelect(isSelected ? null : sw.name) : undefined}
            onMouseEnter={interactive ? () => setHovered(sw.name) : undefined}
            onMouseLeave={interactive ? () => setHovered(null) : undefined}
            style={interactive ? { cursor: 'pointer' } : undefined}
            filter={isSelected || isHovered ? 'url(#glow)' : 'url(#nodeShadow)'}
          >
            {/* Chassis */}
            <rect
              width={NODE_W} height={NODE_H} rx="12"
              fill={grad}
              stroke={isSelected ? '#ffffff' : isHovered ? '#e9d5ff' : 'rgba(255,255,255,0.25)'}
              strokeWidth={isSelected ? 3 : 1.5}
            />

            {/* Status LED */}
            <circle cx="16" cy="16" r="4" fill="#3dff8f">
              <animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite" />
            </circle>

            {/* Type badge */}
            <rect x={NODE_W - 46} y="8" width="38" height="17" rx="8" fill="rgba(0,0,0,0.35)" />
            <text x={NODE_W - 27} y="20" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
              {sw.type === 'L3' ? 'CORE' : 'ACC'}
            </text>

            {/* Name */}
            <text x={NODE_W / 2} y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">
              {truncate(sw.name)}
            </text>

            {/* VLAN count */}
            <text x={NODE_W / 2} y="55" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.85)">
              {(sw.vlans?.length || 0)} VLANs{sw.closet ? ` · ${truncate(sw.closet, 10)}` : ''}
            </text>

            {/* Port strip */}
            {Array.from({ length: 10 }).map((_, p) => (
              <rect
                key={p}
                x={14 + p * 14} y={NODE_H - 13} width="9" height="6" rx="1.5"
                fill="rgba(255,255,255,0.55)"
              />
            ))}
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(20, ${height - 30})`} fontSize="11" fill="#e0ceff">
        <rect x="0" y="-10" width="14" height="10" rx="3" fill="url(#gradL3)" />
        <text x="20" y="0">Core (L3)</text>
        <rect x="95" y="-10" width="14" height="10" rx="3" fill="url(#gradL2)" />
        <text x="115" y="0">Access (L2)</text>
        <line x1="205" y1="-5" x2="235" y2="-5" stroke="#b57bff" strokeWidth="2" strokeDasharray="7 5" />
        <text x="242" y="0">Fabric link</text>
      </g>
    </svg>
  );
}

// ---------- Main page ----------

function Visualization({ data, onNext, onBack }) {
  const [selectedSite, setSelectedSite] = useState(null);
  const [selectedSwitch, setSelectedSwitch] = useState(null);
  const [exportMode, setExportMode] = useState(null);
  const [exporting, setExporting] = useState(false);

  if (!data || !data.switches || data.switches.length === 0) {
    return <div style={styles.noData}>No topology data available</div>;
  }

  // Group switches by site
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
  const selectedSwitchData = switchesInSite.find(s => s.name === selectedSwitch);

  // PDF export using bundled jsPDF + html2canvas (no CDN - blocked by CSP)
  const generatePDF = (scope) => {
    setExportMode(scope);
    setExporting(true);

    setTimeout(async () => {
      try {
        const element = document.getElementById('pdf-content');
        if (!element) throw new Error('PDF content not found');

        const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const imgH = (canvas.height * pageW) / canvas.width;

        let heightLeft = imgH;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
        heightLeft -= pageH;
        while (heightLeft > 0) {
          position -= pageH;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
          heightLeft -= pageH;
        }

        const siteName = scope === 'all' ? 'All-Sites' : currentSite.name.replace(/\s+/g, '-');
        pdf.save(`FACE-Topology-${siteName}-${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (err) {
        alert(`PDF export failed: ${err.message}`);
      } finally {
        setExportMode(null);
        setExporting(false);
      }
    }, 200);
  };

  return (
    <div className="page-visualization" style={styles.container}>
      <h2>Step 6: Network Topology Visualization</h2>
      <p className="page-description">
        Click a site to view its fabric, click any switch for full details
      </p>

      {/* Site Selector */}
      <div style={styles.siteSelector}>
        {sites.map(site => (
          <button
            key={site.id}
            onClick={() => {
              setSelectedSite(site);
              setSelectedSwitch(null);
            }}
            style={{
              ...styles.siteTab,
              background: currentSite.id === site.id
                ? 'linear-gradient(135deg, #7519F9, #5B059C)'
                : '#EFEFEF',
              color: currentSite.id === site.id ? 'white' : '#444',
              boxShadow: currentSite.id === site.id ? '0 4px 12px rgba(117,25,249,0.4)' : 'none'
            }}
          >
            📍 {site.name} <span style={styles.switchCount}>({site.switches.length})</span>
          </button>
        ))}
      </div>

      <div style={styles.mainLayout}>
        {/* Topology Canvas */}
        <div style={styles.canvasPanel}>
          <TopologySVG
            site={currentSite}
            selectedSwitch={selectedSwitch}
            onSelect={setSelectedSwitch}
          />

          {/* Export bar */}
          <div style={styles.exportBar}>
            <span style={styles.exportLabel}>📥 Export topology report:</span>
            <button onClick={() => generatePDF('site')} disabled={exporting} style={styles.exportBtn}>
              {exporting && exportMode === 'site' ? 'Generating…' : `📄 ${truncate(currentSite.name, 22)}`}
            </button>
            <button
              onClick={() => generatePDF('all')}
              disabled={exporting}
              style={{ ...styles.exportBtn, background: 'linear-gradient(135deg, #00CC99, #00926b)' }}
            >
              {exporting && exportMode === 'all' ? 'Generating…' : '📊 All Sites'}
            </button>
          </div>
        </div>

        {/* Details Panel */}
        <div style={styles.rightPanel}>
          {selectedSwitchData ? (
            <div>
              <h3 style={styles.sectionTitle}>🖥️ {selectedSwitchData.name}</h3>

              <div style={styles.detailsCard}>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Type</span>
                  <span style={{
                    ...styles.typeBadge,
                    background: selectedSwitchData.type === 'L3'
                      ? 'linear-gradient(135deg, #00CC99, #00926b)'
                      : 'linear-gradient(135deg, #ffb340, #e07800)'
                  }}>
                    {selectedSwitchData.type === 'L3' ? 'Core (L3)' : 'Access (L2)'}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Site</span>
                  <span style={styles.value}>{selectedSwitchData.location || selectedSwitchData.siteId}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Closet</span>
                  <span style={styles.value}>{selectedSwitchData.closet || '—'}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Mgmt VLAN</span>
                  <span style={styles.value}>{selectedSwitchData.mgmtVlan || '—'}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.label}>Gateway</span>
                  <span style={styles.value}>{selectedSwitchData.defaultGateway || '—'}</span>
                </div>
                {selectedSwitchData.mgmtIp && (
                  <div style={styles.detailRow}>
                    <span style={styles.label}>Mgmt IP</span>
                    <span style={styles.value}>{selectedSwitchData.mgmtIp}</span>
                  </div>
                )}

                <h4 style={styles.subTitle}>
                  VLANs & I-SIDs ({selectedSwitchData.vlans?.length || 0})
                </h4>
                <div style={styles.vlanList}>
                  {selectedSwitchData.vlans && selectedSwitchData.vlans.length > 0 ? (
                    selectedSwitchData.vlans.map((vlan, idx) => (
                      <div key={idx} style={styles.vlanItem}>
                        <div style={styles.vlanHeader}>
                          <span style={styles.vlanId}>VLAN {vlan.vlanId}</span>
                          <span style={styles.vlanNameTag}>{vlan.vlanName || vlan.name || ''}</span>
                        </div>
                        <div style={styles.vlanMeta}>
                          I-SID {vlan.isid || vlan.i_sid || '—'}
                          {vlan.subnet ? ` · ${vlan.subnet}` : ''}
                          {vlan.ip ? ` · ${vlan.ip}` : ''}
                        </div>
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
              <div style={styles.emptyIcon}>🔍</div>
              <h4>Select a switch</h4>
              <p style={{ fontSize: '13px' }}>
                Click any switch in the diagram to see its VLANs, I-SIDs, subnets, and management details.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Off-screen PDF content (html2canvas can't capture display:none) */}
      <div id="pdf-content" style={styles.pdfHolder}>
        {exportMode && (
          <PDFContent sites={exportMode === 'all' ? sites : [currentSite]} />
        )}
      </div>

      {/* Navigation */}
      <div style={styles.navButtons}>
        <button onClick={onBack} style={styles.backBtn}>
          ← Back
        </button>
        <button onClick={() => onNext(data)} style={styles.nextBtn}>
          Test & Verify →
        </button>
      </div>
    </div>
  );
}

// ---------- PDF report content ----------

function PDFContent({ sites }) {
  return (
    <div style={{ padding: '24px', fontFamily: 'Arial, sans-serif', width: '1350px', background: '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ color: '#5B059C', marginBottom: '4px' }}>FACE — Network Topology Report</h1>
        <p style={{ margin: 0 }}>Fabric Auto Configuration Engine</p>
        <p style={{ color: '#999', margin: '4px 0 0' }}>Generated: {new Date().toLocaleString()}</p>
      </div>

      {sites.map(site => (
        <div key={site.id} style={{ marginBottom: '36px' }}>
          <h2 style={{ borderBottom: '3px solid #5B059C', paddingBottom: '8px' }}>
            📍 {site.name} (Site {site.id})
          </h2>

          {/* Topology diagram */}
          <div style={{ margin: '16px 0' }}>
            <TopologySVG site={site} selectedSwitch={null} onSelect={() => {}} interactive={false} />
          </div>

          {/* Per-switch tables */}
          {site.switches.map(sw => (
            <div key={sw.name} style={{ marginBottom: '18px', paddingLeft: '16px', borderLeft: '4px solid #5B059C' }}>
              <h4 style={{ margin: '8px 0' }}>
                {sw.name} — {sw.type === 'L3' ? 'Core (L3)' : 'Access (L2)'}
                {sw.closet ? ` — ${sw.closet}` : ''}
              </h4>
              {sw.vlans && sw.vlans.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
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
                      <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f6f0fc' }}>
                        <td style={styles.tableCell}>{v.vlanId}</td>
                        <td style={styles.tableCell}>{v.vlanName || v.name || ''}</td>
                        <td style={styles.tableCell}>{v.isid || v.i_sid || '—'}</td>
                        <td style={styles.tableCell}>{v.subnet || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '1px solid #ccc', fontSize: '10px', color: '#999' }}>
        <p>© 2026 Extreme Networks, Inc. | FACE — Fabric Auto Configuration Engine</p>
      </div>
    </div>
  );
}

// ---------- Styles ----------

const styles = {
  container: {
    maxWidth: '1500px',
    padding: '20px'
  },
  noData: {
    padding: '2rem',
    color: '#6b7280'
  },
  siteSelector: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginTop: '16px',
    marginBottom: '16px'
  },
  siteTab: {
    padding: '10px 18px',
    border: 'none',
    borderRadius: '999px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  switchCount: {
    fontSize: '11px',
    opacity: 0.85
  },
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '20px',
    alignItems: 'start'
  },
  canvasPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  exportBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap'
  },
  exportLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#5B059C'
  },
  exportBtn: {
    padding: '9px 16px',
    background: 'linear-gradient(135deg, #7519F9, #5B059C)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600'
  },
  rightPanel: {
    backgroundColor: '#faf8fd',
    border: '1px solid #e9defa',
    borderRadius: '10px',
    padding: '18px',
    overflow: 'auto',
    maxHeight: '760px'
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 'bold',
    color: '#5B059C',
    marginTop: 0,
    marginBottom: '12px'
  },
  detailsCard: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #e9defa'
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #f3edfb'
  },
  label: {
    fontWeight: 'bold',
    color: '#5B059C',
    fontSize: '12px'
  },
  value: {
    color: '#333',
    fontSize: '13px'
  },
  typeBadge: {
    color: 'white',
    padding: '4px 10px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: '700'
  },
  subTitle: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#333',
    margin: '16px 0 10px'
  },
  vlanList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  vlanItem: {
    background: 'linear-gradient(135deg, #faf8fd, #f3edfb)',
    border: '1px solid #e9defa',
    borderRadius: '8px',
    padding: '10px 12px'
  },
  vlanHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px'
  },
  vlanId: {
    fontWeight: 'bold',
    color: '#5B059C',
    fontSize: '12px'
  },
  vlanNameTag: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#333',
    background: '#fff',
    border: '1px solid #e9defa',
    borderRadius: '999px',
    padding: '2px 8px'
  },
  vlanMeta: {
    fontSize: '11px',
    color: '#777'
  },
  emptyState: {
    textAlign: 'center',
    color: '#999',
    paddingTop: '40px'
  },
  emptyIcon: {
    fontSize: '42px',
    marginBottom: '12px'
  },
  pdfHolder: {
    position: 'absolute',
    left: '-99999px',
    top: 0
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
    background: 'linear-gradient(135deg, #7519F9, #5B059C)',
    color: 'white',
    border: 'none',
    padding: '12px 28px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  tableCell: {
    padding: '6px 10px',
    border: '1px solid #ddd',
    textAlign: 'left'
  }
};

export default Visualization;
