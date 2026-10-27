// Automatic WhatsApp confirmation to the customer, sent through Gupshup.
// Settings (wrangler.jsonc "vars"): GUPSHUP_APP_NAME, GUPSHUP_SOURCE (number, with country code),
// GUPSHUP_TEMPLATE_ID, GUPSHUP_TEMPLATE_PARAMS (what fills {{1}}, {{2}}… in order).
// Secret (Cloudflare dashboard → enquiry → Settings → Variables and Secrets): GUPSHUP_API_KEY.
// If any of these is missing, nothing is sent and the team page shows "not set up".

const GUPSHUP_URL = 'https://api.gupshup.io/wa/api/v1/template/msg';
const endpoint = (env) => env.GUPSHUP_URL_FOR_TESTS || GUPSHUP_URL; // tests only

export function confirmEnabled(env) {
  return !!(env.GUPSHUP_API_KEY && env.GUPSHUP_APP_NAME && env.GUPSHUP_SOURCE && env.GUPSHUP_TEMPLATE_ID);
}

export function waNumber(phone) {
  let d = String(phone).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = '91' + d;
  return d;
}

// WhatsApp template values may not contain new lines, tabs or more than 4 spaces in a row.
const clean = (s, max = 300) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, max) || '-';

// Each product as "model (type, detail)", e.g. "KM-60C (Ice Makers, 60 kg/day) x2".
// The type is shortened ("Visi Cooler – Canopy … (Fixed System)" → "Visi Cooler"); old-model notes and
// hand-typed items show just the model.
function productName(i) {
  let type = i.c && i.c !== 'Not in list' && i.c !== 'Interest' ? i.c : '';
  type = type.split(' – ')[0].replace(/\s*\(.*?\)\s*/g, ' ').trim();
  let detail = i.d && !/^old model|^typed by/i.test(i.d) ? i.d : '';
  if (detail && type.toLowerCase().includes(detail.toLowerCase())) detail = '';
  const extra = [type, detail].filter(Boolean).join(', ');
  return (extra ? `${i.m} (${extra})` : i.m) + (i.qty > 1 ? ' x' + i.qty : '');
}
function products(items) {
  if (!items.length) return 'your requirement';
  const list = items.map(productName);
  const shown = list.slice(0, 6).join('; ');
  return list.length > 6 ? `${shown} and ${list.length - 6} more` : shown;
}

// Names you can use in GUPSHUP_TEMPLATE_PARAMS, e.g. "name,ref,products" (also: firstname, brand, contact, count, phone, date)
function value(key, e) {
  switch (key) {
    case 'name': return e.name;
    case 'firstname': return e.name.split(' ')[0];
    case 'ref': return e.ref;
    case 'brand': return e.brandName;
    case 'contact': return e.brandContact;
    case 'products': return products(e.items);
    case 'count': return String(e.items.length);
    case 'phone': return e.phone;
    case 'date': return new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
    default: return key; // fixed text
  }
}

export function templateParams(env, e) {
  return String(env.GUPSHUP_TEMPLATE_PARAMS || 'name,ref,products')
    .split(',').map((k) => k.trim()).filter(Boolean).map((k) => clean(value(k, e)));
}

// Sends one confirmation. Returns { ok, id } or { ok:false, error }.
export async function sendConfirmation(env, e) {
  if (!confirmEnabled(env)) return { ok: false, error: 'Automatic confirmation is not set up.' };
  const body = new URLSearchParams({
    channel: 'whatsapp',
    source: String(env.GUPSHUP_SOURCE).replace(/\D/g, ''),
    destination: waNumber(e.phone),
    'src.name': env.GUPSHUP_APP_NAME,
    template: JSON.stringify({ id: env.GUPSHUP_TEMPLATE_ID, params: templateParams(env, e) }),
  });
  try {
    const r = await fetch(endpoint(env), {
      method: 'POST',
      headers: { apikey: env.GUPSHUP_API_KEY, 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    });
    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch {}
    if (r.ok && (j.status === 'submitted' || j.messageId)) return { ok: true, id: String(j.messageId || '') };
    const msg = j.message || (j.status && j.status !== 'submitted' ? j.status : '') || text || `HTTP ${r.status}`;
    return { ok: false, error: `Gupshup: ${String(typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 280)}` };
  } catch (err) {
    return { ok: false, error: 'Could not reach Gupshup: ' + (err && err.message ? err.message : String(err)) };
  }
}
