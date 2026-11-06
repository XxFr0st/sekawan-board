import { useState } from 'react';
import { api } from '../api.js';

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : form;
      const r = await api(`/auth/${mode === 'login' ? 'login' : 'register'}`, { method: 'POST', body });
      onAuthed(r.user, r.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth-intro">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /> Sekawan Board</div>
        <h1>Atur tugas kuliah dan proyek dalam satu papan.</h1>
        <p>Catat tugas, beri prioritas dan tenggat, lalu geser dari “Belum dikerjakan” sampai “Selesai”.</p>
        <ul>
          <li>Papan tugas tiga kolom dengan drag and drop</li>
          <li>Kategori berwarna, pencarian, dan filter prioritas</li>
          <li>Dashboard progres dan pengingat tugas terlambat</li>
        </ul>
      </section>

      <section className="auth-form">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => { setMode('login'); setError(''); }}>Masuk</button>
          <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => { setMode('register'); setError(''); }}>Daftar</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>Nama lengkap
              <input value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} />
            </label>
          )}
          <label>Email
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
          </label>
          <label>Password
            <input type="password" value={form.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {mode === 'register' && <small>Minimal 8 karakter</small>}
          </label>
          {error && <div className="alert" role="alert">{error}</div>}
          <button className="btn primary wide" disabled={busy}>
            {busy ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Buat akun'}
          </button>
        </form>
      </section>
    </div>
  );
}
