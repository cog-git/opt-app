import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo, Tile } from '@opt/ui';
import { ClockIcon, ListIcon } from '../icons';
import { getUsers, isClockOnly } from '../kiosk/store';
import { SyncBadge } from '../kiosk/SyncBadge';
import './kiosk.css';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function liveTime(): { date: string; time: string } {
  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const date = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return { date, time };
}

/**
 * Kiosk home screen.
 * Two big flat action tiles + live "On the floor now" strip.
 * Tiles navigate to the kiosk sub-flow.
 */
export function KioskPage() {
  const navigate = useNavigate();
  const [{ date, time }, setClock] = useState(liveTime);
  const [users, setUsers] = useState(() => getUsers());

  // Update clock every 30 s
  useEffect(() => {
    const id = setInterval(() => setClock(liveTime()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Refresh floor strip when we arrive (users may have changed state in sub-flow)
  useEffect(() => {
    setUsers([...getUsers()]);
  }, []);

  const onFloor = users.filter((u) => u.clockedIn);
  const clockOnly = isClockOnly();

  return (
    <div className="kiosk">
      <header className="kiosk__top">
        <Logo color="var(--sky)" height={32} />
        <div className="kiosk__ws">
          <b>Fabrication Workshop</b>
          <span>Acme Farm Group</span>
        </div>
        <div className="kiosk__topright">
          <div className="kiosk__clock">
            <small>{date}</small>
            <span className="opt-mono">{time}</span>
          </div>
          <button className="kiosk__exit" onClick={() => navigate('/admin')}>
            Admin console
          </button>
        </div>
      </header>

      <div className={`kiosk__tiles${clockOnly ? ' kiosk__tiles--single' : ''}`}>
        <Tile
          tone="flora"
          title="Clock In / Out"
          subtitle="Tap to start or end your day"
          icon={<ClockIcon stroke="var(--ink)" />}
          onClick={() => navigate('/kiosk/verify')}
        />
        {!clockOnly && (
          <Tile
            tone="sky"
            title="Job List"
            subtitle="Pick a job to work on"
            icon={<ListIcon stroke="#fff" />}
            onClick={() => navigate('/kiosk/jobs')}
          />
        )}
      </div>

      <section className="kiosk__floor">
        <div className="h">
          <b>On the floor now</b>
          <span>{onFloor.length} clocked in</span>
        </div>
        <div className="kiosk__chips">
          {onFloor.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 15, fontWeight: 500 }}>
              Nobody clocked in yet
            </div>
          )}
          {onFloor.map((u) => (
            <div key={u.id} className="kiosk__chip">
              <div className="kiosk__av">{u.initials}</div>
              <div className="kiosk__nm">
                <b>{u.name}</b>
                <span>
                  {u.clockedInAt
                    ? `in since ${new Date(u.clockedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                    : 'clocked in'}
                </span>
              </div>
              <div className="kiosk__pdot" />
            </div>
          ))}
        </div>
      </section>

      <div className="kiosk__spacer" />
      <footer className="kiosk__foot">
        <SyncBadge />
      </footer>
    </div>
  );
}
