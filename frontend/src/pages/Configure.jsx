import React, { useState } from 'react';
import SegmentedVrfPanel, { defaultSegVrf, validateSegVrf } from '../components/SegmentedVrfPanel.jsx';
import BulkImportModal from '../components/BulkImportModal';

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
    wanLinkIp: '',
    wanLinkNetmask: '',
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

      onNext({
        ...data,
        serialMap: structuredSerialMap,
        settings: { ...settings, segmentedVrf: segVrf.enabled ? segVrf : null },
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

        <div className="form-group">
          <label>WAN Link IP (Optional for L3)</label>
          <input
            type="text"
            value={settings.wanLinkIp}
            onChange={(e) => handleSettingChange('wanLinkIp', e.target.value)}
            placeholder="10.101.1.11"
          />
          <div className="help-text">Leave blank to use defaults</div>
        </div>

        <div className="form-group">
          <label>WAN Link Netmask (Optional for L3)</label>
          <input
            type="text"
            value={settings.wanLinkNetmask}
            onChange={(e) => handleSettingChange('wanLinkNetmask', e.target.value)}
            placeholder="255.255.255.0"
          />
        </div>
      </div>

      {/* NAVIGATION */}
      <div style={{ marginTop: '2rem' }}>
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
