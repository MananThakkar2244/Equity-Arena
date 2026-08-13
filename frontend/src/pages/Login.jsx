import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../services/api';
import {
  User,
  Lock,
  Mail,
  ArrowRight,
  TrendingUp,
  Shield,
  Sun,
  Moon,
  Activity,
  BarChart3,
  CandlestickChart,
  Sparkles,
} from 'lucide-react';

const stats = [
  { label: 'Live listings', value: '15', icon: BarChart3 },
  { label: 'Market feed', value: 'ACTIVE', icon: Activity },
  { label: 'Starter capital', value: '20K IC', icon: Sparkles },
];

export function Login() {
  const [activeTab, setActiveTab] = useState('TRADER_SIGNIN');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [clickCount, setClickCount] = useState(0);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const clickTimerRef = useRef(null);
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSecretTriggerClick = () => {
    const nextCount = clickCount + 1;
    setClickCount(nextCount);

    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => setClickCount(0), 3000);

    if (nextCount >= 5) {
      setIsAdminUnlocked(true);
      setActiveTab('ADMIN');
      setClickCount(0);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setError('');
  };

  const handleTraderSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isRegister = activeTab === 'TRADER_REGISTER';
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister ? { name, email, password } : { email, password };
      const data = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      login(data.token, data.user);
      navigate('/trader');
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiFetch('/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      login(data.token, data.user);
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Admin authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const isRegister = activeTab === 'TRADER_REGISTER';
  const isAdmin = activeTab === 'ADMIN';

  return (
    <div className="login-page min-h-screen theme-bg-main theme-text-main transition-colors duration-300">
      <div className="login-ambient" aria-hidden="true">
        <div className="login-orbit login-orbit-one" />
        <div className="login-orbit login-orbit-two" />
        <div className="login-grid" />
      </div>

      <header className="login-header">
        <button
          type="button"
          onClick={handleSecretTriggerClick}
          className="login-brand"
          title="Equity Arena"
        >
          <span className="login-brand-mark">
            <TrendingUp className="h-5 w-5" strokeWidth={2.6} />
          </span>
          <span>
            <span className="login-brand-name">EQUITY ARENA</span>
            <span className="login-brand-subtitle">TRADING TERMINAL</span>
          </span>
        </button>

        <div className="login-header-actions">
          <span className="login-status-chip">
            <span className="login-status-dot" /> LIVE FEED
          </span>
          <div className="login-theme-toggle" role="group" aria-label="Colour theme">
            <button
              type="button"
              onClick={() => theme !== 'light' && toggleTheme()}
              aria-pressed={theme === 'light'}
              title="Light mode"
              className={theme === 'light' ? 'is-active' : ''}
            >
              <Sun className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => theme !== 'dark' && toggleTheme()}
              aria-pressed={theme === 'dark'}
              title="Dark mode"
              className={theme === 'dark' ? 'is-active' : ''}
            >
              <Moon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="login-shell">
        <section className="login-story">
          <div className="login-kicker">
            <span className="login-kicker-line" />
            PAPER MARKET · REAL-TIME GAME
          </div>
          <h1 className="login-title">
            Read the market.
            <span>Make the move.</span>
          </h1>
          <p className="login-copy">
            Equity Arena turns market movement into a fast, competitive trading experience. Follow the live balance, build your portfolio, and trade with a 20,000 IC starter stack.
          </p>

          <div className="login-market-preview">
            <div className="login-preview-head">
              <div>
                <div className="login-preview-label">MARKET BALANCE</div>
                <div className="login-preview-state">BEARISH PRESSURE</div>
              </div>
              <div className="login-preview-score">-73</div>
            </div>

            <div className="login-preview-bar">
              <span style={{ width: '27%' }} />
              <span style={{ width: '73%' }} />
            </div>

            <div className="login-preview-meta">
              <span><b>4</b> advancing</span>
              <span><b>15</b> analyzed</span>
              <span><b>11</b> declining</span>
            </div>

            <div className="login-preview-chart" aria-hidden="true">
              <span className="login-chart-line login-chart-line-one" />
              <span className="login-chart-line login-chart-line-two" />
            </div>
          </div>

          <div className="login-stat-row">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="login-stat-card">
                <Icon className="h-4 w-4" />
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="login-auth-wrap">
          <div className="login-auth-card">
            <div className="login-auth-header">
              <div>
                <div className="login-auth-eyebrow">EQUITY ARENA ACCESS</div>
                <h2>{isAdmin ? 'Console access' : isRegister ? 'Create your trader account' : 'Welcome back, trader'}</h2>
                <p>
                  {isAdmin
                    ? 'Authorized administrator workspace.'
                    : isRegister
                      ? 'Start with a fresh 20,000 IC practice account.'
                      : 'Pick up where the market left you.'}
                </p>
              </div>
              <div className="login-auth-icon">
                {isAdmin ? <Shield className="h-5 w-5" /> : <CandlestickChart className="h-5 w-5" />}
              </div>
            </div>

            <div className="login-tabs" role="tablist" aria-label="Account access">
              <button type="button" role="tab" aria-selected={activeTab === 'TRADER_SIGNIN'} onClick={() => switchTab('TRADER_SIGNIN')} className={activeTab === 'TRADER_SIGNIN' ? 'is-active' : ''}>
                Sign in
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'TRADER_REGISTER'} onClick={() => switchTab('TRADER_REGISTER')} className={activeTab === 'TRADER_REGISTER' ? 'is-active' : ''}>
                Create account
              </button>
              {isAdminUnlocked && (
                <button type="button" role="tab" aria-selected={activeTab === 'ADMIN'} onClick={() => switchTab('ADMIN')} className={activeTab === 'ADMIN' ? 'is-active admin-tab' : 'admin-tab'}>
                  <Shield className="h-3.5 w-3.5" /> Admin
                </button>
              )}
            </div>

            {error && <div className="login-error">{error}</div>}

            {!isAdmin ? (
              <form onSubmit={handleTraderSubmit} className="login-form">
                {isRegister && (
                  <div className="login-field">
                    <label htmlFor="trader-name">Full name</label>
                    <div className="login-input-wrap">
                      <User className="login-input-icon" />
                      <input id="trader-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Trader name" />
                    </div>
                  </div>
                )}

                <div className="login-field">
                  <label htmlFor="trader-email">Email address</label>
                  <div className="login-input-wrap">
                    <Mail className="login-input-icon" />
                    <input id="trader-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="trader@example.com" autoComplete="email" />
                  </div>
                </div>

                <div className="login-field">
                  <div className="login-field-head">
                    <label htmlFor="trader-password">Password</label>
                    <span>Secure access</span>
                  </div>
                  <div className="login-input-wrap">
                    <Lock className="login-input-icon" />
                    <input id="trader-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete={isRegister ? 'new-password' : 'current-password'} />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="login-submit">
                  {loading ? 'Authenticating…' : <><span>{isRegister ? 'Open trading account' : 'Enter trading terminal'}</span><ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={handleAdminSubmit} className="login-form">
                <div className="login-admin-banner">
                  <Shield className="h-4 w-4" />
                  <span>Administrator route is hidden by design.</span>
                </div>

                <div className="login-field">
                  <label htmlFor="admin-email">Admin email</label>
                  <div className="login-input-wrap">
                    <Mail className="login-input-icon" />
                    <input id="admin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@test.com" autoComplete="username" />
                  </div>
                </div>

                <div className="login-field">
                  <label htmlFor="admin-password">Admin password</label>
                  <div className="login-input-wrap">
                    <Lock className="login-input-icon" />
                    <input id="admin-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="login-submit login-submit-admin">
                  {loading ? 'Authenticating…' : <><Shield className="h-4 w-4" /><span>Authorize console access</span><ArrowRight className="h-4 w-4" /></>}
                </button>
              </form>
            )}

            <div className="login-auth-footer">
              <span>Practice environment</span>
              <span className="login-footer-dot" />
              <span>No real money</span>
              <span className="login-footer-dot" />
              <span>Live market simulation</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="login-footer">
        <span>Equity Arena</span>
        <span>Built for fast decisions, not financial advice.</span>
      </footer>
    </div>
  );
}
