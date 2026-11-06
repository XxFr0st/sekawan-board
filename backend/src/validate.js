const STATUSES = ['todo', 'in_progress', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function validateRegister(body = {}) {
  const errors = [];
  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (name.length < 2 || name.length > 100) errors.push('Nama harus 2-100 karakter');
  if (!EMAIL_RE.test(email) || email.length > 255) errors.push('Format email tidak valid');
  if (password.length < 8) errors.push('Password minimal 8 karakter');
  return { errors, value: { name, email, password } };
}

function validateCategory(body = {}) {
  const errors = [];
  const name = str(body.name);
  const color = str(body.color) || '#2F54EB';
  if (name.length < 1 || name.length > 50) errors.push('Nama kategori harus 1-50 karakter');
  if (!COLOR_RE.test(color)) errors.push('Warna harus berformat hex, contoh #2F54EB');
  return { errors, value: { name, color } };
}

// partial=true dipakai untuk PUT/PATCH sehingga hanya field yang dikirim yang divalidasi
function validateTask(body = {}, { partial = false } = {}) {
  const errors = [];
  const value = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  if (!partial || has('title')) {
    const title = str(body.title);
    if (title.length < 1 || title.length > 150) errors.push('Judul harus 1-150 karakter');
    value.title = title;
  }
  if (has('description')) {
    const d = typeof body.description === 'string' ? body.description : '';
    if (d.length > 2000) errors.push('Deskripsi maksimal 2000 karakter');
    value.description = d;
  }
  if (has('status')) {
    if (!STATUSES.includes(body.status)) errors.push(`Status harus salah satu dari: ${STATUSES.join(', ')}`);
    value.status = body.status;
  }
  if (has('priority')) {
    if (!PRIORITIES.includes(body.priority)) errors.push(`Prioritas harus salah satu dari: ${PRIORITIES.join(', ')}`);
    value.priority = body.priority;
  }
  if (has('due_date')) {
    if (body.due_date === null || body.due_date === '') value.due_date = null;
    else if (typeof body.due_date === 'string' && DATE_RE.test(body.due_date) && !Number.isNaN(Date.parse(body.due_date)))
      value.due_date = body.due_date;
    else errors.push('Format due_date harus YYYY-MM-DD');
  }
  if (has('category_id')) {
    if (body.category_id === null || body.category_id === '') value.category_id = null;
    else if (Number.isInteger(Number(body.category_id)) && Number(body.category_id) > 0)
      value.category_id = Number(body.category_id);
    else errors.push('category_id tidak valid');
  }
  return { errors, value };
}

module.exports = { STATUSES, PRIORITIES, validateRegister, validateCategory, validateTask };
