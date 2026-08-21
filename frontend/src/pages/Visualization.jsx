// ============================================
// Topology Visualization - Interactive & PDF Export
// Version: V2608211
// Purpose: Closet-accurate fabric topology (MDF root, access closets
//          star off it, in-closet chains) with Extreme brand palette
//          and per-site PDF export.
// ============================================

import React, { useState } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { buildClosetTopology } from '../utils/closetTopology.js';

// Extreme Networks approved palette (see ExtremeTheme.css)
const BRAND = {
  purple: '#5B059C',
  indigo: '#20004C',
  violet: '#7519F9',
  steel: '#7D76F2',
  success: '#00CC99',
  warning: '#FF9900'
};

const CANVAS_W = 1000;
const NODE_W = 164;
const NODE_H = 74;
const CLOSETS_PER_ROW = 5;
const STACK_GAP = 34;

function layoutSite(switches) {
  const topo = buildClosetTopology(switches);
  const positions = new Map();

  // MDF closet: horizontal rows across the top, root first.
  // Wraps when the closet is too wide for the canvas (e.g. 7 MDF switches).
  const mdfList = topo.closets.get(topo.mdfKey) || [];
  const MDF_PER_ROW = Math.max(1, Math.floor((CANVAS_W - 40) / (NODE_W + 30)));
  const mdfRows = Math.max(1, Math.ceil(mdfList.length / MDF_PER_ROW));
  mdfList.forEach((sw, i) => {
    const row = Math.floor(i / MDF_PER_ROW);
    const inRow = Math.min(MDF_PER_ROW, mdfList.length - row * MDF_PER_ROW);
    const col = i % MDF_PER_ROW;
    const x = CANVAS_W / 2 + (col - (inRow - 1) / 2) * (NODE_W + 30);
    positions.set(sw.name, { x, y: 120 + row * (NODE_H + STACK_GAP), sw });
  });

  // Access closets: columns below, each closet a vertical stack
  let y = 120 + (mdfRows - 1) * (NODE_H + STACK_GAP) + 180;
  const keys = topo.accessClosets;
  for (let r = 0; r * CLOSETS_PER_ROW < keys.length; r++) {
    const rowKeys = keys.slice(r * CLOSETS_PER_ROW, (r + 1) * CLOSETS_PER_ROW);
    let maxStack = 1;
    rowKeys.forEach((key, c) => {
      const list = topo.closets.get(key);
      maxStack = Math.max(maxStack, list.length);
      const x = (CANVAS_W / (rowKeys.length + 1)) * (c + 1);
      list.forEach((sw, i) => {
        positions.set(sw.name, { x, y: y + i * (NODE_H + STACK_GAP), sw });
      });
    });
    y += maxStack * (NODE_H + STACK_GAP) + 60;
  }

  const height = Math.max(430, y - 10);
  return { positions, topo, height };
}

function truncate(str, max = 18) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

// ---------- Topology SVG (shared by screen + PDF) ----------

function TopologySVG({ site, selectedSwitch, onSelect, interactive = true }) {
  const [hovered, setHovered] = useState(null);
  const { positions, topo, height } = layoutSite(site.switches);
  const mdfCount = (topo.closets.get(topo.mdfKey) || []).length;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${CANVAS_W} ${height}`}
      style={{
        display: 'block',
        borderRadius: '10px',
        background: `linear-gradient(160deg, ${BRAND.indigo} 0%, #3a0d78 55%, ${BRAND.indigo} 100%)`,
        fontFamily: "'DM Sans', -apple-system, 'Segoe UI', sans-serif"
      }}
    >
      <defs>
        <linearGradient id="gradMdf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRAND.success} />
          <stop offset="100%" stopColor="#00926b" />
        </linearGradient>
        <linearGradient id="gradAcc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRAND.warning} />
          <stop offset="100%" stopColor="#cc7a00" />
        </linearGradient>
        <linearGradient id="gradSel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BRAND.violet} />
          <stop offset="100%" stopColor={BRAND.purple} />
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
        MDF ({mdfCount} switch{mdfCount === 1 ? '' : 'es'}) · {topo.accessClosets.length} access closet{topo.accessClosets.length === 1 ? '' : 's'} · SPB Fabric
      </text>

      {/* Links */}
      {topo.links.map((lnk, idx) => {
        const a = positions.get(lnk.from);
        const b = positions.get(lnk.to);
        if (!a || !b) return null;

        if (lnk.kind === 'chain') {
          // Same closet. Three shapes: horizontal (same MDF row), straight
          // vertical (access stack), or a curve when an MDF row wraps.
          const sameRow = Math.abs(a.y - b.y) < 2;
          const sameCol = Math.abs(a.x - b.x) < 2;

          if (!sameRow && !sameCol) {
            // Wrapped MDF row: curve from end of one row to start of the next
            const y1 = a.y + NODE_H / 2 - 4;
            const y2 = b.y - NODE_H / 2 + 4;
            const path = `M ${a.x} ${y1} C ${a.x} ${y1 + 50}, ${b.x} ${y2 - 50}, ${b.x} ${y2}`;
            return (
              <path
                key={`lnk-${idx}`}
                d={path} fill="none"
                stroke={BRAND.success} strokeWidth="3" opacity="0.85"
                strokeDasharray="8 5"
              >
                <animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.2s" repeatCount="indefinite" />
              </path>
            );
          }

          const x1 = sameRow ? a.x + NODE_W / 2 - 8 : a.x;
          const y1 = sameRow ? a.y : a.y + NODE_H / 2 - 4;
          const x2 = sameRow ? b.x - NODE_W / 2 + 8 : b.x;
          const y2 = sameRow ? b.y : b.y - NODE_H / 2 + 4;
          return (
            <line
              key={`lnk-${idx}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={BRAND.success} strokeWidth="3" opacity="0.85"
              strokeDasharray="8 5"
            >
              <animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.2s" repeatCount="indefinite" />
            </line>
          );
        }

        // Uplink: curve from MDF root down to the closet head
        const y1 = a.y + NODE_H / 2 - 6;
        const y2 = b.y - NODE_H / 2 + 6;
        const path = `M ${a.x} ${y1} C ${a.x} ${y1 + 70}, ${b.x} ${y2 - 70}, ${b.x} ${y2}`;
        return (
          <path
            key={`lnk-${idx}`}
            d={path}
            fill="none"
            stroke={BRAND.steel}
            strokeWidth="2"
            opacity="0.6"
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
        const inMdf = ((sw.closet || sw.name || '').toString().toUpperCase().includes('MDF'));
        const grad = isSelected ? 'url(#gradSel)' : inMdf ? 'url(#gradMdf)' : 'url(#gradAcc)';

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
            <rect
              width={NODE_W} height={NODE_H} rx="12"
              fill={grad}
              stroke={isSelected ? '#ffffff' : isHovered ? '#e9d5ff' : 'rgba(255,255,255,0.25)'}
              strokeWidth={isSelected ? 3 : 1.5}
            />

            <circle cx="15" cy="15" r="4" fill="#3dff8f">
              <animate attributeName="opacity" values="1;0.35;1" dur="2s" repeatCount="indefinite" />
            </circle>

            <rect x={NODE_W - 40} y="8" width="32" height="16" rx="8" fill="rgba(0,0,0,0.35)" />
            <text x={NODE_W - 24} y="20" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
              {sw.type || 'L2'}
            </text>

            <text x={NODE_W / 2} y="38" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#fff">
              {truncate(sw.name)}
            </text>

            <text x={NODE_W / 2} y="52" textAnchor="middle" fontSize="9.5" fill="rgba(255,255,255,0.85)">
              {(sw.vlans?.length || 0)} VLANs
            </text>

            {Array.from({ length: 10 }).map((_, p) => (
              <rect
                key={p}
                x={12 + p * 14} y={NODE_H - 12} width="9" height="5.5" rx="1.5"
                fill="rgba(255,255,255,0.55)"
              />
            ))}
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(20, ${height - 26})`} fontSize="11" fill="#e0ceff">
        <rect x="0" y="-10" width="14" height="10" rx="3" fill="url(#gradMdf)" />
        <text x="20" y="0">MDF closet</text>
        <rect x="105" y="-10" width="14" height="10" rx="3" fill="url(#gradAcc)" />
        <text x="125" y="0">Access closet</text>
        <line x1="230" y1="-5" x2="258" y2="-5" stroke={BRAND.steel} strokeWidth="2" strokeDasharray="7 5" />
        <text x="265" y="0">Uplink to MDF</text>
        <line x1="370" y1="-5" x2="398" y2="-5" stroke={BRAND.success} strokeWidth="3" strokeDasharray="8 5" />
        <text x="405" y="0">In-closet chain</text>
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

  // PDF export: capture each site section separately. One giant capture
  // exceeds the browser's max canvas size on multi-site districts, which
  // produced blank PDFs - per-section capture keeps every page rendered.
  const generatePDF = (scope) => {
    setExportMode(scope);
    setExporting(true);

    setTimeout(async () => {
      try {
        const element = document.getElementById('pdf-content');
        if (!element) throw new Error('PDF content not found');

        const sections = element.querySelectorAll('.pdf-site');
        if (sections.length === 0) throw new Error('Nothing to export');

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        let firstPage = true;

        for (const section of sections) {
          const canvas = await html2canvas(section, { scale: 2, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          const imgH = (canvas.height * pageW) / canvas.width;

          let heightLeft = imgH;
          let position = 0;
          if (!firstPage) pdf.addPage();
          firstPage = false;
          pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
          heightLeft -= pageH;
          while (heightLeft > 0) {
            position -= pageH;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH);
            heightLeft -= pageH;
          }
        }

        const siteName = scope === 'all' ? 'All-Sites' : currentSite.name.replace(/\s+/g, '-');
        pdf.save(`FACE-Topology-${siteName}-${new Date().toISOString().split('T')[0]}.pdf`);
      } catch (err) {
        alert(`PDF export failed: ${err.message}`);
      } finally {
        setExportMode(null);
        setExporting(false);
      }
    }, 250);
  };

  return (
    <div className="page-visualization" style={styles.container}>
      <h2>Step 6: Network Topology Visualization</h2>
      <p className="page-description">
        Closet-accurate fabric view - access closets uplink to the MDF, switches chain within each closet
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
                ? `linear-gradient(135deg, ${BRAND.violet}, ${BRAND.purple})`
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
              style={{ ...styles.exportBtn, background: `linear-gradient(135deg, ${BRAND.success}, #00926b)` }}
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
                      ? `linear-gradient(135deg, ${BRAND.success}, #00926b)`
                      : `linear-gradient(135deg, ${BRAND.warning}, #cc7a00)`
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
// Each .pdf-site block is captured as its own canvas (and PDF page set)

function PDFContent({ sites }) {
  return (
    <div style={{ padding: '24px', fontFamily: "'DM Sans', Arial, sans-serif", width: '1350px', background: '#fff' }}>
      <div className="pdf-site" style={{ textAlign: 'center', padding: '16px', background: '#fff' }}>
        <h1 style={{ color: BRAND.purple, marginBottom: '4px' }}>FACE — Network Topology Report</h1>
        <p style={{ margin: 0 }}>Fabric Auto Configuration Engine</p>
        <p style={{ color: '#999', margin: '4px 0 0' }}>Generated: {new Date().toLocaleString()}</p>
        <p style={{ color: '#666', margin: '10px 0 0', fontSize: '13px' }}>
          {sites.length} site{sites.length === 1 ? '' : 's'} · {sites.reduce((n, s) => n + s.switches.length, 0)} switches
        </p>
      </div>

      {sites.map(site => (
        <div key={site.id} className="pdf-site" style={{ marginBottom: '24px', background: '#fff', padding: '8px 0' }}>
          <h2 style={{ borderBottom: `3px solid ${BRAND.purple}`, paddingBottom: '8px' }}>
            📍 {site.name} (Site {site.id})
          </h2>

          <div style={{ margin: '16px 0' }}>
            <TopologySVG site={site} selectedSwitch={null} onSelect={() => {}} interactive={false} />
          </div>

          {site.switches.map(sw => (
            <div key={sw.name} style={{ marginBottom: '18px', paddingLeft: '16px', borderLeft: `4px solid ${BRAND.purple}` }}>
              <h4 style={{ margin: '8px 0' }}>
                {sw.name} — {sw.type === 'L3' ? 'Core (L3)' : 'Access (L2)'}
                {sw.closet ? ` — ${sw.closet}` : ''}
              </h4>
              {sw.vlans && sw.vlans.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ backgroundColor: BRAND.purple, color: 'white' }}>
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

          <div style={{ paddingTop: '8px', fontSize: '10px', color: '#999' }}>
            © 2026 Extreme Networks, Inc. | FACE — Fabric Auto Configuration Engine
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Styles ----------

const styles = {
  container: {
    maxWidth: '100%',
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
    color: BRAND.purple
  },
  exportBtn: {
    padding: '9px 16px',
    background: `linear-gradient(135deg, ${BRAND.violet}, ${BRAND.purple})`,
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
    color: BRAND.purple,
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
    color: BRAND.purple,
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
    color: BRAND.purple,
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
    background: `linear-gradient(135deg, ${BRAND.violet}, ${BRAND.purple})`,
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
