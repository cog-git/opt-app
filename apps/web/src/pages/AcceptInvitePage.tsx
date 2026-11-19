import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Logo, Pill } from '@opt/ui';
import { EyeIcon } from '../icons';
import { ApiError, acceptInvite, getInvite } from '../api';
import type { InviteDetails } from '../api';
import './login.css';

/**
 * Landing page for the "set up your login" link emailed when a new
 * organisation is created. Validates the invite token, then lets the
 * invitee choose a password and signs them straight into /admin.
 */
export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('This invite link is missing its token.');
      return;
    }
    getInvite(token)
      .then(setInvite)
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
      await acceptInvite(token, password);
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
            <h2>Invite link invalid</h2>
            <div className="login__lede">{loadError}</div>
          </div>
        ) : !invite ? (
          <div className="login__card">
            <div className="login__lede">Checking your invite…</div>
          </div>
        ) : (
          <form className="login__card" onSubmit={handleSubmit}>
            <div className="login__kicker">{invite.org}</div>
            <h2>Welcome, {invite.displayName}</h2>
            <div className="login__lede">
              Choose a password for {invite.email} to finish setting up your login.
            </div>

            <Field
              label="Password"
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
              {busy ? 'Setting up…' : 'Create my login'}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
