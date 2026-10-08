// Kitchen Whiz enquiries — Cloudflare Worker
// Public:  GET /            customer enquiry form (public/index.html)
//          POST /api/enquiries   save an enquiry (called when the customer taps a WhatsApp button)
// Team:    GET /team         team enquiries page (public/team/index.html)
//          GET  /api/team/enquiries            list with notes
//          POST /api/team/enquiries/:id/notes  add a comment / set follow-up date / status
//          GET  /api/team/prices               dealer prices
// Everything under /team and /api/team can later be put behind Cloudflare Access (see README).
import PRICES from './prices.js';

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];
let ready = false;

async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS enquiries (
      id TEXT PRIMARY KEY,
      num INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      items TEXT NOT NULL DEFAULT '[]',
      comment TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      due_date TEXT,
      source TEXT NOT NULL DEFAULT 'form'
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enquiry_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      status TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_notes_enquiry ON notes(enquiry_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at)'),
  ]);
  ready = true;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const bad = (msg, status = 400) => json({ error: msg }, status);
const str = (v, max) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const now = () => new Date().toISOString();
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function cleanItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 100).map((i) => ({
    b: str(i?.b, 40),
    c: str(i?.c, 120),
    m: str(i?.m, 120),
    d: str(i?.d, 200),
    qty: Math.max(1, Math.min(9999, parseInt(i?.qty, 10) || 1)),
  })).filter((i) => i.m);
}

async function saveEnquiry(req, env) {
  let body;
  try { body = await req.json(); } catch { return bad('Send the enquiry as JSON.'); }
  if (str(body.website, 200)) return json({ ok: true }); // honeypot: bots fill hidden fields
  const id = str(body.id, 64);
  const name = str(body.name, 120);
  const phone = str(body.phone, 30);
  const digits = phone.replace(/\D/g, '');
  const items = cleanItems(body.items);
  const comment = str(body.comment, 4000);
  const channel = str(body.channel, 20);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return bad('Missing enquiry id.');
  if (!name) return bad('Name is required.');
  if (digits.length < 10 || digits.length > 15) return bad('Phone number should be 10 to 15 digits.');

  const db = env.DB;
  const t = now();
  const existing = await db.prepare('SELECT id, num, channel FROM enquiries WHERE id = ?').bind(id).first();
  if (existing) {
    // Same enquiry sent again (e.g. both WhatsApp buttons): update it, keep the number.
    const ch = [...new Set([...existing.channel.split(',').filter(Boolean), channel].filter(Boolean))].join(',');
    await db.prepare('UPDATE enquiries SET name=?, phone=?, items=?, comment=?, channel=?, updated_at=? WHERE id=?')
      .bind(name, phone, JSON.stringify(items), comment, ch, t, id).run();
    return json({ ok: true, id, num: existing.num, updated: true });
  }
  const row = await db.prepare('SELECT COALESCE(MAX(num), 1000) + 1 AS n FROM enquiries').first();
  await db.prepare(`INSERT INTO enquiries (id, num, created_at, updated_at, name, phone, items, comment, channel, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, row.n, t, t, name, phone, JSON.stringify(items), comment, channel, str(body.source, 20) || 'form').run();
  return json({ ok: true, id, num: row.n });
}

async function listEnquiries(env) {
  const db = env.DB;
  const [{ results: rows }, { results: notes }] = await Promise.all([
    db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 2000').all(),
    db.prepare('SELECT * FROM notes ORDER BY created_at ASC').all(),
  ]);
  const byId = {};
  for (const n of notes) (byId[n.enquiry_id] ||= []).push(n);
  return json({
    enquiries: rows.map((r) => ({ ...r, items: JSON.parse(r.items || '[]'), notes: byId[r.id] || [] })),
    statuses: STATUSES,
  });
}

async function addNote(req, env, id) {
  let body;
  try { body = await req.json(); } catch { return bad('Send the update as JSON.'); }
  const db = env.DB;
  const enq = await db.prepare('SELECT id, status, due_date FROM enquiries WHERE id = ?').bind(id).first();
  if (!enq) return bad('Enquiry not found.', 404);
  const author = str(body.author, 80);
  const text = str(body.text, 4000);
  const status = body.status ? str(body.status, 20) : null;
  const clearDue = body.due_date === '';
  const due = body.due_date ? str(body.due_date, 10) : null;
  if (status && !STATUSES.includes(status)) return bad('Unknown status.');
  if (due && !isDate(due)) return bad('Follow-up date should be a date.');
  const statusChanged = status && status !== enq.status;
  const dueChanged = clearDue ? enq.due_date != null : (due && due !== enq.due_date);
  if (!text && !statusChanged && !dueChanged) return bad('Nothing to save: write a comment, or change the status or follow-up date.');
  if (!author) return bad('Enter your name so the team knows who updated it.');
  const t = now();
  await db.batch([
    db.prepare('INSERT INTO notes (enquiry_id, created_at, author, text, due_date, status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, t, author, text, dueChanged ? (clearDue ? '' : due) : null, statusChanged ? status : null),
    db.prepare('UPDATE enquiries SET status = ?, due_date = ?, updated_at = ? WHERE id = ?')
      .bind(statusChanged ? status : enq.status, dueChanged ? (clearDue ? null : due) : enq.due_date, t, id),
  ]);
  return json({ ok: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await init(env.DB);
      if (p === '/api/enquiries' && req.method === 'POST') return await saveEnquiry(req, env);
      if (p === '/api/team/enquiries' && req.method === 'GET') return await listEnquiries(env);
      const m = p.match(/^\/api\/team\/enquiries\/([A-Za-z0-9_-]{8,64})\/notes$/);
      if (m && req.method === 'POST') return await addNote(req, env, m[1]);
      if (p === '/api/team/prices' && req.method === 'GET') return json({ prices: PRICES, wef: '2026-04-01', note: 'Dealer price (DP), GST extra' });
      return bad('Not found.', 404);
    } catch (e) {
      return bad('Server error: ' + (e && e.message ? e.message : String(e)), 500);
    }
  },
};
