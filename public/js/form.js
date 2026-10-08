// Customer enquiry form. Saves to /api/enquiries when a WhatsApp button (or Send enquiry) is tapped.
const CONFIG = window.ENQUIRY_CONFIG;
const DATA = window.HW_PRODUCTS;
const $ = s => document.querySelector(s);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2))).replace(/-/g,"");
const state = { brand:"", cat:"", q:"", limit:40, expanded:false, active:0, popOpen:false, picked:[], id:newId(), sent:null };
DATA.forEach((d,i)=>{ d.id=i; d.h=(d.m+" "+d.m.replace(/[\s\-\/]/g,"")+" "+d.d+" "+d.d.replace(/[\s\-\/]/g,"")+" "+d.c+" "+d.b).toLowerCase(); d.mc=d.m.toLowerCase().replace(/[\s\-\/]/g,""); d.parts=d.m.toLowerCase().split("/").map(x=>x.replace(/[\s\-]/g,"")); });
$("#total").textContent = DATA.length;

/* category select */
function fillCats(){
  const cats=[...new Set(DATA.filter(d=>!state.brand||d.b===state.brand).map(d=>d.c))];
  const sel=$("#cat"); const keep=state.cat;
  sel.innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");
  if(cats.includes(keep)) sel.value=keep; else { state.cat=""; sel.value=""; }
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function hl(text,toks){
  let out=esc(text); if(!toks.length) return out;
  toks.forEach(t=>{ if(t.length<2) return; const re=new RegExp("("+t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","ig"); out=out.replace(re,"<mark>$1</mark>"); });
  return out;
}
function search(){
  const toks=state.q.toLowerCase().split(/\s+/).filter(Boolean);
  let list=DATA.filter(d=>(!state.brand||d.b===state.brand)&&(!state.cat||d.c===state.cat)&&toks.every(t=>d.h.includes(t)));
  if(toks.length){
    // model-number first: exact, then starts with, then contains (ignoring spaces, dashes, slashes)
    const qc=state.q.toLowerCase().replace(/[\s\-\/]/g,"");
    const score=d=>{ const i=d.mc.indexOf(qc); return d.mc===qc?0 : i===0?1 : d.parts.some(x=>x.startsWith(qc))?1 : i>0?2 : 3; };
    list=list.map(d=>[score(d),d.mc.length,d]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(x=>x[2]);
  }
  return {list,toks};
}
function render(){
  const {list,toks}=search();
  const box=$("#results");
  const shown=list.slice(0,state.limit);
  // list stays collapsed until the customer searches, filters or taps "Browse all models"
  renderPop(list,toks);
  const browsing=!state.q.trim()&&(state.brand||state.cat||state.expanded);
  box.hidden=!browsing;
  if(state.q.trim()){ $("#count").textContent=`${list.length} match${list.length===1?"":"es"} for “${state.q.trim()}”${state.brand?" in "+state.brand:""}${state.cat?" · "+state.cat:""}`; return; }
  if(!browsing){
    $("#count").innerHTML=`${DATA.length} models · type above to search, or <button type="button" class="linkbtn" id="browse">Browse all models</button>`;
    $("#browse").onclick=()=>{state.expanded=true;render();};
    return;
  }
  $("#count").textContent = list.length===DATA.length ? `${DATA.length} models` : `${list.length} of ${DATA.length} models`;
  if(!state.q.trim()) $("#count").insertAdjacentHTML("beforeend",` · <button type="button" class="linkbtn" id="collapse">Hide list</button>`);
  const col=$("#collapse"); if(col) col.onclick=()=>{state.expanded=false;state.brand="";state.cat="";state.limit=40;
    document.querySelectorAll(".seg button").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.brand==="")));fillCats();render();};
  if(!list.length){
    box.innerHTML=`<div class="empty"><span>No model matches “${esc(state.q)}”${state.brand?" in "+state.brand:""}${state.cat?" · "+esc(state.cat):""}.</span>`+
      (state.q.trim()?`<button type="button" class="add" id="addTyped">Add “${esc(state.q.trim())}” to my list anyway</button>`:"")+`</div>`;
    const b=$("#addTyped"); if(b) b.onclick=()=>{ addItem({b:"",c:"Not in list",m:state.q.trim(),d:"Typed by customer",id:"t"+Date.now()}); };
    return;
  }
  box.innerHTML=shown.map(d=>{
    const p=state.picked.find(x=>x.id===d.id);
    return `<div class="row" role="listitem"><div style="min-width:0"><div class="code">${hl(d.m,toks)}</div>
      <div class="meta"><span class="tag">${d.b}</span><span>${hl(d.c,toks)}</span>${d.d?`<span>· ${hl(d.d,toks)}</span>`:""}</div></div>
      <button type="button" class="add${p?" on":""}" data-id="${d.id}" aria-label="${p?"Add one more":"Add"} ${esc(d.m)}">${p?"Added · "+p.qty:"+ Add"}</button></div>`;
  }).join("")+(list.length>shown.length?`<button type="button" class="more" id="more">Show ${Math.min(40,list.length-shown.length)} more of ${list.length-shown.length}</button>`:"");
  const more=$("#more"); if(more) more.onclick=()=>{state.limit+=40;render();};
}
function renderPop(list,toks){
  const pop=$("#pop"), q=state.q.trim(), open=!!q&&state.popOpen;
  pop.hidden=!open; $("#q").setAttribute("aria-expanded",String(open));
  if(!open) return;
  state.list=list.slice(0,30);
  if(state.active>=state.list.length) state.active=Math.max(0,state.list.length-1);
  if(!list.length){
    pop.innerHTML=`<div class="empty"><span>No model matches “${esc(q)}”.</span><button type="button" class="add" data-typed>Add “${esc(q)}” as typed</button></div>`;
    return;
  }
  pop.innerHTML=state.list.map((d,i)=>{
    const p=state.picked.find(x=>x.id===d.id);
    return `<div class="opt${i===state.active?" act":""}" role="option" id="opt${i}" aria-selected="${i===state.active}" data-i="${i}">
      <div style="min-width:0"><div class="code">${hl(d.m,toks)}</div><div class="meta"><span class="tag">${d.b}</span><span>${esc(d.c)}</span>${d.d?`<span>· ${hl(d.d,toks)}</span>`:""}</div></div>
      <span class="side">${p?"In list ×"+p.qty:""}${i===state.active?`<span class="k">↵</span>`:""}</span></div>`;
  }).join("")+`<div class="pop-foot"><span>${list.length>30?`Top 30 of ${list.length}, keep typing`:`${list.length} match${list.length===1?"":"es"}`}</span><span class="keys">↑ ↓ move · Enter add · Esc close</span></div>`;
  const a=$("#opt"+state.active); if(a) a.scrollIntoView({block:"nearest"});
  $("#q").setAttribute("aria-activedescendant","opt"+state.active);
}
function pickFromPop(i){
  const d=state.list&&state.list[i]; if(!d) return;
  addItem(d); toast("Added "+d.m+". Type the next model.");
  $("#q").value=""; state.q=""; state.active=0; render(); $("#q").focus();
}
$("#pop").addEventListener("mousedown",e=>e.preventDefault()); // keep focus in the search box
$("#pop").addEventListener("click",e=>{
  if(e.target.closest("[data-typed]")){ const q=state.q.trim(); addItem({b:"",c:"Not in list",m:q,d:"Typed by customer",id:"t"+Date.now()}); $("#q").value=""; state.q=""; render(); $("#q").focus(); return; }
  const o=e.target.closest(".opt"); if(o) pickFromPop(+o.dataset.i);
});
$("#pop").addEventListener("mousemove",e=>{ const o=e.target.closest(".opt"); if(o&&+o.dataset.i!==state.active){ state.active=+o.dataset.i; document.querySelectorAll("#pop .opt").forEach((x,j)=>{x.classList.toggle("act",j===state.active);x.setAttribute("aria-selected",String(j===state.active));}); } });
$("#results").addEventListener("click",e=>{
  const b=e.target.closest("button.add[data-id]"); if(!b) return;
  const d=DATA[+b.dataset.id]; addItem(d);
});
function addItem(d){
  const p=state.picked.find(x=>x.id===d.id);
  if(p) p.qty++; else state.picked.push({id:d.id,b:d.b,c:d.c,m:d.m,d:d.d,qty:1});
  $("#pickMsg").textContent=""; renderPicked(); render(); update();
}
function renderPicked(){
  const box=$("#picked");
  $("#pickedTitle").textContent = state.picked.length?`Your list · ${state.picked.length} model${state.picked.length>1?"s":""}`:"Your list";
  if(!state.picked.length){ box.innerHTML='<div class="none">No models added (optional).</div>'; return; }
  box.innerHTML='<div style="display:grid;gap:8px">'+state.picked.map((p,i)=>`<div class="pick">
    <div style="min-width:0"><div class="code">${esc(p.m)}</div><div class="meta">${p.b?esc(p.b)+" · ":""}${esc(p.c)}${p.d?" · "+esc(p.d):""}</div></div>
    <div class="qty"><button type="button" data-q="-1" data-i="${i}" aria-label="Fewer">−</button><input id="qty${i}" data-i="${i}" inputmode="numeric" value="${p.qty}" aria-label="Quantity of ${esc(p.m)}"><button type="button" data-q="1" data-i="${i}" aria-label="More">+</button></div>
    <button type="button" class="x" data-rm="${i}" aria-label="Remove ${esc(p.m)}">×</button></div>`).join("")+'</div>';
}
$("#picked").addEventListener("click",e=>{
  const q=e.target.closest("[data-q]"), rm=e.target.closest("[data-rm]");
  if(q){ const p=state.picked[+q.dataset.i]; p.qty=Math.max(1,p.qty+ +q.dataset.q); }
  else if(rm){ state.picked.splice(+rm.dataset.rm,1); }
  else return;
  renderPicked(); render(); update();
});
$("#picked").addEventListener("change",e=>{
  if(!e.target.matches("input[data-i]")) return;
  const p=state.picked[+e.target.dataset.i]; p.qty=Math.max(1,parseInt(e.target.value,10)||1);
  renderPicked(); render(); update();
});

/* filters */
document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{
  state.brand=b.dataset.brand; state.limit=40;
  document.querySelectorAll(".seg button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  fillCats(); render();
});
$("#cat").onchange=e=>{state.cat=e.target.value;state.limit=40;render();};
$("#q").addEventListener("input",e=>{state.q=e.target.value;state.limit=40;state.active=0;state.popOpen=true;render();});
$("#q").addEventListener("focus",()=>{ if(state.q.trim()){ state.popOpen=true; render(); } });
$("#q").addEventListener("blur",()=>{ setTimeout(()=>{ if(document.activeElement!==$("#q")){ state.popOpen=false; renderPop([], []); } },120); });
$("#q").addEventListener("keydown",e=>{
  const n=(state.list||[]).length;
  if(e.key==="ArrowDown"&&state.q.trim()){ e.preventDefault(); state.popOpen=true; state.active=n?(state.active+1)%n:0; render(); }
  else if(e.key==="ArrowUp"&&state.q.trim()){ e.preventDefault(); state.active=n?(state.active-1+n)%n:0; render(); }
  else if(e.key==="Enter"){ e.preventDefault(); if(!state.q.trim()) return;
    if(n) pickFromPop(state.active); else { const t=$("#pop [data-typed]"); if(t) t.click(); } }
  else if(e.key==="Escape"){ if(state.popOpen&&state.q.trim()){ state.popOpen=false; renderPop([],[]); } else { e.target.value=""; state.q=""; render(); } }
});
document.addEventListener("keydown",e=>{
  if(e.key==="/"&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){ e.preventDefault(); $("#q").focus(); }
});

/* message */
function phoneDigits(){ return $("#phone").value.replace(/\D/g,""); }
function buildMessage(){
  const name=$("#name").value.trim(), phone=$("#phone").value.trim(), com=$("#comment").value.trim();
  const lines=[`*${CONFIG.title}*`,"",`*Name:* ${name||"—"}`,`*Phone:* ${phone||"—"}`,""];
  lines.push(`*Products (${state.picked.length}):*`);
  if(state.picked.length) state.picked.forEach((p,i)=>lines.push(`${i+1}. ${p.b?p.b+" ":""}${p.m}${p.d?" – "+p.d:""} (${p.c}) × ${p.qty}`));
  else lines.push("—");
  lines.push("",`*Comments:* ${com||"—"}`);
  const dt=new Date().toLocaleString("en-IN",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"});
  lines.push("",`_Sent from the enquiry form · ${dt}${state.sent&&state.sent.num?" · Ref E-"+state.sent.num:""}_`);
  return lines.join("\n");
}
function validate(show){
  const name=$("#name").value.trim(), d=phoneDigits();
  const errs={};
  if(!name) errs.name="Enter your name.";
  if(!d) errs.phone="Enter your phone number.";
  else if(d.length<10||d.length>15) errs.phone="Phone number should be 10 to 15 digits.";
  if(show){
    $("#nameMsg").textContent=errs.name||""; $("#nameWrap").classList.toggle("bad",!!errs.name);
    $("#phoneMsg").textContent=errs.phone||""; $("#phoneWrap").classList.toggle("bad",!!errs.phone);
    $("#pickMsg").textContent=errs.pick||"";
    const first=errs.name?"#name":errs.phone?"#phone":errs.pick?"#q":null;
    if(first){ $(first).focus(); $(first).scrollIntoView({block:"center",behavior:"smooth"}); }
  }
  return !Object.keys(errs).length;
}
function update(){
  const msg=buildMessage(), enc=encodeURIComponent(msg);
  $("#preview").textContent=msg;
  if(CONFIG.groupLink){
    $("#waGroup").href=CONFIG.groupLink;
    $("#waGroupSub").textContent="Copies your details, then opens the group";
    $("#sendNote").textContent="Group: your details are copied when you tap it. In the group, press and hold the message box, paste, and send.";
  } else {
    $("#waGroup").href=`https://wa.me/?text=${enc}`;
    $("#waGroupSub").textContent="Pick the group, then tap send";
    $("#sendNote").textContent="";
  }
  saveDraft();
}
async function copyText(t){
  try{ await navigator.clipboard.writeText(t); return true; }
  catch(_){ const ta=document.createElement("textarea"); ta.value=t; ta.setAttribute("readonly",""); ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select();
    let ok=false; try{ ok=document.execCommand("copy"); }catch(__){} ta.remove(); return ok; }
}
function toast(t){ const el=$("#toast"); el.textContent=t; clearTimeout(toast.t); toast.t=setTimeout(()=>el.textContent="",6000); }
/* save to the team's list */
function payload(channel){
  return { id:state.id, name:$("#name").value.trim(), phone:$("#phone").value.trim(), comment:$("#comment").value.trim(),
    items:state.picked.map(p=>({b:p.b,c:p.c,m:p.m,d:p.d,qty:p.qty})), channel, website:$("#website").value };
}
function showDone(num){
  state.sent={num:num||null,at:Date.now()}; saveDraft();
  const el=$("#done"); el.hidden=false;
  el.innerHTML=`<b>Enquiry received${num?` · Ref E-${num}`:""}</b><span>Saved to the team's enquiry list. If it isn't posted in the group yet, tap the button again, or start a new enquiry.</span>`;
}
function save(channel){
  // keepalive lets the request finish even while the page hands over to WhatsApp
  return fetch("/api/enquiries",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload(channel)),keepalive:true})
    .then(r=>r.json().then(j=>({ok:r.ok,j})))
    .then(({ok,j})=>{ if(ok) showDone(j.num); else toast(j.error||"Couldn't save the enquiry. Please try again."); return ok; })
    .catch(()=>{ toast("No connection: the enquiry wasn't saved here. Your WhatsApp message still reaches us."); return false; });
}
$("#waGroup").addEventListener("click",e=>{
  if(!validate(true)){ e.preventDefault(); return; }
  save("group");
  if(CONFIG.groupLink){ copyText(buildMessage()).then(ok=>toast(ok?"Details copied. Paste them in the group and send.":"Couldn't copy automatically. Use “Copy message” below, then paste in the group.")); }
  else toast("WhatsApp opened. Choose the group and tap send.");
});
$("#copyBtn").onclick=()=>copyText(buildMessage()).then(ok=>toast(ok?"Message copied.":"Couldn't copy. Open the preview and copy the text from there."));
let clearArmed=false;
$("#clearBtn").onclick=()=>{
  if(!clearArmed){ clearArmed=true; $("#clearBtn").textContent="Tap again to clear everything"; setTimeout(()=>{clearArmed=false;$("#clearBtn").textContent="Start a new enquiry";},4000); return; }
  clearArmed=false; $("#clearBtn").textContent="Start a new enquiry";
  ["#name","#phone","#comment","#q"].forEach(s=>$(s).value=""); state.picked=[]; state.q=""; state.id=newId(); state.sent=null; $("#done").hidden=true;
  ["#nameMsg","#phoneMsg","#pickMsg"].forEach(s=>$(s).textContent=""); $("#nameWrap").classList.remove("bad"); $("#phoneWrap").classList.remove("bad");
  renderPicked(); render(); update(); toast("Form cleared.");
};
["#name","#phone","#comment"].forEach(s=>$(s).addEventListener("input",()=>{
  if(s!=="#comment"){ const w=s==="#name"?"#nameWrap":"#phoneWrap"; $(w).classList.remove("bad"); $(s+"Msg").textContent=""; }
  update();
}));

/* every fresh page load starts with an empty form: nothing is kept in the browser */
function saveDraft(){}
try{ localStorage.removeItem("hw-enquiry-draft-v1"); }catch(_){}

fillCats(); renderPicked(); render(); update();
