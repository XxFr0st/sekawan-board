import { useCallback, useEffect, useState } from 'react';
import { api, formatDue, todayStr, STATUS_LABEL, PRIORITY_LABEL } from '../api.js';
import TaskModal from '../components/TaskModal.jsx';

const COLUMNS = ['todo', 'in_progress', 'done'];
const NEXT = { todo: ['in_progress', 'Mulai kerjakan'], in_progress: ['done', 'Tandai selesai'], done: ['todo', 'Buka kembali'] };

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ q: '', priority: '', category_id: '' });
  const [modal, setModal] = useState(null); // null | {} (baru) | task (ubah)
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ limit: '200' });
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    try {
      const r = await api(`/tasks?${qs}`);
      setTasks(r.data);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { api('/categories').then((r) => setCategories(r.data)).catch(() => {}); }, []);
  // Jeda 300 ms agar pencarian tidak memanggil API di setiap ketikan
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  async function move(task, status) {
    try {
      const r = await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status } });
      setTasks((list) => list.map((t) => (t.id === task.id ? r.data : t)));
    } catch (e) { setError(e.message); }
  }

  async function remove(task) {
    if (!window.confirm(`Hapus tugas “${task.title}”?`)) return;
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      setTasks((list) => list.filter((t) => t.id !== task.id));
    } catch (e) { setError(e.message); }
  }

  const onDrop = (status) => (e) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/plain'));
    const task = tasks.find((t) => t.id === id);
    if (task && task.status !== status) move(task, status);
  };

  const today = todayStr();
  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Papan tugas</h1>
          <p className="muted">{tasks.length} tugas{Object.values(filters).some(Boolean) ? ' sesuai filter' : ''}. Geser kartu untuk mengubah status.</p>
        </div>
        <button className="btn primary" onClick={() => setModal({})}>Tugas baru</button>
      </header>

      <div className="filters">
        <input type="search" placeholder="Cari judul atau deskripsi" value={filters.q} onChange={setFilter('q')} aria-label="Cari tugas" />
        <select value={filters.priority} onChange={setFilter('priority')} aria-label="Filter prioritas">
          <option value="">Semua prioritas</option>
          {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.category_id} onChange={setFilter('category_id')} aria-label="Filter kategori">
          <option value="">Semua kategori</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="board">
        {COLUMNS.map((status) => {
          const items = tasks.filter((t) => t.status === status);
          return (
            <section key={status} className={`column c-${status} ${dragOver === status ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
              onDragLeave={() => setDragOver(null)} onDrop={onDrop(status)}>
              <h2>{STATUS_LABEL[status]} <span className="count">{items.length}</span></h2>
              {!loading && items.length === 0 && <p className="empty">Tidak ada tugas</p>}
              {items.map((t) => (
                <article key={t.id} className={`card pr-${t.priority}`} draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}>
                  <div className="card-top">
                    {t.category_name && <span className="chip" style={{ '--c': t.category_color }}>{t.category_name}</span>}
                    <span className={`pill p-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                  </div>
                  <h3>{t.title}</h3>
                  {t.description && <p className="desc">{t.description}</p>}
                  {t.due_date && (
                    <p className={`due-line ${t.status !== 'done' && t.due_date < today ? 'late' : ''}`}>
                      {t.status !== 'done' && t.due_date < today ? 'Terlambat · ' : 'Tenggat '}{formatDue(t.due_date)}
                    </p>
                  )}
                  <div className="card-actions">
                    <button className="btn small" onClick={() => move(t, NEXT[t.status][0])}>{NEXT[t.status][1]}</button>
                    <button className="btn small ghost" onClick={() => setModal(t)}>Ubah</button>
                    <button className="btn small ghost danger" onClick={() => remove(t)}>Hapus</button>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>

      {modal && (
        <TaskModal task={modal.id ? modal : null} categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }} />
      )}
    </>
  );
}
