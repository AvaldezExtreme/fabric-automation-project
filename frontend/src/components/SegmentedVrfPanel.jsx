// ============================================
// Segmented VRF Panel (Fabric Engine 9.4+)
// Version: V2608274
// Purpose: Shared configuration UI for Segmented VRF - used by the intake
// wizard AND the Configure step, so projects born from an uploaded
// template/Excel file get the same feature as wizard-built ones.
// ============================================

import React from 'react';

const BRAND = { purple: '#5B059C', violet: '#7519F9', steel: '#7D76F2', success: '#00CC99' };

// VLANs whose name/type suggests they should be Untrusted
export const suggestUntrusted = (svc) =>
  /guest|iot|camera|public|dorm|byod|security/i.test(svc.name || '') || svc.deviceType === 'camera';

export const defaultSegVrf = (services = []) => {
  const classes = {};
  services.forEach(s => { classes[s.vlanId] = suggestUntrusted(s) ? 'untrusted' : 'trusted'; });
  return {
    enabled: false, vrfName: 'segvrf', vrfId: 10,
    fwVlanId: 192, fwSubnet: '192.168.254.0/24', switchIp: '192.168.254.2', fwIp: '192.168.254.1',
    classes
  };
};

// Returns an error string, or null when the config is valid / disabled
export const validateSegVrf = (segVrf, services = []) => {
  if (!segVrf || !segVrf.enabled) return null;
  const fwId = parseInt(segVrf.fwVlanId);
  if (isNaN(fwId) || fwId < 1 || fwId > 4094) return 'Segmented VRF: FW link VLAN must be 1-4094';
  if (services.some(s => parseInt(s.vlanId) === fwId)) return 'Segmented VRF: FW link VLAN must not collide with an existing VLAN';
  if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(segVrf.fwSubnet)) return 'Segmented VRF: FW link subnet must be CIDR (e.g. 192.168.254.0/24)';
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(segVrf.switchIp)) return 'Segmented VRF: switch-side IP must be a valid IP';
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(segVrf.fwIp)) return 'Segmented VRF: firewall IP must be a valid IP';
  return null;
};

const S = {
  card: { background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px', marginBottom: '14px' },
  label: { fontSize: '0.8rem', fontWeight: 700, color: 'var(--extreme-violet)', display: 'block', marginBottom: '4px' },
  input: { padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.9rem', background: 'var(--card-bg)', color: 'var(--text-primary)' }
};

function SegmentedVrfPanel({ services, value, onChange }) {
  const segVrf = value;
  const set = (patch) => onChange({ ...segVrf, ...patch });

  return (
    <div>
      <div style={S.card}>
        <label style={{ display: 'flex', gap: '10px', alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={segVrf.enabled} onChange={e => set({ enabled: e.target.checked })} style={{ width: '18px', height: '18px' }} />
          <span style={{ fontWeight: 700, color: 'var(--extreme-violet)' }}>Set up Segmented VRF (Fabric Engine 9.4+)</span>
        </label>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
          The fabric stays the default gateway for every subnet, but east-west routing is denied unless the firewall allows it.
          Requires Premier license; not supported on 4220 / 5320-16P/24P / 7830 (9.4).
        </div>
      </div>

      {segVrf.enabled && (
        <>
          <div style={S.card}>
            <span style={S.label}>Firewall link (the Unrestricted path — L3 core ↔ firewall)</span>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div><span style={S.label}>FW link VLAN</span><input style={{ ...S.input, width: '90px' }} type="number" value={segVrf.fwVlanId} onChange={e => set({ fwVlanId: e.target.value })} /></div>
              <div><span style={S.label}>Link subnet (CIDR)</span><input style={{ ...S.input, width: '180px' }} value={segVrf.fwSubnet} onChange={e => set({ fwSubnet: e.target.value })} /></div>
              <div><span style={S.label}>Switch-side IP</span><input style={{ ...S.input, width: '150px' }} value={segVrf.switchIp} onChange={e => set({ switchIp: e.target.value })} /></div>
              <div><span style={S.label}>Firewall IP (next hop)</span><input style={{ ...S.input, width: '150px' }} value={segVrf.fwIp} onChange={e => set({ fwIp: e.target.value })} /></div>
            </div>
          </div>

          <div style={S.card}>
            <span style={S.label}>Classify each VLAN</span>
            {services.map(svc => {
              const cls = segVrf.classes[svc.vlanId] || 'trusted';
              return (
                <div key={svc.vlanId} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ width: '190px', fontWeight: 600, color: 'var(--text-primary)' }}>VLAN {svc.vlanId} — {svc.name}</span>
                  {['trusted', 'untrusted'].map(opt => (
                    <label key={opt} style={{
                      padding: '4px 14px', borderRadius: '999px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                      background: cls === opt ? (opt === 'trusted' ? '#d1fae5' : '#ffedd5') : 'var(--canvas-bg)',
                      color: cls === opt ? (opt === 'trusted' ? '#065f46' : '#9a3412') : 'var(--text-secondary)',
                      border: cls === opt ? `1px solid ${opt === 'trusted' ? BRAND.success : '#FF9900'}` : '1px solid var(--border-color)'
                    }}>
                      <input type="radio" name={`segcls-${svc.vlanId}`} style={{ display: 'none' }}
                        checked={cls === opt} onChange={() => set({ classes: { ...segVrf.classes, [svc.vlanId]: opt } })} />
                      {opt === 'trusted' ? '🟢 Trusted' : '🟠 Untrusted'}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={S.card}>
            <span style={S.label}>Traffic flow preview</span>
            <SegVrfPreview services={services} classes={segVrf.classes} fwVlan={segVrf.fwVlanId} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------- live traffic-flow preview (SVG) ----------
export function SegVrfPreview({ services, classes, fwVlan }) {
  const trusted = services.filter(s => (classes[s.vlanId] || 'trusted') === 'trusted');
  const untrusted = services.filter(s => classes[s.vlanId] === 'untrusted');
  const W = 860;
  const chipH = 30, gap = 8;
  const colH = Math.max(trusted.length, untrusted.length) * (chipH + gap);
  const H = Math.max(300, 150 + colH);
  const coreY = H / 2;

  const chip = (svc, i, cls) => {
    const y = 120 + i * (chipH + gap);
    const fill = cls === 'trusted' ? '#d1fae5' : '#ffedd5';
    const stroke = cls === 'trusted' ? '#00CC99' : '#FF9900';
    const txt = cls === 'trusted' ? '#065f46' : '#9a3412';
    const colX = cls === 'trusted' ? 20 : 250;
    return (
      <g key={`${cls}-${svc.vlanId}`}>
        <rect x={colX} y={y} width="190" height={chipH} rx="8" fill={fill} stroke={stroke} />
        <text x={colX + 95} y={y + 19} textAnchor="middle" fontSize="11" fontWeight="700" fill={txt}>
          VLAN {svc.vlanId} {svc.name}
        </text>
        <line x1={colX + 190} y1={y + chipH / 2} x2={510} y2={coreY} stroke={stroke} strokeWidth="1.5" opacity="0.5" />
      </g>
    );
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: '#20004C', borderRadius: '10px', fontFamily: "'DM Sans', sans-serif" }}>
      <text x={115} y={70} textAnchor="middle" fontSize="12" fontWeight="700" fill="#6ee7b7">🟢 TRUSTED</text>
      <text x={115} y={88} textAnchor="middle" fontSize="9" fill="#a7f3d0">talk to each other + to FW</text>
      <text x={345} y={70} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fdba74">🟠 UNTRUSTED</text>
      <text x={345} y={88} textAnchor="middle" fontSize="9" fill="#fed7aa">isolated — can ONLY reach the FW</text>

      {trusted.map((s, i) => chip(s, i, 'trusted'))}
      {untrusted.map((s, i) => chip(s, i, 'untrusted'))}

      <rect x={510} y={coreY - 40} width={140} height={80} rx="12" fill="#00CC99" stroke="#fff" strokeWidth="1.5" />
      <rect x={517} y={coreY - 37} width="38" height="38" rx="8" fill="#f1f5f9" />
      <image href="/icons/switch.svg" x={522} y={coreY - 32} width="28" height="28" />
      <text x={592} y={coreY - 12} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">L3 CORE</text>
      <text x={580} y={coreY + 8} textAnchor="middle" fontSize="9.5" fill="#eafff7">Segmented VRF</text>
      <text x={580} y={coreY + 24} textAnchor="middle" fontSize="9.5" fill="#eafff7">default GW for all</text>

      <line x1={650} y1={coreY} x2={740} y2={coreY} stroke={BRAND.steel} strokeWidth="4" strokeDasharray="8 5">
        <animate attributeName="stroke-dashoffset" from="26" to="0" dur="1.2s" repeatCount="indefinite" />
      </line>
      <text x={695} y={coreY - 12} textAnchor="middle" fontSize="9" fontWeight="700" fill="#c4b5fd">UNRESTRICTED</text>
      <text x={695} y={coreY + 20} textAnchor="middle" fontSize="8.5" fill="#c4b5fd">VLAN {fwVlan}</text>

      <rect x={740} y={coreY - 35} width={100} height={70} rx="12" fill="#FF3333" stroke="#fff" strokeWidth="1.5" />
      <rect x={747} y={coreY - 31} width="36" height="36" rx="8" fill="#f1f5f9" />
      <image href="/icons/firewall.svg" x={752} y={coreY - 26} width="26" height="26" />
      <text x={806} y={coreY - 7} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">FW</text>
      <text x={790} y={coreY + 16} textAnchor="middle" fontSize="8.5" fill="#ffe4e6">decides east-west</text>

      <text x={230} y={H - 18} fontSize="10" fill="#fca5a5" fontWeight="700">✕ Untrusted ↔ Untrusted and Untrusted ↔ Trusted are BLOCKED in the fabric — only the FW can allow them</text>
    </svg>
  );
}

export default SegmentedVrfPanel;
