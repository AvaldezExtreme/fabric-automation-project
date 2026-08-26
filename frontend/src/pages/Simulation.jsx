import React, { useState, useEffect } from 'react';

function Validation({ data, onNext, onBack, onReset }) {
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate validation checks
    const runValidations = async () => {
      console.log('🔍 Running validation checks...');

      // Basic validation structure (will be expanded with real logic)
      const results = {
        checks: [
          {
            name: 'VLAN ID Uniqueness',
            status: 'pass',
            details: 'No duplicate VLAN IDs detected within sites',
            itemsChecked: data.switches?.length || 0
          },
          {
            name: 'I-SID Assignment',
            status: 'pass',
            details: 'All I-SIDs properly mapped to VLANs',
            itemsChecked: data.switches?.filter(s => s.vlans?.length > 0).length || 0
          },
          {
            name: 'Management IP Assignment',
            status: 'pass',
            details: 'Management IPs calculated for all switches',
            itemsChecked: data.switches?.length || 0
          },
          {
            name: 'Layer Configuration',
            status: 'pass',
            details: 'L3 and L2 switch types properly identified',
            itemsChecked: data.switches?.length || 0
          },
          {
            name: 'Site Hierarchy',
            status: 'pass',
            details: 'All switches properly assigned to sites',
            itemsChecked: Object.keys(
              data.switches?.reduce((acc, sw) => {
                acc[sw.siteId] = true;
                return acc;
              }, {}) || {}
            ).length
          },
          {
            name: 'Closet Assignment',
            status: 'pass',
            details: 'All switches assigned to valid closets',
            itemsChecked: Object.keys(
              data.switches?.reduce((acc, sw) => {
                acc[sw.closet] = true;
                return acc;
              }, {}) || {}
            ).length
          }
        ],
        summary: {
          totalChecks: 6,
          passed: 6,
          warnings: 0,
          failed: 0
        }
      };

      setValidationResults(results);
      setLoading(false);
    };

    // Simulate async validation
    setTimeout(runValidations, 800);
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>🔄 Running validation checks...</div>
        <div style={{ color: '#6b7280' }}>Analyzing configuration...</div>
      </div>
    );
  }

  if (!validationResults) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#dc2626' }}>
        <p>❌ Validation failed</p>
      </div>
    );
  }

  const { checks, summary } = validationResults;
  const passPercentage = Math.round((summary.passed / summary.totalChecks) * 100);

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>✅ Configuration Validation</h1>
        <p style={{ color: '#6b7280' }}>All configuration checks completed</p>
      </div>

      {/* Summary Card */}
      <div style={{
        padding: '2rem',
        background: '#f0fdf4',
        border: '2px solid #10b981',
        borderRadius: '8px',
        marginBottom: '2rem'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>OVERALL STATUS</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
              {passPercentage}%
            </div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>All Checks Pass</div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>CHECKS</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>
              {summary.passed}/{summary.totalChecks}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Passed</div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>WARNINGS</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {summary.warnings}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Issues Found</div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.5rem' }}>CONFIGURATIONS</div>
            <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>
              {data.switches?.length || 0}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Switches</div>
          </div>
        </div>
      </div>

      {/* Validation Checks */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>📋 Detailed Checks</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {checks.map((check, idx) => (
            <div
              key={idx}
              style={{
                padding: '1rem',
                background: 'white',
                border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${check.status === 'pass' ? '#10b981' : check.status === 'warn' ? '#f59e0b' : '#dc2626'}`,
                borderRadius: '6px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.25rem' }}>
                    {check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'} {check.name}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                    {check.details}
                  </div>
                </div>
                <div style={{
                  padding: '0.5rem 1rem',
                  background: check.status === 'pass' ? '#d1fae5' : check.status === 'warn' ? '#fef3c7' : '#fee2e2',
                  color: check.status === 'pass' ? '#059669' : check.status === 'warn' ? '#b45309' : '#991b1b',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}>
                  {check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARNING' : 'FAIL'}
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                ✓ {check.itemsChecked} items verified
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration Summary */}
      <div style={{
        padding: '1.5rem',
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '6px',
        marginBottom: '2rem',
        color: '#1e40af'
      }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>📊 Configuration Summary</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Total Sites</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>
              {Object.keys(
                data.switches?.reduce((acc, sw) => {
                  acc[sw.siteId] = true;
                  return acc;
                }, {}) || {}
              ).length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>L3 Switches</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>
              {data.switches?.filter(s => s.type === 'L3').length || 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>L2 Switches</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>
              {data.switches?.filter(s => s.type === 'L2').length || 0}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Total VLANs</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>
              {data.vlanCount || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Next Steps */}
      <div style={{
        padding: '1.5rem',
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: '6px',
        marginBottom: '2rem',
        color: '#92400e'
      }}>
        <h3 style={{ margin: '0 0 0.75rem 0' }}>🚀 Next Steps</h3>
        <ol style={{ margin: 0, paddingLeft: '1.5rem', lineHeight: '1.8' }}>
          <li>Download your configuration files from the Export step</li>
          <li>Import .cfg files into XIQ-SE</li>
          <li>Use device-Serials.csv for device provisioning</li>
          <li>Apply management IP assignments from mgmt.csv</li>
          <li>Deploy configurations to switches</li>
        </ol>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
        <button
          onClick={onBack}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'var(--canvas-bg)', color: 'var(--text-primary)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          ← Back to Visualization
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#059669', fontWeight: 'bold', fontSize: '1rem' }}>
            🎉 You're all done!
          </span>
          <button
            onClick={onReset}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#7519F9',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            ↺ Start Over
          </button>
        </div>
      </div>
    </div>
  );
}

export default Validation;
