import { useEffect, useRef, useState } from 'react';
import { api, STATUS_LABEL, PRIORITY_LABEL } from '../api.js';

const EMPTY = { title: '', description: '', category_id: '', priority: 'medium', status: 'todo', due_date: '' };

// Dialog native <dialog>: fokus terkunci dan tombol Esc menutup secara otomatis.
export default function TaskModal({ task, categories, onClose, onSaved }) {
  const ref = useRef(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(task?.id);

  useEffect(() => {
    setForm(task ? {
      title: task.title, description: task.description || '', category_id: task.category_id ?? '',
      priority: task.priority, status: task.status, due_date: task.due_date || '',
    } : EMPTY);
    setError('');
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, [task]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { ...form, category_id: form.category_id === '' ? null : Number(form.category_id), due_date: form.due_date || null };
    try {
      const r = editing
        ? await api(`/tasks/${task.id}`, { method: 'PUT', body })
        : await api('/tasks', { method: 'POST', body });
      onSaved(r.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current.close()}>
      <form onSubmit={submit}>
        <h2>{editing ? 'Ubah tugas' : 'Tugas baru'}</h2>
        <label>Judul
          <input value={form.title} onChange={set('title')} required maxLength={150} autoFocus />
        </label>
        <label>Deskripsi
          <textarea rows={3} value={form.description} onChange={set('description')} maxLength={2000} />
        </label>
        <div className="row2">
          <label>Kategori
            <select value={form.category_id} onChange={set('category_id')}>
              <option value="">Tanpa kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Tenggat
            <input type="date" value={form.due_date} onChange={set('due_date')} />
          </label>
        </div>
        <div className="row2">
          <label>Prioritas
            <select value={form.priority} onChange={set('priority')}>
              {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>Status
            <select value={form.status} onChange={set('status')}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => ref.current.close()}>Batal</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan tugas'}</button>
        </div>
      </form>
    </dialog>
  );
}
