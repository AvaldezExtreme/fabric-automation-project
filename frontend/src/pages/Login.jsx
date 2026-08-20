import React, { useState } from 'react';
import '../styles/Auth.css';
import apiService from '../services/apiService.js';
import tokenService from '../services/tokenService.js';

function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Call backend API for authentication
      const response = await apiService.login(username, password);

      if (response.data.success && response.data.token) {
        // Save token and user info
        tokenService.setToken(response.data.token, response.data.user);

        // Notify parent component
        onLoginSuccess(response.data.user);
      } else {
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Login failed. Please check your credentials.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-background"></div>
      
      <div className="auth-wrapper">
        <div className="auth-card">
          {/* Header */}
          <div className="auth-header">
            <div className="auth-logo">
              <div className="logo-icon">⚡</div>
              <div className="logo-text">
                <div className="logo-brand">Extreme Networks</div>
                <div className="logo-product">FACE - Fabric Auto Configuration Engine</div>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            <h1>Sign In</h1>
            <p className="auth-subtitle">
              Enter your credentials to access the network configuration tool
            </p>

            {error && (
              <div className="auth-error">
                <span className="error-icon">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Username */}
            <div className="form-group">
              <label htmlFor="username">Username or Email</label>
              <div className="input-wrapper">
                <span className="input-icon">👤</span>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <span className="input-icon">🔒</span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="show-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="form-options">
              <label className="remember-me">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgot-password">Forgot password?</a>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="auth-submit"
              disabled={loading || !username || !password}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>

          </form>

          {/* Footer */}
          <div className="auth-footer">
            <p>Need help? Contact <a href="mailto:support@extremenetworks.com">support@extremenetworks.com</a></p>
            <p className="version">FACE - Fabric Auto Configuration Engine v2.1 (V2608201)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
