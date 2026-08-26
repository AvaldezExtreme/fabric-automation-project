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
    // Get theme from localStorage or default to 'light'
    return localStorage.getItem('app-theme') || 'light';
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
      appVersion: 'v2.5 (V2608264)',
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

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <div className="header-brand">
            <div className="brand-icon">⚡</div>
            <div>
              <h1>FACE - Fabric Auto Configuration Engine</h1>
              <p>Extreme Networks Switch Configuration & Site Engine Auto-Onboarding</p>
            </div>
          </div>
          <div className="header-user">
            <div className="user-info">
              <div className="user-name">{user.username}</div>
              <div className="user-role">Administrator</div>
            </div>

            {/* Project Save / Open - local files only, nothing stored server-side */}
            <button
              onClick={handleSaveProject}
              className="theme-toggle-btn"
              title={data.switches.length === 0
                ? 'Save Project (start a project first)'
                : 'Save Project to your PC - your data never leaves your machine'}
              disabled={data.switches.length === 0}
              style={data.switches.length === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            >
              💾
            </button>
            <label
              className="theme-toggle-btn"
              title="Open a saved FACE project from your PC"
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              📂
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleOpenProject}
                style={{ display: 'none' }}
              />
            </label>

            {/* Theme Selector */}
            <div className="theme-selector-wrapper">
              <button 
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                className="theme-toggle-btn"
                title="Change theme"
              >
                {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '⚡'}
              </button>
              {showThemeMenu && (
                <div className="theme-menu">
                  <button
                    onClick={() => handleThemeChange('light')}
                    className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                  >
                    <span className="theme-icon">☀️</span>
                    <span>Light</span>
                  </button>
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                  >
                    <span className="theme-icon">🌙</span>
                    <span>Dark</span>
                  </button>
                  <button
                    onClick={() => handleThemeChange('extreme')}
                    className={`theme-option ${theme === 'extreme' ? 'active' : ''}`}
                    title="Coming soon"
                  >
                    <span className="theme-icon">⚡</span>
                    <span>Extreme</span>
                  </button>
                </div>
              )}
            </div>

            <button onClick={handleLogout} className="logout-btn">
              🚪 Sign Out
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
                    onClick={() => idx <= currentStep && setCurrentStep(idx)}
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
            />
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>© 2026 Extreme Networks, Inc. | FACE - Fabric Auto Configuration Engine v2.5 (V2608264)</p>
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
