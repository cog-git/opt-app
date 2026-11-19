import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Logo, Pill } from '@opt/ui';
import { EyeIcon } from '../icons';
import { ApiError, getResetToken, resetPassword } from '../api';
import type { ResetTokenDetails } from '../api';
import './login.css';

/**
 * Landing page for the "reset your password" link emailed from the
 * forgot-password flow. Validates the reset token, then lets the user
 * choose a new password and signs them straight into /admin.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [reset, setReset] = useState<ResetTokenDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('This reset link is missing its token.');
      return;
    }
    getResetToken(token)
      .then(setReset)
      .catch((err) =>
        setLoadError(
          err instanceof ApiError ? err.message : 'Could not reach the server. Is the API running?',
        ),
      );
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
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
        {loadError ? (
          <div className="login__card">
            <div className="login__kicker">Opt Production</div>
            <h2>Reset link invalid</h2>
            <div className="login__lede">{loadError}</div>
          </div>
        ) : !reset ? (
          <div className="login__card">
            <div className="login__lede">Checking your reset link…</div>
          </div>
        ) : (
          <form className="login__card" onSubmit={handleSubmit}>
            <div className="login__kicker">Opt Production</div>
            <h2>Hi, {reset.displayName}</h2>
            <div className="login__lede">
              Choose a new password for {reset.email}.
            </div>

            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<EyeIcon />}
            />

            <Field
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              icon={<EyeIcon />}
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
              {busy ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
