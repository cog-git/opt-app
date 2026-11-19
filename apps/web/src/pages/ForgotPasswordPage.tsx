import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Logo, Pill } from '@opt/ui';
import { MailIcon } from '../icons';
import { ApiError, forgotPassword } from '../api';
import './login.css';

/**
 * "Forgot password?" landing page off the login screen. Submitting always
 * shows the same generic confirmation — the API never reveals whether an
 * account exists for the given subdomain/email, so the UI shouldn't either.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [subdomain, setSubdomain] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await forgotPassword(subdomain.trim(), email.trim());
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not reach the server. Is the API running?',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <aside className="login__brand">
        <Logo color="var(--flora)" height={36} />
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
        {sent ? (
          <div className="login__card">
            <div className="login__kicker">Opt Production</div>
            <h2>Check your email</h2>
            <div className="login__lede">
              If an account exists for that email, we&apos;ve sent a link to reset your password.
            </div>
            <Button
              type="button"
              variant="primary"
              dot
              fullWidth
              style={{ marginTop: 24 }}
              onClick={() => navigate('/login')}
            >
              Back to sign in
            </Button>
          </div>
        ) : (
          <form className="login__card" onSubmit={handleSubmit}>
            <div className="login__kicker">Opt Production</div>
            <h2>Forgot password?</h2>
            <div className="login__lede">
              Enter your workshop and email address and we&apos;ll send you a link to reset your password.
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

            {error ? (
              <div
                className="login__error"
                style={{ color: 'var(--rose)', fontSize: 14, marginTop: 16 }}
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
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/login')}
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
              Back to sign in
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
