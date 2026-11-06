import { useEffect, useState } from 'react';
import { api, formatDue, todayStr, PRIORITY_LABEL } from '../api.js';

function Bar({ label, value, max, color }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} /></span>
      <span className="bar-val">{value}</span>
    </div>
  );
}

export default function Dashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!stats) return <div className="muted">Memuat statistik…</div>;

  const { status, priority } = stats;
  const pct = (n) => (stats.total ? (n / stats.total) * 100 : 0);
  const maxPriority = Math.max(priority.high, priority.medium, priority.low, 1);
  const maxCat = Math.max(...stats.by_category.map((c) => c.n), 1);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Halo, {user.name.split(' ')[0]}</h1>
          <p className="muted">
            {stats.total === 0
              ? 'Belum ada tugas. Mulai dari menu Tugas.'
              : `${status.done} dari ${stats.total} tugas sudah selesai.`}
          </p>
        </div>
        <a className="btn primary" href="#tasks">Buka papan tugas</a>
      </header>

      <div className="grid-dash">
        <section className="panel progress">
          <h2>Progres keseluruhan</h2>
          <div className="big-number">{stats.completion_rate}<span>%</span></div>
          <div className="stack" role="img" aria-label={`Selesai ${status.done}, dikerjakan ${status.in_progress}, belum ${status.todo}`}>
            <span style={{ width: `${pct(status.done)}%`, background: 'var(--done)' }} />
            <span style={{ width: `${pct(status.in_progress)}%`, background: 'var(--doing)' }} />
            <span style={{ width: `${pct(status.todo)}%`, background: 'var(--todo)' }} />
          </div>
          <ul className="legend">
            <li><i style={{ background: 'var(--done)' }} />Selesai <b>{status.done}</b></li>
            <li><i style={{ background: 'var(--doing)' }} />Dikerjakan <b>{status.in_progress}</b></li>
            <li><i style={{ background: 'var(--todo)' }} />Belum <b>{status.todo}</b></li>
          </ul>
        </section>

        <section className="panel alerts">
          <div className={`mini ${stats.overdue ? 'warn' : ''}`}>
            <b>{stats.overdue}</b>
            <span>tugas terlambat</span>
          </div>
          <div className="mini">
            <b>{stats.due_this_week}</b>
            <span>jatuh tempo 7 hari ke depan</span>
          </div>
        </section>

        <section className="panel">
          <h2>Tenggat terdekat</h2>
          {stats.upcoming.length === 0 ? (
            <p className="muted">Tidak ada tugas bertenggat yang belum selesai.</p>
          ) : (
            <ul className="upcoming">
              {stats.upcoming.map((t) => (
                <li key={t.id}>
                  <span className={`due ${t.due_date < todayStr() ? 'late' : ''}`}>{formatDue(t.due_date)}</span>
                  <span className="t-title">{t.title}</span>
                  <span className={`pill p-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="col">
        <section className="panel">
          <h2>Tugas aktif per prioritas</h2>
          <Bar label="Tinggi" value={priority.high} max={maxPriority} color="var(--high)" />
          <Bar label="Sedang" value={priority.medium} max={maxPriority} color="var(--med)" />
          <Bar label="Rendah" value={priority.low} max={maxPriority} color="var(--low)" />
        </section>

        <section className="panel">
          <h2>Tugas per kategori</h2>
          {stats.by_category.length === 0 && <p className="muted">Belum ada kategori.</p>}
          {stats.by_category.map((c) => (
            <Bar key={c.id} label={c.name} value={c.n} max={maxCat} color={c.color} />
          ))}
        </section>
        </div>
      </div>
    </>
  );
}
