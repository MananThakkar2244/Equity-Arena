import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../services/api';
import { User, Lock, Mail, ArrowRight, TrendingUp, Shield, Sun, Moon } from 'lucide-react';

export function Login() {
  const [activeTab, setActiveTab] = useState('TRADER_SIGNIN'); // 'TRADER_SIGNIN', 'TRADER_REGISTER', 'ADMIN'
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

  // Secret 5-click trigger handler on the logo mark
  const handleSecretTriggerClick = () => {
    const nextCount = clickCount + 1;
    setClickCount(nextCount);

    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      setClickCount(0);
    }, 3000);

    if (nextCount >= 5) {
      setIsAdminUnlocked(true);
      setActiveTab('ADMIN');
      setClickCount(0);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    }
  };

  // Trader Sign In / Register submit
  const handleTraderSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const isRegister = activeTab === 'TRADER_REGISTER';
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const payload = isRegister ? { name, email, password } : { email, password };

      const data = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      login(data.token, data.user);
      navigate('/trader');
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Dedicated Hardened Admin Login submit
  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiFetch('/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      login(data.token, data.user);
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Admin authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 theme-bg-main theme-text-main relative overflow-hidden transition-colors">
      {/* Light / dark switch — same segmented control as the dashboard's TopBar */}
      <div className="absolute top-5 right-5 z-50">
        <div
          className="flex items-center gap-0.5 rounded-xl border theme-border p-1"
          style={{ backgroundColor: 'var(--bg-card)' }}
          role="group"
          aria-label="Colour theme"
        >
          <button
            type="button"
            onClick={() => theme !== 'light' && toggleTheme()}
            aria-pressed={theme === 'light'}
            title="Light mode"
            className={`rounded-lg p-1.5 transition ${
              theme === 'light' ? 'text-[var(--accent-ink)]' : 'theme-text-dim hover:theme-text-main'
            }`}
            style={theme === 'light' ? { backgroundColor: 'var(--accent)' } : undefined}
          >
            <Sun className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => theme !== 'dark' && toggleTheme()}
            aria-pressed={theme === 'dark'}
            title="Dark mode"
            className={`rounded-lg p-1.5 transition ${
              theme === 'dark' ? 'text-[var(--accent-ink)]' : 'theme-text-dim hover:theme-text-main'
            }`}
            style={theme === 'dark' ? { backgroundColor: 'var(--accent)' } : undefined}
          >
            <Moon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="w-full max-w-md my-auto">
        <div className="text-center mb-8">
          {/* Logo mark — identical gold gradient + TrendingUp glyph used in the dashboard Sidebar.
              Doubles as the hidden 5-click admin trigger. */}
          <button
            type="button"
            onClick={handleSecretTriggerClick}
            className="inline-flex flex-col items-center gap-2.5 mb-2 select-none active:scale-95 transition-transform cursor-pointer"
            title="Equity Arena"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F2C14E] to-[#B07C0C] text-[var(--accent-ink)] shadow-lg">
              <TrendingUp className="h-7 w-7" strokeWidth={2.6} />
            </div>
          </button>

          <h1 className="text-2xl font-heading font-bold tracking-tight theme-text-main">
            EQUITY ARENA
          </h1>
          <p className="theme-text-dim text-xs mt-1">Trade. Climb. Win.</p>
          <p className="theme-text-muted text-xs mt-3">
            Real-time India stock exchange terminal &middot; 20,000 IC starter capital
          </p>
        </div>

        <div
          className="p-8 rounded-2xl border theme-border transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', boxShadow: 'var(--card-shadow)' }}
        >
          <div
            className="flex p-1 rounded-xl mb-6 border theme-border"
            style={{ backgroundColor: 'var(--bg-panel)' }}
          >
            <button
              type="button"
              onClick={() => { setActiveTab('TRADER_SIGNIN'); setError(''); }}
              className={`flex-1 py-2 text-[13px] font-semibold font-heading rounded-lg transition-all min-h-[38px] ${
                activeTab === 'TRADER_SIGNIN' ? 'text-[var(--accent-ink)]' : 'theme-text-muted hover:theme-text-main'
              }`}
              style={activeTab === 'TRADER_SIGNIN' ? { backgroundColor: 'var(--accent)' } : undefined}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('TRADER_REGISTER'); setError(''); }}
              className={`flex-1 py-2 text-[13px] font-semibold font-heading rounded-lg transition-all min-h-[38px] ${
                activeTab === 'TRADER_REGISTER' ? 'text-[var(--accent-ink)]' : 'theme-text-muted hover:theme-text-main'
              }`}
              style={activeTab === 'TRADER_REGISTER' ? { backgroundColor: 'var(--accent)' } : undefined}
            >
              Create Account
            </button>

            {isAdminUnlocked && (
              <button
                type="button"
                onClick={() => { setActiveTab('ADMIN'); setError(''); }}
                className={`flex-1 py-2 text-[13px] font-semibold font-heading rounded-lg transition-all flex items-center justify-center gap-1 min-h-[38px] ${
                  activeTab === 'ADMIN' ? 'text-white' : 'text-indigo-400 hover:theme-text-main'
                }`}
                style={activeTab === 'ADMIN' ? { backgroundColor: '#4F46E5' } : undefined}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            )}
          </div>

          {error && (
            <div
              className="mb-4 p-3 rounded-xl text-xs font-mono"
              style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--loss-red)' }}
            >
              {error}
            </div>
          )}

          {activeTab !== 'ADMIN' && (
            <form onSubmit={handleTraderSubmit} className="space-y-4">
              {activeTab === 'TRADER_REGISTER' && (
                <div>
                  <label className="block text-xs font-semibold theme-text-muted mb-1.5 font-heading">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 theme-text-dim" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Trader Name"
                      className="w-full rounded-xl border theme-border py-2.5 pl-10 pr-4 text-sm theme-text-main outline-none transition placeholder:theme-text-dim focus:border-[var(--accent-ring)] min-h-[42px]"
                      style={{ backgroundColor: 'var(--bg-input)' }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5 font-heading">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 theme-text-dim" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="trader@example.com"
                    className="w-full rounded-xl border theme-border py-2.5 pl-10 pr-4 text-sm theme-text-main outline-none transition placeholder:theme-text-dim focus:border-[var(--accent-ring)] min-h-[42px]"
                    style={{ backgroundColor: 'var(--bg-input)' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5 font-heading">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 theme-text-dim" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border theme-border py-2.5 pl-10 pr-4 text-sm theme-text-main outline-none transition placeholder:theme-text-dim focus:border-[var(--accent-ring)] min-h-[42px]"
                    style={{ backgroundColor: 'var(--bg-input)' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 text-[var(--accent-ink)] font-bold text-sm font-heading rounded-xl shadow flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 mt-6 min-h-[46px]"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {loading ? 'Authenticating…' : (
                  <>
                    <span>{activeTab === 'TRADER_REGISTER' ? 'Join Exchange — Start with 20,000 IC' : 'Enter Trading Terminal'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {activeTab === 'ADMIN' && (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5 font-heading">Admin Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 theme-text-dim" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@test.com"
                    className="w-full rounded-xl border theme-border py-2.5 pl-10 pr-4 text-sm theme-text-main outline-none transition placeholder:theme-text-dim focus:border-indigo-500 min-h-[42px]"
                    style={{ backgroundColor: 'var(--bg-input)' }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold theme-text-muted mb-1.5 font-heading">Admin Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 theme-text-dim" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border theme-border py-2.5 pl-10 pr-4 text-sm theme-text-main outline-none transition placeholder:theme-text-dim focus:border-indigo-500 min-h-[42px]"
                    style={{ backgroundColor: 'var(--bg-input)' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm font-heading rounded-xl shadow flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 mt-6 min-h-[46px]"
              >
                {loading ? 'Authenticating…' : (
                  <>
                    <Shield className="w-4 h-4" />
                    <span>Authorize Console Access</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
