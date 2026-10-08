// Team enquiries page: list, prices, call / WhatsApp, comments, follow-up date, status.
const $ = (s, el = document) => el.querySelector(s);
const STATUS_LABEL = { new: "New", contacted: "Contacted", quoted: "Quoted", won: "Won", lost: "Lost" };
const OPEN = (e) => e.status !== "won" && e.status !== "lost";
const TABS = [
  { k: "action", label: "To action", test: (e) => OPEN(e) && (e.status === "new" || !e.due_date || e.due_date <= today()) },
  { k: "due", label: "Follow-ups due", test: (e) => OPEN(e) && e.due_date && e.due_date <= today(), alert: true },
  { k: "new", label: "New", test: (e) => e.status === "new" },
  { k: "open", label: "All open", test: OPEN },
  { k: "won", label: "Won", test: (e) => e.status === "won" },
  { k: "lost", label: "Lost", test: (e) => e.status === "lost" },
  { k: "all", label: "All", test: () => true },
];
const state = { all: [], prices: {}, edit: {}, tab: "action", q: "", open: new Set(), drafts: {}, loadedAt: null, busy: false };

function today(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const inr = (n) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
function fmtDate(iso) { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
function fmtDay(ymd) { const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); }
function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago"; return Math.floor(s / 86400) + " d ago";
}
function waNumber(phone) {
  let d = String(phone).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d;
}
function me() { return $("#me").value.trim(); }
try { $("#me").value = localStorage.getItem("enq-me") || ""; } catch (_) {}
$("#me").addEventListener("input", () => { try { localStorage.setItem("enq-me", me()); } catch (_) {} });

async function load(quiet) {
  if (state.busy) return; state.busy = true;
  if (!quiet) $("#statusLine").textContent = "Loading…";
  try {
    const [r1, r2] = await Promise.all([
      fetch("/api/team/enquiries", { cache: "no-store" }),
      Object.keys(state.prices).length ? null : fetch("/api/team/prices"),
    ]);
    if (!r1.ok) throw new Error((await r1.json().catch(() => ({}))).error || r1.statusText);
    state.all = (await r1.json()).enquiries;
    if (r2) state.prices = (await r2.json()).prices || {};
    state.loadedAt = new Date();
    render();
  } catch (e) {
    $("#statusLine").textContent = "Couldn't load enquiries: " + e.message + ". Retrying in a minute.";
  } finally { state.busy = false; }
}

function sortKey(e) {
  // overdue first, then due today, then new without date, then by due date, then newest
  const t = today();
  const g = !OPEN(e) ? 5 : e.due_date && e.due_date < t ? 0 : e.due_date === t ? 1 : e.status === "new" ? 2 : e.due_date ? 3 : 4;
  return [g, e.due_date || "9999", -new Date(e.created_at)];
}
function cmp(a, b) { const x = sortKey(a), y = sortKey(b); for (let i = 0; i < 3; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; } return 0; }

function matches(e, q) {
  if (!q) return true;
  const hay = [e.name, e.phone, e.phone.replace(/\D/g, ""), "e-" + e.num, e.comment, ...e.items.map((i) => i.m + " " + i.d + " " + i.c + " " + i.b), ...e.notes.map((n) => n.text + " " + n.author)].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

function renderTabs() {
  $("#tabs").innerHTML = TABS.map((t) => {
    const n = state.all.filter(t.test).length;
    return `<button type="button" class="tab${t.alert && n ? " alert" : ""}" data-tab="${t.k}" aria-pressed="${state.tab === t.k}">${t.label}<span class="n">${n}</span></button>`;
  }).join("");
}
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (!b) return; state.tab = b.dataset.tab; render(); });
$("#q").addEventListener("input", (e) => { state.q = e.target.value; render(); });

function dueChip(e) {
  if (!e.due_date || !OPEN(e)) return "";
  const t = today(), cls = e.due_date < t ? "over" : e.due_date === t ? "tdy" : "";
  const txt = e.due_date < t ? "Overdue · " + fmtDay(e.due_date) : e.due_date === t ? "Follow up today" : "Follow up " + fmtDay(e.due_date);
  return `<span class="due ${cls}">${txt}</span>`;
}

/* ---------- product editor ---------- */
const PRODUCTS = (window.HW_PRODUCTS || []).map((d) => ({ ...d,
  h: (d.m + " " + d.m.replace(/[\s\-\/]/g, "") + " " + d.d + " " + d.d.replace(/[\s\-\/]/g, "") + " " + d.c + " " + d.b).toLowerCase(),
  mc: d.m.toLowerCase().replace(/[\s\-\/]/g, ""), parts: d.m.toLowerCase().split("/").map((x) => x.replace(/[\s\-]/g, "")) }));
function findProducts(q) {
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean); if (!toks.length) return [];
  const qc = q.toLowerCase().replace(/[\s\-\/]/g, "");
  const score = (d) => { const i = d.mc.indexOf(qc); return d.mc === qc ? 0 : i === 0 || d.parts.some((x) => x.startsWith(qc)) ? 1 : i > 0 ? 2 : 3; };
  return PRODUCTS.filter((d) => toks.every((t) => d.h.includes(t))).map((d) => [score(d), d.mc.length, d]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]).slice(0, 20);
}
function editorHtml(e) {
  const ed = state.edit[e.id];
  const rows = ed.items.length ? ed.items.map((i, n) => {
    const p = state.prices[i.m];
    return `<div class="erow"><div style="min-width:0"><div class="code">${esc(i.m)}</div><div class="meta">${esc([i.b, i.c, i.d].filter(Boolean).join(" · "))}${p != null ? " · DP " + inr(p) : ""}</div></div>
      <input type="number" min="1" max="9999" value="${i.qty}" data-eq="${n}" aria-label="Quantity of ${esc(i.m)}">
      <button type="button" class="x" data-er="${n}" aria-label="Remove ${esc(i.m)}">×</button></div>`;
  }).join("") : `<div class="meta" style="padding:4px 0">No products yet. Add them below.</div>`;
  return `<div class="ped" data-ped="${e.id}"><div class="lbl">Products · editing</div>
    <div class="erows">${rows}</div>
    <div class="searchbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input data-es="${e.id}" type="search" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="Add a model: type the model number, then Enter" aria-label="Add a model">
      <div class="pop" data-epop hidden></div></div>
    <div class="eact"><button type="button" class="save" data-esave="${e.id}">Save products</button><button type="button" class="linkbtn" data-ecancel="${e.id}">Cancel</button></div>
    <div class="msg" data-eerr></div></div>`;
}
function renderPop(id) {
  const ed = state.edit[id], box = document.querySelector(`[data-ped="${id}"] [data-epop]`); if (!box) return;
  if (!ed.q.trim()) { box.hidden = true; return; }
  ed.list = findProducts(ed.q); if (ed.active >= ed.list.length) ed.active = 0;
  box.hidden = false;
  box.innerHTML = ed.list.length ? ed.list.map((d, n) => `<div class="opt${n === ed.active ? " act" : ""}" data-eo="${n}"><div style="min-width:0"><div class="code">${esc(d.m)}</div>
      <div class="meta"><span class="tag">${d.b}</span><span>${esc(d.c)}</span>${d.d ? `<span>· ${esc(d.d)}</span>` : ""}</div></div><span class="side">${state.prices[d.m] != null ? inr(state.prices[d.m]) : ""}</span></div>`).join("")
    : `<div class="opt" data-etyped><div><div class="code">${esc(ed.q.trim())}</div><div class="meta">Not in the price list · add as typed</div></div><span class="side">↵</span></div>`;
}
function addToEditor(id, d) {
  const ed = state.edit[id];
  const ex = ed.items.find((i) => i.m.toLowerCase() === d.m.toLowerCase());
  if (ex) ex.qty++; else ed.items.push({ b: d.b || "", c: d.c || "Not in list", m: d.m, d: d.d || "", qty: 1 });
  ed.q = ""; ed.active = 0; render();
  const inp = document.querySelector(`[data-es="${id}"]`); if (inp) inp.focus();
}

function itemsTable(e) {
  if (state.edit[e.id]) return editorHtml(e);
  if (!e.items.length) return `<div><div class="lbl">Products</div><div class="cmt" style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span>No products given.</span><button type="button" class="act" data-eopen="${e.id}">+ Add products</button></div></div>`;
  let total = 0, missing = 0;
  const rows = e.items.map((i) => {
    const p = state.prices[i.m];
    if (p == null) missing++; else total += p * i.qty;
    return `<tr><td><div class="code">${esc(i.m)}</div><div class="meta">${esc([i.b, i.c, i.d].filter(Boolean).join(" · "))}</div></td>
      <td class="num">${i.qty}</td><td class="num">${p == null ? "—" : inr(p)}</td><td class="num">${p == null ? "—" : inr(p * i.qty)}</td></tr>`;
  }).join("");
  return `<div><div class="lbl" style="display:flex;justify-content:space-between;align-items:center">Products<button type="button" class="linkbtn" data-eopen="${e.id}">Edit products</button></div><div class="tbl"><table>
    <thead><tr><th>Model</th><th class="num">Qty</th><th class="num">DP</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">Total DP, GST extra${missing ? ` · ${missing} item${missing > 1 ? "s" : ""} without price` : ""}</td><td class="num">${inr(total)}</td></tr></tfoot>
  </table></div></div>`;
}

function notesHtml(e) {
  if (!e.notes.length) return `<div class="note"><span class="when">No team updates yet.</span></div>`;
  return e.notes.map((n) => {
    const chg = [];
    if (n.status) chg.push("Status → " + (STATUS_LABEL[n.status] || n.status));
    if (n.due_date != null) chg.push(n.due_date ? "Follow-up → " + fmtDay(n.due_date) : "Follow-up date cleared");
    return `<div class="note"><span class="when">${esc(n.author)} · ${fmtDate(n.created_at)}</span>
      ${chg.length ? `<span class="chg">${esc(chg.join(" · "))}</span>` : ""}${n.text ? `<span>${esc(n.text)}</span>` : ""}</div>`;
  }).join("");
}

function card(e) {
  const open = state.open.has(e.id);
  const t = today();
  const cls = OPEN(e) && e.due_date ? (e.due_date < t ? " overdue" : e.due_date === t ? " today" : "") : "";
  const models = e.items.length ? e.items.map((i) => i.m + (i.qty > 1 ? " ×" + i.qty : "")).join(", ") : (e.comment || "No products or comment — call to ask");
  const wa = waNumber(e.phone);
  const first = e.name.split(" ")[0];
  const msg = `Hi ${first}, this is ${me() || "the team"} from Kitchen Whiz about your enquiry` +
    (e.items.length ? ` for ${e.items.map((i) => i.m).slice(0, 4).join(", ")}${e.items.length > 4 ? " and more" : ""}` : "") + ".";
  const d = state.drafts[e.id] || { text: "", due: e.due_date || "", status: e.status };
  return `<article class="enq${cls}" data-id="${e.id}">
    <div class="head" data-toggle="${e.id}" role="button" tabindex="0" aria-expanded="${open}">
      <div style="min-width:0">
        <div class="who"><span class="nm">${esc(e.name)}</span><span class="ph">${esc(e.phone)}</span><span class="ref">E-${e.num}</span></div>
        <div class="sum">${esc(models)}</div>
      </div>
      <div class="badges">${dueChip(e)}<span class="pill s-${e.status}">${STATUS_LABEL[e.status] || e.status}</span><span class="age" title="${esc(fmtDate(e.created_at))}">${ago(e.created_at)}</span></div>
    </div>
    ${open ? `<div class="body">
      <div class="actions">
        <a class="act call" href="tel:+${wa}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1Z"/></svg>Call ${esc(e.phone)}</a>
        <a class="act wa" href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3a.5.5 0 0 0 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.1.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z"/></svg>WhatsApp</a>
      </div>
      ${itemsTable(e)}
      ${e.comment ? `<div><div class="lbl">Customer comment</div><div class="cmt">${esc(e.comment)}</div></div>` : ""}
      <div><div class="lbl">Team updates</div><div class="notes">${notesHtml(e)}</div></div>
      <form class="upd" data-upd="${e.id}">
        <label for="t-${e.id}">Comment<textarea id="t-${e.id}" name="text" placeholder="e.g. Called, wants quote for 2 units; site visit Saturday">${esc(d.text)}</textarea></label>
        <div class="row3">
          <label for="d-${e.id}">Follow-up date<input id="d-${e.id}" name="due" type="date" value="${esc(d.due)}"></label>
          <label for="s-${e.id}">Status<select id="s-${e.id}" name="status">${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}"${d.status === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          <button class="save" type="submit">Save update</button>
        </div>
        <div class="quick" aria-label="Quick follow-up dates">
          <button type="button" data-days="1">Tomorrow</button><button type="button" data-days="3">In 3 days</button><button type="button" data-days="7">In a week</button><button type="button" data-days="">No date</button>
        </div>
        <div class="msg" data-err></div>
      </form>
      <div class="age">Received ${esc(fmtDate(e.created_at))}${e.channel ? " · sent via " + esc(e.channel.replace("group", "WhatsApp group").replace("direct", "WhatsApp").replace("form", "form only")) : ""}</div>
    </div>` : ""}
  </article>`;
}

function render() {
  renderTabs();
  const tab = TABS.find((t) => t.k === state.tab);
  const list = state.all.filter(tab.test).filter((e) => matches(e, state.q)).sort(cmp);
  $("#list").innerHTML = list.length ? list.map(card).join("") :
    `<div class="placeholder">${state.all.length ? "Nothing here. Try another tab or clear the search." : "No enquiries yet. They appear here as soon as a customer sends the form."}</div>`;
  $("#statusLine").textContent = `${list.length} shown · updated ${state.loadedAt ? state.loadedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "—"}`;
}

$("#list").addEventListener("click", (ev) => {
  const h = ev.target.closest("[data-toggle]");
  if (h && !ev.target.closest("a")) { const id = h.dataset.toggle; state.open.has(id) ? state.open.delete(id) : state.open.add(id); render(); return; }
  const q = ev.target.closest("[data-days]");
  if (q) { const f = q.closest("form"); f.due.value = q.dataset.days === "" ? "" : today(+q.dataset.days); keepDraft(f); }
});
$("#list").addEventListener("click", (ev) => {
  const o = ev.target.closest("[data-eopen]");
  if (o) { const e = state.all.find((x) => x.id === o.dataset.eopen); state.edit[e.id] = { items: e.items.map((i) => ({ ...i })), q: "", active: 0 }; render(); const inp = document.querySelector(`[data-es="${e.id}"]`); if (inp) inp.focus(); return; }
  const ped = ev.target.closest("[data-ped]"); if (!ped) return;
  const id = ped.dataset.ped, ed = state.edit[id];
  const rm = ev.target.closest("[data-er]"); if (rm) { ed.items.splice(+rm.dataset.er, 1); render(); return; }
  const op = ev.target.closest("[data-eo]"); if (op) { addToEditor(id, ed.list[+op.dataset.eo]); return; }
  if (ev.target.closest("[data-etyped]")) { addToEditor(id, { m: ed.q.trim() }); return; }
  if (ev.target.closest("[data-ecancel]")) { delete state.edit[id]; render(); return; }
  const sv = ev.target.closest("[data-esave]");
  if (sv) {
    const err = $("[data-eerr]", ped);
    if (!me()) { err.textContent = "Enter your name at the top (Updating as) first."; $("#me").focus(); return; }
    sv.disabled = true; sv.textContent = "Saving…";
    fetch(`/api/team/enquiries/${id}/items`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ author: me(), items: ed.items }) })
      .then((r) => r.json().then((j) => { if (!r.ok) throw new Error(j.error || r.statusText); }))
      .then(() => { delete state.edit[id]; return load(true); })
      .catch((x) => { err.textContent = x.message; sv.disabled = false; sv.textContent = "Save products"; });
  }
});
$("#list").addEventListener("input", (ev) => {
  const s1 = ev.target.closest("[data-es]"); if (s1) { const ed = state.edit[s1.dataset.es]; ed.q = s1.value; ed.active = 0; renderPop(s1.dataset.es); return; }
  const q1 = ev.target.closest("[data-eq]"); if (q1) { const id = q1.closest("[data-ped]").dataset.ped; state.edit[id].items[+q1.dataset.eq].qty = Math.max(1, parseInt(q1.value, 10) || 1); }
});
$("#list").addEventListener("keydown", (ev) => {
  const s1 = ev.target.closest("[data-es]"); if (!s1) return;
  const id = s1.dataset.es, ed = state.edit[id], n = (ed.list || []).length;
  if (ev.key === "ArrowDown" && n) { ev.preventDefault(); ed.active = (ed.active + 1) % n; renderPop(id); }
  else if (ev.key === "ArrowUp" && n) { ev.preventDefault(); ed.active = (ed.active - 1 + n) % n; renderPop(id); }
  else if (ev.key === "Enter") { ev.preventDefault(); if (!ed.q.trim()) return; if (n) addToEditor(id, ed.list[ed.active]); else addToEditor(id, { m: ed.q.trim() }); }
  else if (ev.key === "Escape") { s1.value = ""; ed.q = ""; renderPop(id); }
});
$("#list").addEventListener("keydown", (ev) => { const h = ev.target.closest("[data-toggle]"); if (h && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); h.click(); } });
function keepDraft(f) { state.drafts[f.dataset.upd] = { text: f.text.value, due: f.due.value, status: f.status.value }; }
$("#list").addEventListener("input", (ev) => { const f = ev.target.closest("form[data-upd]"); if (f) keepDraft(f); });
$("#list").addEventListener("change", (ev) => { const f = ev.target.closest("form[data-upd]"); if (f) keepDraft(f); });
$("#list").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target, id = f.dataset.upd, err = $("[data-err]", f), btn = $(".save", f);
  const e = state.all.find((x) => x.id === id);
  if (!me()) { err.textContent = "Enter your name at the top (Updating as) first."; $("#me").focus(); return; }
  const body = { author: me(), text: f.text.value.trim(), status: f.status.value };
  if (f.due.value !== (e.due_date || "")) body.due_date = f.due.value; // "" clears it
  btn.disabled = true; btn.textContent = "Saving…"; err.textContent = "";
  try {
    const r = await fetch(`/api/team/enquiries/${id}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    delete state.drafts[id];
    await load(true);
  } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = "Save update"; }
});

load();
// refresh every minute and when the tab comes back, without losing typed drafts (kept in state.drafts)
setInterval(() => { if (!document.hidden && !Object.keys(state.edit).length && !document.activeElement.closest?.("form[data-upd]")) load(true); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(true); });
