import { useEffect, useState } from 'react';
import { api } from '../api.js';

const PALETTE = ['#2F54EB', '#D4380D', '#389E0D', '#722ED1', '#D48806', '#08979C', '#C41D7F'];

export default function Categories() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', color: PALETTE[0] });
  const [editing, setEditing] = useState(null); // {id, name, color}
  const [error, setError] = useState('');

  const load = () => api('/categories').then((r) => setItems(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/categories', { method: 'POST', body: form });
      setForm({ name: '', color: form.color });
      load();
    } catch (err) { setError(err.message); }
  }

  async function save() {
    setError('');
    try {
      await api(`/categories/${editing.id}`, { method: 'PUT', body: { name: editing.name, color: editing.color } });
      setEditing(null);
      load();
    } catch (err) { setError(err.message); }
  }

  async function remove(c) {
    const msg = c.task_count
      ? `Hapus kategori “${c.name}”? ${c.task_count} tugas akan menjadi tanpa kategori.`
      : `Hapus kategori “${c.name}”?`;
    if (!window.confirm(msg)) return;
    try { await api(`/categories/${c.id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  }

  const Swatches = ({ value, onPick }) => (
    <span className="swatches" role="radiogroup" aria-label="Warna kategori">
      {PALETTE.map((c) => (
        <button type="button" key={c} role="radio" aria-checked={value === c} aria-label={c}
          className={value === c ? 'on' : ''} style={{ background: c }} onClick={() => onPick(c)} />
      ))}
    </span>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Kategori</h1>
          <p className="muted">Kelompokkan tugas berdasarkan mata kuliah, proyek, atau urusan lain.</p>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <form className="panel cat-form" onSubmit={add}>
        <label>Nama kategori
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={50} />
        </label>
        <Swatches value={form.color} onPick={(color) => setForm({ ...form, color })} />
        <button className="btn primary">Tambah kategori</button>
      </form>

      <ul className="cat-list">
        {items.map((c) => (
          <li key={c.id} className="panel">
            {editing?.id === c.id ? (
              <>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Nama kategori" maxLength={50} />
                <Swatches value={editing.color} onPick={(color) => setEditing({ ...editing, color })} />
                <span className="spacer" />
                <button className="btn small primary" onClick={save}>Simpan</button>
                <button className="btn small ghost" onClick={() => setEditing(null)}>Batal</button>
              </>
            ) : (
              <>
                <span className="dot" style={{ background: c.color }} />
                <b>{c.name}</b>
                <span className="muted">{c.task_count} tugas</span>
                <span className="spacer" />
                <button className="btn small ghost" onClick={() => setEditing({ id: c.id, name: c.name, color: c.color })}>Ubah</button>
                <button className="btn small ghost danger" onClick={() => remove(c)}>Hapus</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
