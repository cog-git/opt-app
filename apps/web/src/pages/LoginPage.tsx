import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Logo, Pill } from '@opt/ui';
import { MailIcon, EyeIcon } from '../icons';
import { ApiError, login } from '../api';
import './login.css';

/**
 * Login screen — ported from opt_mock/login.html.
 * Left porcelain brand panel + right white sign-in form.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const [subdomain, setSubdomain] = useState('demo');
  const [email, setEmail] = useState('owner@demo.opt');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await login(subdomain.trim(), email.trim(), password, remember);
      navigate('/admin');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the server. Is the API running?',
      );
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login__brand">
        <Logo color="var(--sky)" height={36} />
        <div>
          <div className="login__dots">
            <i className="d1" />
            <i className="d2" />
            <i className="d3" />
          </div>
          <h1>
            Workshop time, <em>sorted.</em>
          </h1>
          <div className="login__sub">
            Clock the floor, track every job, and let the reports write themselves.
          </div>
          <div className="login__pills">
            <Pill>Offline-ready kiosks</Pill>
            <Pill>Live utilisation</Pill>
            <Pill>Job-level reporting</Pill>
          </div>
        </div>
        <div className="login__ftr">Opt Production</div>
      </aside>

      <main className="login__panel">
        <form className="login__card" onSubmit={handleSubmit}>
          <div className="login__kicker">Opt Production</div>
          <h2>Sign in</h2>
          <div className="login__lede">
            Welcome back. Enter your details to manage your workshop.
          </div>

          <Field
            label="Workshop subdomain"
            type="text"
            autoComplete="organization"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            icon={<MailIcon />}
          />

          <Field
            label="Email address"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<MailIcon />}
          />

          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<EyeIcon />}
          />

          <div className="login__row">
            <label className="login__remember">
              <input
                type="checkbox"
                className="box"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Keep me signed in
            </label>
            <a className="login__link" href="#">
              Forgot password?
            </a>
          </div>

          {error ? (
            <div
              className="login__error"
              style={{ color: 'var(--rose, #c0392b)', fontSize: 14, marginTop: 16 }}
            >
              {error}
            </div>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            dot
            fullWidth
            disabled={busy}
            style={{ marginTop: 24 }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <button
            type="button"
            onClick={() => navigate('/kiosk')}
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: 'var(--sky)',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              margin: '16px auto 0',
              display: 'block',
              textDecoration: 'underline',
              textUnderlineOffset: 4,
            }}
          >
            Open workshop kiosk
          </button>
          <div className="login__foot">Trouble signing in? Message support from the app.</div>
        </form>
      </main>
    </div>
  );
}
