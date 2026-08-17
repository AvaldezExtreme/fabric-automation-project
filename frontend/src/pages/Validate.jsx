// ============================================
// Validate Page - Step 6
// Version: V2608173
// Purpose: Fabric configuration validation
// ============================================

import React, { useState, useEffect } from 'react';
import tokenService from '../services/tokenService.js';

function Validate({ data, onNext, onBack }) {
  const [validationResults, setValidationResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Run validation on mount
  useEffect(() => {
    runValidation();
  }, []);

  const runValidation = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Running Fabric configuration validation...');

      const response = await fetch('http://127.0.0.1:3001/api/validate/fabric', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tokenService.getAuthHeader()
        },
        body: JSON.stringify({
          switches: data.switches || [],
          settings: data.settings || {}
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Validation failed');
      }

      const result = await response.json();
      console.log('Validation complete:', result.data);
      setValidationResults(result.data);

    } catch (err) {
      console.error('Validation error:', err);
      setError(err.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (type) => {
    switch (type) {
      case 'pass': return '#00CC99';     // Green
      case 'warning': return '#FF9900';  // Orange
      case 'error': return '#FF3333';    // Red
      default: return '#7D76F2';         // Blue
    }
  };

  const getStatusIcon = (type) => {
    switch (type) {
      case 'pass': return '✓';
      case 'warning': return '⚠';
      case 'error': return '✕';
      default: return 'ℹ';
    }
  };

  const groupChecksByCategory = () => {
    const grouped = {};
    if (validationResults && validationResults.checks) {
      validationResults.checks.forEach(check => {
        if (!grouped[check.category]) {
          grouped[check.category] = [];
        }
        grouped[check.category].push(check);
      });
    }
    return grouped;
  };

  return (
    <div className="page-validate" style={{ maxWidth: '1000px' }}>
      <h2>Step 6: Validate Configuration</h2>
      <p className="page-description">
        Comprehensive Fabric configuration validation to ensure production readiness
      </p>

      {error && (
        <div style={styles.errorBanner}>
          <span>⚠️</span>
          <div>
            <strong>Validation Error:</strong> {error}
          </div>
          <button onClick={runValidation} style={styles.retryBtn}>
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <p>Running comprehensive Fabric validation...</p>
          <p style={{ fontSize: '12px', opacity: 0.7 }}>
            Checking IP subnets, VLANs, I-SIDs, and Fabric-specific configurations
          </p>
        </div>
      )}

      {validationResults && !loading && (
        <div>
          {/* Summary Section */}
          <div style={styles.summaryContainer}>
            <div style={styles.summaryItem}>
              <div style={styles.summaryNumber}>{validationResults.summary.total}</div>
              <div style={styles.summaryLabel}>Total Checks</div>
            </div>
            <div style={{...styles.summaryItem, borderColor: '#00CC99'}}>
              <div style={{...styles.summaryNumber, color: '#00CC99'}}>
                {validationResults.summary.passed}
              </div>
              <div style={styles.summaryLabel}>Passed</div>
            </div>
            <div style={{...styles.summaryItem, borderColor: '#FF9900'}}>
              <div style={{...styles.summaryNumber, color: '#FF9900'}}>
                {validationResults.summary.warnings}
              </div>
              <div style={styles.summaryLabel}>Warnings</div>
            </div>
            <div style={{...styles.summaryItem, borderColor: '#FF3333'}}>
              <div style={{...styles.summaryNumber, color: '#FF3333'}}>
                {validationResults.summary.errors}
              </div>
              <div style={styles.summaryLabel}>Errors</div>
            </div>
          </div>

          {/* Overall Status */}
          <div style={{
            ...styles.statusCard,
            borderColor: '#00CC99',
            backgroundColor: 'rgba(0, 204, 153, 0.05)'
          }}>
            <span style={{
              fontSize: '32px',
              color: '#00CC99'
            }}>
              ✓
            </span>
            <div>
              <strong>Validation Complete</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.7 }}>
                Review the results below. Critical errors are highlighted. Warnings are informational.
              </p>
            </div>
          </div>

          {/* Checks by Category */}
          <div style={styles.checksContainer}>
            {Object.entries(groupChecksByCategory()).map(([category, checks]) => (
              <div key={category} style={styles.categorySection}>
                <h3 style={styles.categoryTitle}>{category}</h3>

                {checks.map((check, idx) => (
                  <div key={idx} style={{
                    ...styles.checkItem,
                    borderColor: getStatusColor(check.type),
                    backgroundColor: `${getStatusColor(check.type)}08`
                  }}>
                    <div style={{
                      ...styles.checkIcon,
                      color: getStatusColor(check.type),
                      backgroundColor: `${getStatusColor(check.type)}20`
                    }}>
                      {getStatusIcon(check.type)}
                    </div>

                    <div style={styles.checkContent}>
                      <div style={styles.checkName}>{check.check}</div>
                      <div style={styles.checkMessage}>{check.message}</div>

                      {check.details && check.details.length > 0 && (
                        <details style={styles.details}>
                          <summary style={styles.detailsSummary}>
                            View {check.details.length} detail(s)
                          </summary>
                          <div style={styles.detailsContent}>
                            {check.details.map((detail, i) => (
                              <div key={i} style={styles.detailItem}>
                                {JSON.stringify(detail, null, 2)}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>

                    <div style={{
                      ...styles.checkSeverity,
                      backgroundColor: `${getStatusColor(check.type)}20`,
                      color: getStatusColor(check.type)
                    }}>
                      {check.severity}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Export Report Option */}
          <div style={styles.exportSection}>
            <button
              onClick={() => downloadReport(validationResults)}
              style={styles.exportBtn}
            >
              📥 Download Validation Report
            </button>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div style={styles.navButtons}>
        <button onClick={onBack} style={styles.backBtn}>
          ← Back
        </button>
        <button
          onClick={() => onNext(data)}
          style={styles.nextBtn}
        >
          View Topology →
        </button>
      </div>
    </div>
  );
}

const downloadReport = (results) => {
  const timestamp = new Date().toLocaleString();
  const groupedByCategory = {};

  results.checks.forEach(check => {
    if (!groupedByCategory[check.category]) {
      groupedByCategory[check.category] = [];
    }
    groupedByCategory[check.category].push(check);
  });

  const report = `
╔════════════════════════════════════════════════════════════════╗
║  FACE - FABRIC AUTO CONFIGURATION ENGINE                       ║
║  Validation Report                                             ║
╚════════════════════════════════════════════════════════════════╝

Generated: ${timestamp}

─── VALIDATION SUMMARY ───────────────────────────────────────────
Total Checks Run:      ${results.summary.total}
✓ Passed:              ${results.summary.passed}
⚠ Warnings:            ${results.summary.warnings}
✕ Errors:              ${results.summary.errors}

Status: Validation Complete - Ready to Proceed


─── RESULTS BY CATEGORY ──────────────────────────────────────────

${Object.entries(groupedByCategory).map(([category, checks]) => `
${category}
${'-'.repeat(category.length)}
${checks.map(check => {
  const icon = check.type === 'pass' ? '✓' : check.type === 'error' ? '✕' : '⚠';
  const status = check.type.toUpperCase();
  return `
${icon} ${check.check}
   ${check.message}
   [${check.severity.toUpperCase()}]`;
}).join('\n')}
`).join('\n')}

─── INTERPRETATION GUIDE ─────────────────────────────────────────

✓ PASSED
  Configuration aspect is correct. No action required.

⚠ WARNING
  Informational notice. Review and confirm this is intentional.
  Examples:
  - No L3 switches (using external gateway)
  - VLAN duplicates across sites (normal practice)
  - I-SID patterns per-site (expected behavior)

✕ ERROR
  Configuration issue to address before deployment.
  Examples:
  - Invalid VLAN ID range
  - Invalid IP address format
  - Conflicting interface assignments


─── NEXT STEPS ───────────────────────────────────────────────────

1. Review all ERROR items and correct them
2. Review WARNING items and confirm they match your design
3. Proceed to network deployment when satisfied


═══════════════════════════════════════════════════════════════════
Generated by FACE v2.0 (V2608173)
© 2026 Extreme Networks, Inc.
═══════════════════════════════════════════════════════════════════
`;

  const blob = new Blob([report], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FACE-Validation-Report-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const styles = {
  errorBanner: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    background: 'rgba(255, 51, 51, 0.1)',
    border: '2px solid #FF3333',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
    color: '#CC0000'
  },
  retryBtn: {
    background: '#FF3333',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    marginLeft: 'auto'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 20px',
    gap: '16px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #E0E0E0',
    borderTop: '4px solid #5B059C',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  summaryContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '16px',
    marginBottom: '24px'
  },
  summaryItem: {
    border: '2px solid #E0E0E0',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center'
  },
  summaryNumber: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#5B059C'
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#666',
    marginTop: '8px'
  },
  statusCard: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
    border: '2px solid',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '24px'
  },
  checksContainer: {
    marginBottom: '24px'
  },
  categorySection: {
    marginBottom: '24px'
  },
  categoryTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#5B059C',
    marginBottom: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  checkItem: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-start',
    border: '2px solid',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px'
  },
  checkIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 'bold',
    flexShrink: 0
  },
  checkContent: {
    flex: 1
  },
  checkName: {
    fontWeight: 'bold',
    fontSize: '14px'
  },
  checkMessage: {
    fontSize: '13px',
    marginTop: '4px',
    opacity: 0.8
  },
  checkSeverity: {
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap'
  },
  details: {
    marginTop: '12px'
  },
  detailsSummary: {
    cursor: 'pointer',
    fontSize: '12px',
    color: '#5B059C',
    textDecoration: 'underline'
  },
  detailsContent: {
    background: 'rgba(0, 0, 0, 0.02)',
    borderRadius: '6px',
    padding: '12px',
    marginTop: '8px',
    maxHeight: '300px',
    overflow: 'auto'
  },
  detailItem: {
    fontSize: '11px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    marginBottom: '8px'
  },
  exportSection: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '24px'
  },
  exportBtn: {
    background: '#5B059C',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px'
  },
  navButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'space-between'
  },
  backBtn: {
    background: '#E0E0E0',
    color: '#333',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  nextBtn: {
    background: '#5B059C',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold'
  }
};

// Add CSS animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default Validate;
