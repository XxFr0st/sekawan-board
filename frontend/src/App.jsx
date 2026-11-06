import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken, onUnauthorized } from './api.js';
import AuthPage from './pages/AuthPage.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tasks from './pages/Tasks.jsx';
import Categories from './pages/Categories.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tasks', label: 'Tugas' },
  { id: 'categories', label: 'Kategori' },
];

const currentPage = () => {
  const h = window.location.hash.replace('#', '');
  return NAV.some((n) => n.id === h) ? h : 'dashboard';
};

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(getToken()));
  const [page, setPage] = useState(currentPage);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    onUnauthorized(logout);
    const onHash = () => setPage(currentPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [logout]);

  // Pulihkan sesi dari token yang tersimpan
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <div className="boot">Memuat…</div>;
  if (!user) return <AuthPage onAuthed={(u, token) => { setToken(token); setUser(u); }} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /> Sekawan Board</div>
        <nav aria-label="Menu utama">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={page === n.id ? 'active' : ''} aria-current={page === n.id ? 'page' : undefined}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="me">
          <div className="me-name">{user.name}</div>
          <div className="me-mail">{user.email}</div>
          <button className="btn ghost-light" onClick={logout}>Keluar</button>
        </div>
      </aside>
      <main className="main">
        {page === 'dashboard' && <Dashboard user={user} />}
        {page === 'tasks' && <Tasks />}
        {page === 'categories' && <Categories />}
      </main>
    </div>
  );
}
