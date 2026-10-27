// Kitchen Whiz enquiries — Cloudflare Worker, enquiry.kitchenwhiz.in
// One form per partner brand (src/brands.js), e.g. /hw; ONE team list for all brands at /team.
// Form:  POST /api/:brand/enquiries              save an enquiry
// Team:  GET  /api/team/enquiries                all brands, with notes (each has .brand)
//        POST /api/team/enquiries/:id/notes      comment / follow-up date / status
//        PUT  /api/team/enquiries/:id/items      replace the products (logged)
//        POST /api/team/enquiries/:id/confirm    send (or resend) the WhatsApp confirmation
//        GET  /api/team/prices                   dealer prices of every brand: { hw: {...}, ... }
// /api/enquiries (no brand) still works for pages opened before the move; it means "hw".
import { BRANDS } from './brands.js';
import { confirmEnabled, sendConfirmation } from './confirm.js';

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
  // columns added after launch (WhatsApp confirmation); "duplicate column" means already there
  for (const col of ["brand TEXT NOT NULL DEFAULT 'hw'", 'party TEXT', 'confirm_status TEXT', 'confirm_at TEXT', 'confirm_msg_id TEXT', 'confirm_error TEXT']) {
    try { await db.prepare(`ALTER TABLE enquiries ADD COLUMN ${col}`).run(); } catch (e) {
      if (!/duplicate column/i.test(String(e && e.message))) throw e;
    }
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_enquiries_brand ON enquiries(brand, num)').run();
  ready = true;
}
const refOf = (r) => (BRANDS[r.brand] ? BRANDS[r.brand].ref : String(r.brand || '').toUpperCase()) + '-' + r.num;
const withRef = (r) => ({ ...r, ref: refOf(r), items: JSON.parse(r.items || '[]') });

// Sends the WhatsApp confirmation and records the result on the enquiry (+ a line in team updates).
async function confirmAndRecord(env, id, author) {
  const db = env.DB;
  const r = await db.prepare('SELECT * FROM enquiries WHERE id = ?').bind(id).first();
  if (!r) return { ok: false, error: 'Enquiry not found.' };
  const B = BRANDS[r.brand] || {};
  const e = { ...withRef(r), brandName: B.name || r.brand, brandContact: B.contact || '' };
  const res = await sendConfirmation(env, e);
  const t = now();
  await db.batch([
    db.prepare('UPDATE enquiries SET confirm_status = ?, confirm_at = ?, confirm_msg_id = ?, confirm_error = ? WHERE id = ?')
      .bind(res.ok ? 'sent' : 'failed', t, res.ok ? res.id : null, res.ok ? null : res.error, id),
    db.prepare('INSERT INTO notes (enquiry_id, created_at, author, text, due_date, status) VALUES (?, ?, ?, ?, NULL, NULL)')
      .bind(id, t, author || 'Automatic', res.ok ? 'WhatsApp confirmation sent to the customer' : 'WhatsApp confirmation failed: ' + res.error),
  ]);
  return res;
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

async function saveEnquiry(req, env, ctx, brand) {
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
  const party = body.party === 'dealer' ? 'dealer' : 'customer';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return bad('Missing enquiry id.');
  if (!name) return bad('Name is required.');
  if (digits.length < 10 || digits.length > 15) return bad('Phone number should be 10 to 15 digits.');

  const db = env.DB;
  const t = now();
  const existing = await db.prepare('SELECT id, num, channel, brand FROM enquiries WHERE id = ?').bind(id).first();
  if (existing && existing.brand !== brand) return bad('This enquiry belongs to another brand.');
  if (existing) {
    // Same enquiry sent again (e.g. both WhatsApp buttons): update it, keep the number.
    const ch = [...new Set([...existing.channel.split(',').filter(Boolean), channel].filter(Boolean))].join(',');
    await db.prepare('UPDATE enquiries SET name=?, phone=?, items=?, comment=?, channel=?, party=?, updated_at=? WHERE id=?')
      .bind(name, phone, JSON.stringify(items), comment, ch, party, t, id).run();
    return json({ ok: true, id, num: existing.num, ref: refOf(existing), updated: true });
  }
  const row = await db.prepare('SELECT COALESCE(MAX(num), 1000) + 1 AS n FROM enquiries WHERE brand = ?').bind(brand).first();
  await db.prepare(`INSERT INTO enquiries (id, brand, num, created_at, updated_at, name, phone, items, comment, channel, source, party)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, brand, row.n, t, t, name, phone, JSON.stringify(items), comment, channel, str(body.source, 20) || 'form', party).run();
  // confirmation goes out once, for new enquiries only, after the reply (doesn't slow the form)
  if (confirmEnabled(env)) ctx.waitUntil(confirmAndRecord(env, id, 'Automatic').catch(() => {}));
  return json({ ok: true, id, num: row.n, ref: refOf({ brand, num: row.n }), confirm: confirmEnabled(env) });
}

async function listEnquiries(env) {
  const db = env.DB;
  const [{ results: rows }, { results: notes }] = await Promise.all([
    db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 3000').all(),
    db.prepare('SELECT * FROM notes ORDER BY created_at ASC').all(),
  ]);
  const byId = {};
  for (const n of notes) (byId[n.enquiry_id] ||= []).push(n);
  return json({
    enquiries: rows.map((r) => ({ ...withRef(r), notes: byId[r.id] || [] })),
    statuses: STATUSES,
    confirmEnabled: confirmEnabled(env),
    brands: Object.fromEntries(Object.entries(BRANDS).map(([k, b]) => [k, { name: b.name, ref: b.ref }])),
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

async function saveItems(req, env, id) {
  let body;
  try { body = await req.json(); } catch { return bad('Send the products as JSON.'); }
  const db = env.DB;
  const enq = await db.prepare('SELECT id, items FROM enquiries WHERE id = ?').bind(id).first();
  if (!enq) return bad('Enquiry not found.', 404);
  const author = str(body.author, 80);
  if (!author) return bad('Enter your name so the team knows who updated it.');
  const items = cleanItems(body.items);
  const before = JSON.parse(enq.items || '[]');
  // describe the change for the updates log
  const key = (i) => i.m.toLowerCase();
  const old = new Map(before.map((i) => [key(i), i]));
  const neu = new Map(items.map((i) => [key(i), i]));
  const parts = [];
  for (const [k, i] of neu) {
    const o = old.get(k);
    if (!o) parts.push(`added ${i.m} ×${i.qty}`);
    else if (o.qty !== i.qty) parts.push(`${i.m} qty ${o.qty} → ${i.qty}`);
  }
  for (const [k, o] of old) if (!neu.has(k)) parts.push(`removed ${o.m}`);
  if (!parts.length) return bad('No changes to the products.');
  const t = now();
  await db.batch([
    db.prepare('UPDATE enquiries SET items = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(items), t, id),
    db.prepare('INSERT INTO notes (enquiry_id, created_at, author, text, due_date, status) VALUES (?, ?, ?, ?, NULL, NULL)')
      .bind(id, t, author, 'Products: ' + parts.join('; ')),
  ]);
  return json({ ok: true });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    // Team list only on its own address (owner, 27 Oct): not reachable through enquiry.kitchenwhiz.in.
    const isTeam = p === '/team' || p.startsWith('/team/') || p.startsWith('/api/team') || p.startsWith('/hw/team');
    const teamHost = env.TEAM_HOST || 'enquiry.kitchenwhiz.workers.dev';
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (isTeam && url.hostname !== teamHost && !local) {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
    }
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await init(env.DB);
      // ---- team list: all brands together ----
      if (p === '/api/team/enquiries' && req.method === 'GET') return await listEnquiries(env);
      if (p === '/api/team/prices' && req.method === 'GET') {
        return json({ prices: Object.fromEntries(Object.entries(BRANDS).map(([k, b]) => [k, b.prices])),
          notes: Object.fromEntries(Object.entries(BRANDS).map(([k, b]) => [k, `${b.priceNote}, wef ${b.wef}`])) });
      }
      const m = p.match(/^\/api\/team\/enquiries\/([A-Za-z0-9_-]{8,64})\/(notes|items|confirm)$/);
      if (m) {
        if (m[2] === 'notes' && req.method === 'POST') return await addNote(req, env, m[1]);
        if (m[2] === 'items' && req.method === 'PUT') return await saveItems(req, env, m[1]);
        if (m[2] === 'confirm' && req.method === 'POST') {
          if (!confirmEnabled(env)) return bad('Automatic WhatsApp confirmation is not set up yet.');
          let b = {}; try { b = await req.json(); } catch {}
          const author = str(b.author, 80);
          if (!author) return bad('Enter your name so the team knows who sent it.');
          const res = await confirmAndRecord(env, m[1], author);
          return res.ok ? json({ ok: true }) : bad(res.error, 502);
        }
      }
      // ---- forms: one per brand. /api/enquiries (no brand) = pages opened before the move to /hw ----
      const fm = p === '/api/enquiries' ? [null, 'hw'] : p.match(/^\/api\/([a-z0-9-]{1,30})\/enquiries$/);
      if (fm && req.method === 'POST') {
        if (!BRANDS[fm[1]]) return bad('Unknown brand.', 404);
        return await saveEnquiry(req, env, ctx, fm[1]);
      }
      return bad('Not found.', 404);
    } catch (e) {
      return bad('Server error: ' + (e && e.message ? e.message : String(e)), 500);
    }
  },
};
