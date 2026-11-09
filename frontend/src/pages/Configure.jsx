import React, { useState } from 'react';
import SegmentedVrfPanel, { defaultSegVrf, validateSegVrf } from '../components/SegmentedVrfPanel.jsx';
import BulkImportModal from '../components/BulkImportModal';
import { FE_MTU_NOTE, FE_PLATFORM_NOTE, validateFabricExtend, applyFabricExtend, cfgFromSwitches, feEndpointIds } from '../utils/fabricExtend.js';
import { INTERCONNECTS, interconnectFromArchitecture, serviceSiteIds, validateSiteServices, applySiteServices, siteServicesFromSwitches, ONBOARDING_VLAN, ONBOARDING_ISID } from '../utils/siteServices.js';

function Configure({ data, onNext, onError }) {
  // Initialize from saved/previous data so revisiting this step (or resuming
  // a saved project) shows the serials and settings already entered
  const hasSavedSerials = data.serialMap && Object.keys(data.serialMap).length > 0;
  const [serialMap, setSerialMap] = useState(hasSavedSerials ? data.serialMap : {});
  const [skipSerials, setSkipSerials] = useState(data.skipSerials || false);
  const [serialMode, setSerialMode] = useState(hasSavedSerials ? 'manual' : null); // null, 'manual', 'bulk'
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [settings, setSettings] = useState({
    dhcpServer1: '10.1.1.202',
    dhcpServer2: '10.1.1.207',
    ...(data.settings || {})
  });

  // Unique VLAN list across the project - lets ANY project (uploaded
  // template, Excel, or wizard-built) opt into Segmented VRF here
  const vlanServices = (() => {
    const seen = new Map();
    (data.switches || []).forEach(sw => (sw.vlans || []).forEach(v => {
      if (!seen.has(v.vlanId)) seen.set(v.vlanId, { vlanId: v.vlanId, name: v.vlanName || v.name || `VLAN ${v.vlanId}`, deviceType: v.deviceType });
    }));
    return [...seen.values()].sort((a, b) => a.vlanId - b.vlanId);
  })();

  const [segVrf, setSegVrf] = useState(() => {
    const saved = data.settings && data.settings.segmentedVrf;
    return saved ? { ...defaultSegVrf(vlanServices), ...saved, enabled: true } : defaultSegVrf(vlanServices);
  });

  // SSID VLANs (delivered by Fabric Attach on Extreme wireless) - seeded from
  // saved settings and from wizard-flagged vlans, editable for ANY project
  const [ssidVlanIds, setSsidVlanIds] = useState(() => {
    const ids = new Set((data.settings && data.settings.ssidVlanIds) || []);
    (data.switches || []).forEach(sw => (sw.vlans || []).forEach(v => { if (v.ssid) ids.add(v.vlanId); }));
    return [...ids];
  });
  const toggleSsidVlan = (vlanId) => {
    setSsidVlanIds(prev => prev.includes(vlanId) ? prev.filter(id => id !== vlanId) : [...prev, vlanId]);
  };

  // Fabric Extend - available to ANY project. Sites come from the parsed
  // switches; wizard projects (switches already carrying fabricExtend) open
  // pre-filled, everything else starts off.
  const feSites = (() => {
    const seen = new Map();
    (data.switches || []).forEach(sw => {
      if (!seen.has(sw.siteId)) seen.set(sw.siteId, { siteId: sw.siteId, label: sw.isidPrefix || sw.serviceApp || `Site ${sw.siteId}`, location: sw.location || '' });
    });
    return [...seen.values()].sort((a, b) => a.siteId - b.siteId);
  })();
  const [feCfg, setFeCfg] = useState(() => {
    const existing = cfgFromSwitches(data.switches || []);
    if (existing) return existing;
    // feCfg.hubSiteId doubles as the CORE site for every interconnect mode
    const saved = feSites.find(s => s.siteId === (data.settings || {}).coreSiteId);
    const hub = saved || feSites.find(s => /^CO$/i.test(s.label)) || feSites[0];
    return { enabled: false, hubSiteId: hub ? hub.siteId : null, sites: {} };
  });
  const setFeSite = (siteId, patch) => setFeCfg(prev => ({ ...prev, sites: { ...prev.sites, [siteId]: { ...(prev.sites[siteId] || {}), ...patch } } }));

  // How the sites are connected decides which cores get the onboarding
  // gateway and an uplink (see utils/siteServices.js). Unknown projects start
  // as "one fabric": the safe default - a missing gateway only delays
  // onboarding, while extra gateways on the shared onboarding I-SID break it.
  const [interconnect, setInterconnect] = useState(() =>
    (data.settings || {}).siteInterconnect
    || (cfgFromSwitches(data.switches || []) ? 'extend' : null)
    || interconnectFromArchitecture((data.settings || {}).fabricArchitecture)
    || 'single');
  const chooseInterconnect = (mode) => {
    setInterconnect(mode);
    setFeCfg(prev => ({ ...prev, enabled: mode === 'extend' }));
  };
  const [svc, setSvc] = useState(() => siteServicesFromSwitches(data.switches || [], data.settings || {}));
  const setSvcSite = (siteId, patch) => setSvc(prev => ({ ...prev, sites: { ...prev.sites, [siteId]: { ...(prev.sites[siteId] || {}), ...patch } } }));
  const setUplink = (siteId, patch) => setSvc(prev => {
    const cur = prev.sites[siteId] || {};
    return { ...prev, sites: { ...prev.sites, [siteId]: { ...cur, uplink: { ...(cur.uplink || {}), ...patch } } } };
  });
  // Fabric Extend is on exactly when the interconnect says so (and 2+ sites)
  const feEff = { ...feCfg, enabled: interconnect === 'extend' && feSites.length >= 2 };
  const svcSiteIds = serviceSiteIds(interconnect, feCfg.hubSiteId, feSites.map(s => s.siteId));

  const handleSerialChange = (switchName, value) => {
    setSerialMap({
      ...serialMap,
      [switchName]: value
    });
  };

  const handleSettingChange = (key, value) => {
    setSettings({
      ...settings,
      [key]: value
    });
  };

  const handleBulkImportComplete = (importedMap) => {
    // Convert imported map to proper structure
    const structuredMap = {};
    Object.entries(importedMap).forEach(([switchName, serial]) => {
      const switchData = data.switches.find(s => s.name === switchName);
      if (switchData) {
        structuredMap[switchName] = {
          serial: serial,
          serialNumber: serial,
          siteId: switchData.siteId,
          site: switchData.siteId,
          type: switchData.type,
          location: switchData.location
        };
      }
    });
    setSerialMap(structuredMap);
    setSerialMode('manual'); // Show manual mode to allow edits
    setShowBulkModal(false);
  };

  const validateSerials = () => {
    // If skipping serials, no validation needed
    if (skipSerials) {
      return true;
    }

    // If serial mode is set, require all serials
    if (serialMode) {
      for (const sw of data.switches) {
        const serial = serialMap[sw.name];
        if (!serial || (typeof serial === 'string' && serial.trim() === '') || 
            (typeof serial === 'object' && (!serial.serial || serial.serial.trim() === ''))) {
          onError(`Serial number required for switch: ${sw.name}`);
          return false;
        }
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateSerials()) {
      // Build properly structured serialMap
      const structuredSerialMap = {};
      
      if (!skipSerials && serialMode) {
        data.switches.forEach(sw => {
          const serial = serialMap[sw.name];
          if (serial) {
            // Handle both string and object formats
            if (typeof serial === 'string') {
              structuredSerialMap[sw.name] = {
                serial: serial,
                serialNumber: serial,
                siteId: sw.siteId,
                site: sw.siteId,
                type: sw.type,
                location: sw.location
              };
            } else if (typeof serial === 'object') {
              structuredSerialMap[sw.name] = serial;
            }
          }
        });
      }

      console.log('DEBUG Configure: skipSerials =', skipSerials);
      console.log('DEBUG Configure: serialMode =', serialMode);
      console.log('DEBUG Configure: structuredSerialMap =', structuredSerialMap);

      const segErr = validateSegVrf(segVrf, vlanServices);
      if (segErr) {
        onError(segErr);
        return;
      }

      const feErr = validateFabricExtend(feEff, feSites, data.switches, vlanServices.map(v => v.vlanId));
      if (feErr) {
        onError(feErr);
        return;
      }

      const svcErr = validateSiteServices(svc, interconnect, feCfg.hubSiteId, feSites, data.switches, vlanServices.map(v => v.vlanId), feEff);
      if (svcErr) {
        onError(svcErr);
        return;
      }

      onNext({
        ...data,
        // FE tunnels, onboarding gateways and uplinks live on the site cores;
        // rebuilt every time so changing the interconnect (or a site) never
        // leaves a stale block behind
        switches: applySiteServices(applyFabricExtend(data.switches, feEff, feSites), svc, interconnect, feCfg.hubSiteId),
        serialMap: structuredSerialMap,
        settings: {
          ...settings, ssidVlanIds, segmentedVrf: segVrf.enabled ? segVrf : null,
          siteInterconnect: interconnect, coreSiteId: feCfg.hubSiteId, onboardingGateway: svc.onboarding
        },
        skipSerials
      });
    }
  };

  const handleSkipSerials = () => {
    setSkipSerials(true);
    setSerialMode(null);
  };

  const handleSelectSerialMode = (mode) => {
    setSerialMode(mode);
    if (mode === 'bulk') {
      setShowBulkModal(true);
    }
  };

  const getSerialProgress = () => {
    if (!serialMode) return 0;
    const filled = Object.values(serialMap).filter(s => {
      if (typeof s === 'string') return s.trim();
      if (typeof s === 'object') return s.serial && s.serial.trim();
      return false;
    }).length;
    return Math.round((filled / data.switches.length) * 100);
  };

  return (
    <div className="page-configure">
      <h2>Step 2: Configure Serial Numbers & Settings</h2>
      <p className="page-description">Enter hardware serial numbers and system settings</p>

      <div className="grid grid-2" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div className="stat-value">{data.switches.length}</div>
          <div className="stat-label">Switches Found</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.switches.filter(s => s.type === 'L3').length}</div>
          <div className="stat-label">Layer 3 Switches</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.switches.filter(s => s.type === 'L2').length}</div>
          <div className="stat-label">Layer 2 Switches</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.vlanCount}</div>
          <div className="stat-label">Total VLANs</div>
        </div>
      </div>

      {/* SERIAL CONFIGURATION */}
      {!skipSerials && !serialMode && (
        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f0f9ff', borderRadius: '0.5rem', border: '1px solid #0ea5e9' }}>
          <h3 style={{ marginTop: 0 }}>Serial Numbers (Optional)</h3>
          <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
            How would you like to provide hardware serial numbers?
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <button
              onClick={() => handleSelectSerialMode('manual')}
              style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => e.target.style.background = '#f9fafb'}
              onMouseLeave={(e) => e.target.style.background = 'white'}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✎</div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Manual Entry</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Type each serial number
              </div>
            </button>

            <button
              onClick={() => handleSelectSerialMode('bulk')}
              style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center'
              }}
              onMouseEnter={(e) => e.target.style.background = '#f9fafb'}
              onMouseLeave={(e) => e.target.style.background = 'white'}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📤</div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Bulk Import</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                Upload CSV or Excel
              </div>
            </button>
          </div>

          <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '1.5rem' }}>
            <button
              onClick={handleSkipSerials}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'none',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#6b7280',
                fontSize: '0.9rem'
              }}
            >
              Skip - I'll add serials later
            </button>
          </div>
        </div>
      )}

      {/* SKIPPED SERIALS STATE */}
      {skipSerials && (
        <div style={{ marginBottom: '2rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #f59e0b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>⚠️ Serial numbers skipped</strong>
            <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
              You can add them later. The mgmt.csv file will not be generated without serial numbers.
            </p>
          </div>
          <button
            onClick={() => setSkipSerials(false)}
            className="btn btn-secondary btn-small"
          >
            Add Serials
          </button>
        </div>
      )}

      {/* MANUAL ENTRY MODE */}
      {serialMode === 'manual' && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Serial Numbers</h3>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              Progress: <strong>{getSerialProgress()}%</strong>
            </div>
          </div>
          <p style={{ marginBottom: '1rem', color: '#6b7280' }}>Enter the hardware serial number for each switch:</p>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{
              width: '100%',
              height: '8px',
              background: '#e5e7eb',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${getSerialProgress()}%`,
                height: '100%',
                background: '#7519F9',
                transition: 'width 0.2s'
              }}></div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <button
              onClick={() => { setSerialMode(null); setSerialMap({}); }}
              className="btn btn-secondary btn-small"
            >
              ← Change Input Method
            </button>
            <button
              onClick={() => setShowBulkModal(true)}
              className="btn btn-primary btn-small"
            >
              📤 Or Use Bulk Import
            </button>
          </div>
          
          {data.switches.map((sw) => {
            const serial = serialMap[sw.name];
            const serialValue = typeof serial === 'string' ? serial : (serial?.serial || '');
            
            return (
              <div key={sw.name} className="form-group">
                <label>
                  {sw.name}
                  <span style={{ fontSize: '0.85rem', marginLeft: '0.5rem', color: '#6b7280' }}>
                    ({sw.type} - Site {sw.siteId})
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., JA072336G-00237"
                  value={serialValue}
                  onChange={(e) => handleSerialChange(sw.name, e.target.value)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* SYSTEM SETTINGS */}
      <div style={{ marginBottom: '2rem' }}>
        <h3>System Settings</h3>
        
        <div className="form-group">
          <label>DHCP Server 1</label>
          <input
            type="text"
            value={settings.dhcpServer1}
            onChange={(e) => handleSettingChange('dhcpServer1', e.target.value)}
            placeholder="10.1.1.202"
          />
          <div className="help-text">Primary DHCP relay address</div>
        </div>

        <div className="form-group">
          <label>DHCP Server 2</label>
          <input
            type="text"
            value={settings.dhcpServer2}
            onChange={(e) => handleSettingChange('dhcpServer2', e.target.value)}
            placeholder="10.1.1.207"
          />
          <div className="help-text">Secondary DHCP relay address</div>
        </div>
      </div>

      {/* NAVIGATION */}
      <div style={{ marginTop: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h3>🌐 Environment</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          These answers keep the .cfg files clean — only the commands your environment actually needs.
        </p>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Wireless vendor</div>
            {[['Extreme (Fabric Attach)', true], ['Other', false]].map(([lbl, val]) => (
              <label key={lbl} style={{ marginRight: '12px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="radio" name="cfg-wenv" checked={(settings.extremeWireless === true) === val}
                  onChange={() => setSettings({ ...settings, extremeWireless: val })} /> {lbl}
              </label>
            ))}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>SSID VLANs ride Fabric Attach — skipped on L2 access switches</div>
            {settings.extremeWireless === true && (
              <div style={{ marginTop: '8px', padding: '8px 10px', background: 'var(--canvas-bg)', borderRadius: '8px', maxWidth: '360px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>Which VLANs are allotted to SSIDs?</div>
                {vlanServices.map(v => (
                  <label key={v.vlanId} style={{ display: 'block', fontSize: '0.82rem', cursor: 'pointer', padding: '1px 0' }}>
                    <input type="checkbox" checked={ssidVlanIds.includes(v.vlanId)} onChange={() => toggleSsidVlan(v.vlanId)} />
                    {' '}VLAN {v.vlanId} — {v.name}
                  </label>
                ))}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Checked VLANs stay on the L3 core (gateway + I-SID) but are NOT configured on L2 access switches — the APs add them via Fabric Attach.
                </div>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>Camera vendor</div>
            {[['Verkada / Axis (≥12.0) / i-PRO', true], ['Other / none', false]].map(([lbl, val]) => (
              <label key={lbl} style={{ marginRight: '12px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="radio" name="cfg-cenv" checked={(settings.cameraFaCapable !== false) === val}
                  onChange={() => setSettings({ ...settings, cameraFaCapable: val })} /> {lbl}
              </label>
            ))}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>FA-capable cameras get the auto-sense fa camera line; others omit it</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>IP Multicast (L2 + L3 Fabric)</div>
            {[['Enabled', true], ['Disabled', false]].map(([lbl, val]) => (
              <label key={lbl} style={{ marginRight: '12px', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input type="radio" name="cfg-menv" checked={(settings.enableSpbMulticast !== false) === val}
                  onChange={() => setSettings({ ...settings, enableSpbMulticast: val })} /> {lbl}
              </label>
            ))}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Enabled: spb-multicast on L3 SVIs, Multicast config-lite on L2 C-VLANs (GRT), global SPBM enable</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>🪧 Login banner (MOTD)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Shown when someone logs in to any switch. Use <code>{'{site}'}</code>, <code>{'{switch}'}</code> or <code>{'{siteId}'}</code> to fill in each switch's details.
          Leave blank to show just the site name.
        </p>
        <input
          style={{ width: '100%', maxWidth: '720px', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
          maxLength={400}
          placeholder="e.g. {site} - {switch} - Authorized access only. Activity is monitored."
          value={settings.motdText || ''}
          onChange={e => setSettings({ ...settings, motdText: e.target.value.replace(/"/g, '') })}
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Preview for {data.switches[0]?.name || 'a switch'}:{' '}
          <em>{(settings.motdText || '').trim()
            ? settings.motdText.replaceAll('{site}', data.switches[0]?.location || 'SITE').replaceAll('{switch}', data.switches[0]?.name || 'SWITCH').replaceAll('{siteId}', String(data.switches[0]?.siteId ?? ''))
            : (data.switches[0]?.location || 'site name')}</em>
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>🌐 How are the sites connected?</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          This decides which cores get Fabric Extend tunnels, the onboarding gateway and an uplink.
        </p>
        {feSites.length < 2 ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>This project has a single site — its core gets the onboarding gateway and the uplink.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '760px' }}>
              {INTERCONNECTS.map(opt => (
                <label key={opt.key} style={{ fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input type="radio" name="cfg-interconnect" checked={interconnect === opt.key} onChange={() => chooseInterconnect(opt.key)} />
                  {' '}<strong>{opt.title}</strong> <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>— {opt.desc}</span>
                </label>
              ))}
            </div>
            {interconnect === 'single' && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.88rem' }}>
                <strong>Core site:</strong>{' '}
                <select value={feCfg.hubSiteId ?? ''} onChange={e => setFeCfg({ ...feCfg, hubSiteId: (feSites.find(x => String(x.siteId) === e.target.value) || {}).siteId })}
                  style={{ padding: '4px 6px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)' }}>
                  {feSites.map(site => <option key={site.siteId} value={site.siteId}>{site.label} · Site {site.siteId}</option>)}
                </select>
              </div>
            )}
            {interconnect === 'extend' && (
              <div style={{ marginTop: '0.75rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
                  Fabric Extend tunnels each site to the hub (the core site) across the ISP so the whole district runs as <strong>one fabric</strong>.
                  When dark fiber arrives later, that site just swaps its tunnel for a fiber link — no I-SID, VLAN or subnet changes. {FE_PLATFORM_NOTE}
                </p>
                <div style={{ fontSize: '0.8rem', marginBottom: '8px', padding: '8px 10px', borderLeft: '3px solid #f59e0b', background: 'var(--canvas-bg)', borderRadius: '6px' }}>
                  ⚠️ <strong>MTU:</strong> {FE_MTU_NOTE}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Site</th><th>Role</th><th>ISP port</th><th>ISP-facing IP/prefix</th><th>ISP gateway</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feSites.map(site => {
                      const s = feCfg.sites[site.siteId] || {};
                      const isHub = site.siteId === feCfg.hubSiteId;
                      const needsWan = feEndpointIds(feCfg, [site.siteId]).length === 1;
                      const inp = { padding: '4px 6px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.85rem' };
                      return (
                        <tr key={site.siteId}>
                          <td><strong>{site.label}</strong> <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>· Site {site.siteId}{site.location ? ` · ${site.location}` : ''}</span></td>
                          <td>
                            <select style={inp} value={isHub ? 'hub' : (s.link === 'fiber' ? 'fiber' : 'extend')}
                              onChange={e => {
                                if (e.target.value === 'hub') setFeCfg({ ...feCfg, hubSiteId: site.siteId });
                                else {
                                  // demoting the hub: promote the first other site so there is always one
                                  const next = { ...feCfg, sites: { ...feCfg.sites, [site.siteId]: { ...s, link: e.target.value } } };
                                  if (isHub) next.hubSiteId = (feSites.find(x => x.siteId !== site.siteId) || {}).siteId;
                                  setFeCfg(next);
                                }
                              }}>
                              <option value="hub">Hub</option>
                              <option value="extend">Fabric Extend (ISP)</option>
                              <option value="fiber">Dark fiber</option>
                            </select>
                          </td>
                          {needsWan ? (
                            <>
                              <td><input style={{ ...inp, width: '70px' }} placeholder="1/48" value={s.wanPort || ''} onChange={e => setFeSite(site.siteId, { wanPort: e.target.value })} /></td>
                              <td><input style={{ ...inp, width: '140px' }} placeholder="203.0.113.2/30" value={s.wanIp || ''} onChange={e => setFeSite(site.siteId, { wanIp: e.target.value })} /></td>
                              <td><input style={{ ...inp, width: '120px' }} placeholder="203.0.113.1" value={s.ispGw || ''} onChange={e => setFeSite(site.siteId, { ispGw: e.target.value })} /></td>
                            </>
                          ) : (
                            <td colSpan={3} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>native fabric NNI — no tunnel needed</td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>🚀 Onboarding gateway & uplinks</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', maxWidth: '900px' }}>
          The <strong>onboarding gateway</strong> puts an IP on onboarding VLAN {ONBOARDING_VLAN} (I-SID {ONBOARDING_ISID}) so new switches get DHCP, find Site Engine,
          and Site Engine pushes their final IP config. There is one per fabric: {interconnect === 'siloed' ? 'siloed, so every site core gets one.' : 'one fabric, so only the core site gets it.'}
          {' '}The <strong>uplink</strong> is the routed hand-off out of the fabric ({interconnect === 'siloed' ? 'the VLAN facing the ISP at each site' : 'the VLAN facing the firewall at the core site'}); its gateway becomes the default route. Leave the uplink blank if you don't need it.
        </p>
        <label style={{ fontSize: '0.9rem', cursor: 'pointer', fontWeight: 600 }}>
          <input type="checkbox" checked={!!svc.onboarding} onChange={e => setSvc({ ...svc, onboarding: e.target.checked })} />
          {' '}Configure the onboarding gateway
        </label>
        <table className="table" style={{ marginTop: '0.5rem' }}>
          <thead>
            <tr>
              <th>Site</th>{svc.onboarding && <th>Onboarding gateway</th>}<th>Uplink VLAN</th><th>Name</th><th>IP/prefix</th><th>Port</th><th>Gateway</th>
            </tr>
          </thead>
          <tbody>
            {feSites.filter(site => svcSiteIds.includes(site.siteId)).map(site => {
              const s = svc.sites[site.siteId] || {};
              const u = s.uplink || {};
              const inp = { padding: '4px 6px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.85rem' };
              return (
                <tr key={site.siteId}>
                  <td><strong>{site.label}</strong> <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>· Site {site.siteId}{site.location ? ` · ${site.location}` : ''}</span></td>
                  {svc.onboarding && <td><input style={{ ...inp, width: '130px' }} placeholder={`10.48.${site.siteId}.1/24`} value={s.onboardingIp || ''} onChange={e => setSvcSite(site.siteId, { onboardingIp: e.target.value })} /></td>}
                  <td><input style={{ ...inp, width: '60px' }} placeholder="5" value={u.vlanId ?? ''} onChange={e => setUplink(site.siteId, { vlanId: e.target.value })} /></td>
                  <td><input style={{ ...inp, width: '110px' }} placeholder={interconnect === 'siloed' ? 'ISP-WAN' : 'FW-Uplink'} value={u.name || ''} onChange={e => setUplink(site.siteId, { name: e.target.value })} /></td>
                  <td><input style={{ ...inp, width: '140px' }} placeholder="10.254.253.42/24" value={u.ip || ''} onChange={e => setUplink(site.siteId, { ip: e.target.value })} /></td>
                  <td><input style={{ ...inp, width: '60px' }} placeholder="2/1" value={u.port || ''} onChange={e => setUplink(site.siteId, { port: e.target.value })} /></td>
                  <td><input style={{ ...inp, width: '120px' }} placeholder="10.254.253.1" value={u.nextHop || ''} onChange={e => setUplink(site.siteId, { nextHop: e.target.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '900px' }}>
          Add a DHCP scope for each onboarding subnet on your DHCP server. {interconnect === 'extend' ? 'Fabric Extend remote sites get no uplink: their ISP port is the tunnel, and everything else rides the fabric to the core. ' : ''}
          The Uplink columns (U-Y) in the Excel template pre-fill this table.
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h3>🛡️ Segmented VRF (Fabric Engine 9.4+)</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Available to every project - whether it came from the wizard, the template, or your own Excel file.
        </p>
        <SegmentedVrfPanel services={vlanServices} value={segVrf} onChange={setSegVrf} />
      </div>

        <button onClick={handleNext} className="btn btn-primary">
          ✓ Continue to Review
        </button>
      </div>

      {/* BULK IMPORT MODAL */}
      {showBulkModal && (
        <BulkImportModal
          switches={data.switches}
          onImport={handleBulkImportComplete}
          onClose={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}

export default Configure;
