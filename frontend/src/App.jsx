import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import Upload from './pages/Upload';
import Configure from './pages/Configure';
import Review from './pages/Review';
import Export from './pages/Export';
import Validate from './pages/Validate';
import Visualization from './pages/Visualization';
import Simulation from './pages/Simulation';
import tokenService from './services/tokenService.js';
import apiService from './services/apiService.js';
import './styles/ExtremeTheme.css';
import './styles/App.css';
import './styles/Themes.css';

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [theme, setTheme] = useState(() => {
    // Get theme from localStorage or default to 'light'.
    // 'extreme' theme retired - migrate anyone who had it selected.
    const saved = localStorage.getItem('app-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [data, setData] = useState({
    file: null,
    vlanCount: 0,
    switches: [],
    serialMap: {},
    settings: {},
    skipSerials: false,
    districtName: ''
  });
  const [error, setError] = useState(null);
  // True while a step page has an unsaved inline edit open (e.g. Review's
  // edit mode) - used to warn before navigating away
  const [editingInProgress, setEditingInProgress] = useState(false);

  const confirmLeaveEdit = () => {
    if (!editingInProgress) return true;
    const leave = window.confirm(
      'You have an unsaved edit in progress.\n\n' +
      '• OK = leave this page WITHOUT saving (your edit will be lost)\n' +
      '• Cancel = stay here so you can 💾 Save or Cancel your edit first'
    );
    if (leave) setEditingInProgress(false);
    return leave;
  };

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  // Check for existing token on mount
  useEffect(() => {
    const existingToken = tokenService.getToken();
    const existingUser = tokenService.getUser();

    if (existingToken && existingUser && tokenService.isTokenValid()) {
      setUser(existingUser);
      setAuthenticated(true);
    } else if (existingToken) {
      // Token expired, clear it
      tokenService.clearToken();
    }
  }, []);

  // Listen for token expiration events
  useEffect(() => {
    const handleTokenExpired = () => {
      handleLogout();
      setError('Session expired. Please login again.');
    };

    window.addEventListener('token-expired', handleTokenExpired);
    return () => window.removeEventListener('token-expired', handleTokenExpired);
  }, []);

  const steps = [
    { 
      name: 'Upload', 
      label: 'Upload Excel',
      icon: '📁',
      component: Upload,
      description: 'Load your network configuration file' 
    },
    { 
      name: 'Configure', 
      label: 'Configure Settings',
      icon: '⚙️',
      component: Configure,
      description: 'Enter serial numbers and system settings' 
    },
    { 
      name: 'Review', 
      label: 'Review Configuration',
      icon: '📋',
      component: Review,
      description: 'Verify parsed switches and VLANs' 
    },
    {
      name: 'Export',
      label: 'Download Files',
      icon: '⬇️',
      component: Export,
      description: 'Generate and download all configurations'
    },
    {
      name: 'Validate',
      label: 'Validate Configuration',
      icon: '✓',
      component: Validate,
      description: 'Comprehensive Fabric validation'
    },
    {
      name: 'Visualize',
      label: 'View Topology',
      icon: '🔗',
      component: Visualization,
      description: 'Interactive network diagram'
    },
    { 
      name: 'Test', 
      label: 'Test & Verify',
      icon: '✓',
      component: Simulation,
      description: 'Review all generated files' 
    }
  ];

  const handleLogin = (userData) => {
    setUser(userData);
    setAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      // Call logout API to invalidate session (optional, for audit logs)
      await apiService.logout();
    } catch (err) {
      // Ignore errors, logout anyway
    } finally {
      // Clear token and user
      tokenService.clearToken();

      // Reset state
      setAuthenticated(false);
      setUser(null);
      setCurrentStep(0);
      setData({
        file: null,
        vlanCount: 0,
        switches: [],
        serialMap: {},
        settings: {},
        skipSerials: false,
        districtName: ''
      });
      setError(null);
    }
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    setShowThemeMenu(false);
  };

  // ===== PROJECT SAVE / OPEN (Tier 3.2) =====
  // Projects live as local files on the user's PC - FACE stores nothing
  // server-side, so customer network data never leaves their machine.
  const handleSaveProject = () => {
    const project = {
      faceProject: true,
      projectVersion: 1,
      appVersion: 'v2.8 (V2608274)',
      savedAt: new Date().toISOString(),
      currentStep,
      data
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (data.districtName || 'Project').replace(/[^A-Za-z0-9-_]+/g, '') || 'Project';
    a.href = url;
    a.download = `FACE-${safeName}-${new Date().toISOString().split('T')[0]}.face.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleOpenProject = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-opening the same file later
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const project = JSON.parse(ev.target.result);
        if (!project.faceProject || !project.data || !Array.isArray(project.data.switches)) {
          throw new Error('not a FACE project file');
        }
        if (data.switches.length > 0 &&
            !window.confirm('Opening a project will replace your current work. Continue?')) {
          return;
        }
        setData(project.data);
        setCurrentStep(Math.min(Math.max(project.currentStep || 0, 0), steps.length - 1));
        setError(null);
      } catch (err) {
        setError(`Could not open project: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // Warn before losing unsaved work on refresh/close
  useEffect(() => {
    const warn = (e) => {
      if (data.switches.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [data.switches.length]);

  const handleStepNext = (newData) => {
    setData(newData);
    setError(null);
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleStepBack = () => {
    if (!confirmLeaveEdit()) return;
    setError(null);
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setData({
      file: null,
      vlanCount: 0,
      switches: [],
      serialMap: {},
      settings: {},
      skipSerials: false,
      districtName: ''
    });
    setError(null);
  };

  const handleError = (errorMsg) => {
    setError(errorMsg);
  };

  if (!authenticated) {
    return <Login onLoginSuccess={handleLogin} />;
  }

  const CurrentComponent = steps[currentStep].component;
  const currentStepData = steps[currentStep];

  // Platform ONE style header - follows the app theme (charcoal in dark,
  // clean light bar in light) and sized to match the EP1 portal bar
  const hdrDark = theme === 'dark';
  const headerBarStyle = {
    background: hdrDark ? '#26282E' : '#ffffff',
    padding: '0 24px',
    borderBottom: `1px solid ${hdrDark ? '#3a3d45' : '#e5e7eb'}`,
    boxShadow: hdrDark ? 'none' : '0 1px 3px rgba(0,0,0,0.06)'
  };
  const wordmarkColor = hdrDark ? 'white' : '#1f2937';
  const chipColor = hdrDark ? '#cfd2d9' : '#4b5563';
  const headerCircle = {
    width: '40px', height: '40px', borderRadius: '50%',
    background: hdrDark ? '#3a3d45' : '#f3f4f6',
    color: hdrDark ? '#e5e7eb' : '#374151',
    border: 'none', cursor: 'pointer', fontSize: '17px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
  };

  return (
    <div className="app-container">
      {/* Header - Extreme Platform ONE style: flat charcoal bar, wordmark,
          context chip, round controls. Blends with the corporate portal. */}
      <header className="app-header" style={headerBarStyle}>
        <div className="header-content" style={{ height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
            {/* Logo square */}
            <div style={{
              width: '42px', height: '42px', borderRadius: '10px', flexShrink: 0,
              background: '#7519F9', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: '25px', fontFamily: "'DM Sans', sans-serif"
            }}>E</div>
            {/* Wordmark - FACE's own identity (no product-brand trademarks) */}
            <div style={{ color: wordmarkColor, fontSize: '20px', whiteSpace: 'nowrap', letterSpacing: '0.2px' }}>
              <span style={{ fontWeight: 800 }}>Extreme</span>
              <span style={{ fontWeight: 300, marginLeft: '7px' }}>FACE</span>
              <span style={{ opacity: 0.4, margin: '0 12px' }}>|</span>
            </div>
            {/* Context chip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: chipColor, fontSize: '14.5px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '50%', background: '#f1f5f9', border: hdrDark ? 'none' : '1px solid #e5e7eb', flexShrink: 0 }}>
                <img src="/icons/fabric.svg" alt="" style={{ width: '16px', height: '16px' }} />
              </span>
              Fabric Auto Configuration Engine{data.districtName ? ` · ${data.districtName}` : ''}
            </div>
          </div>

          {/* Right controls - flat circles, Platform ONE style */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {[
              null // placeholder to keep JSX tidy
            ] && null}
            <button
              onClick={handleSaveProject}
              title={data.switches.length === 0
                ? 'Save Project (start a project first)'
                : 'Save Project to your PC - your data never leaves your machine'}
              disabled={data.switches.length === 0}
              style={{ ...headerCircle, opacity: data.switches.length === 0 ? 0.35 : 1, cursor: data.switches.length === 0 ? 'not-allowed' : 'pointer' }}
            >
              💾
            </button>
            <label title="Open a saved FACE project from your PC" style={{ ...headerCircle, cursor: 'pointer' }}>
              📂
              <input type="file" accept=".json,application/json" onChange={handleOpenProject} style={{ display: 'none' }} />
            </label>

            <div className="theme-selector-wrapper">
              <button onClick={() => setShowThemeMenu(!showThemeMenu)} title="Change theme" style={headerCircle}>
                {theme === 'dark' ? '🌙' : '☀️'}
              </button>
              {showThemeMenu && (
                <div className="theme-menu">
                  <button onClick={() => handleThemeChange('light')} className={`theme-option ${theme === 'light' ? 'active' : ''}`}>
                    <span className="theme-icon">☀️</span><span>Light</span>
                  </button>
                  <button onClick={() => handleThemeChange('dark')} className={`theme-option ${theme === 'dark' ? 'active' : ''}`}>
                    <span className="theme-icon">🌙</span><span>Dark</span>
                  </button>
                </div>
              )}
            </div>

            <a href="mailto:support@extremenetworks.com" title="Help & support" style={{ ...headerCircle, textDecoration: 'none', fontWeight: 700, fontSize: '15px' }}>?</a>

            <button onClick={handleLogout} title={`Sign out ${user.username}`} style={{
              ...headerCircle,
              background: hdrDark ? '#e5e7eb' : '#26282E',
              color: hdrDark ? '#26282E' : '#ffffff',
              fontWeight: 700, fontSize: '14px'
            }}>
              {(user.username || 'U').substring(0, 2).toUpperCase()}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="app-main">
        {/* Sidebar - Step Indicator */}
        <aside className="app-sidebar">
          <div className="steps-container">
            <h3 className="steps-title">Workflow</h3>
            <div className="steps-list">
              {steps.map((step, idx) => (
                <div key={idx} className="step-wrapper">
                  <button
                    onClick={() => idx <= currentStep && confirmLeaveEdit() && setCurrentStep(idx)}
                    className={`step-indicator ${
                      idx < currentStep ? 'completed' :
                      idx === currentStep ? 'active' :
                      'upcoming'
                    }`}
                    disabled={idx > currentStep}
                  >
                    <div className="step-circle">
                      {idx < currentStep ? '✓' : idx + 1}
                    </div>
                    <div className="step-label">
                      <div className="step-name">{step.label}</div>
                      <div className="step-desc">{step.description}</div>
                    </div>
                  </button>
                  {idx < steps.length - 1 && (
                    <div className={`step-connector ${idx < currentStep ? 'completed' : ''}`}></div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Progress */}
          <div className="progress-section">
            <h4>Progress</h4>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
              ></div>
            </div>
            <p className="progress-text">
              Step {currentStep + 1} of {steps.length}
            </p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="app-content">
          {/* Error Banner */}
          {error && (
            <div className="error-banner">
              <div className="error-content">
                <span className="error-icon">⚠️</span>
                <div>
                  <strong>Error:</strong> {error}
                </div>
              </div>
              <button 
                onClick={() => setError(null)}
                className="error-close"
              >
                ✕
              </button>
            </div>
          )}

          {/* Step Header */}
          <div className="step-header">
            <div>
              <h2>
                <span className="step-header-icon">{currentStepData.icon}</span>
                {currentStepData.label}
              </h2>
              <p>{currentStepData.description}</p>
            </div>
            <div className="breadcrumb">
              {steps.map((step, idx) => (
                <React.Fragment key={idx}>
                  <span className={idx === currentStep ? 'active' : ''}>
                    {step.name}
                  </span>
                  {idx < steps.length - 1 && <span className="sep">/</span>}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="step-content">
            <CurrentComponent
              data={data}
              onNext={handleStepNext}
              onBack={handleStepBack}
              onReset={handleReset}
              onError={handleError}
              onUpdate={(newData) => setData(newData)}
              onEditingChange={setEditingInProgress}
            />
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>© 2026 Extreme Networks, Inc. | FACE - Fabric Auto Configuration Engine v2.8 (V2608274)</p>
          <div className="footer-links">
            <a href="#">Documentation</a>
            <a href="#">Support</a>
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
