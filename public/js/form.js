// Customer enquiry form. Saves to /api/enquiries when a WhatsApp button (or Send enquiry) is tapped.
const CONFIG = window.ENQUIRY_CONFIG;
const DATA = window.HW_PRODUCTS;
const $ = s => document.querySelector(s);
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36)+Math.random().toString(36).slice(2))).replace(/-/g,"");
const state = { brand:"", cat:"", q:"", limit:40, picked:[], id:newId(), sent:null };
DATA.forEach((d,i)=>{ d.id=i; d.h=(d.m+" "+d.m.replace(/[\s\-\/]/g,"")+" "+d.d+" "+d.c+" "+d.b).toLowerCase(); });
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
    const q0=toks[0], qc=state.q.toLowerCase().replace(/[\s\-\/]/g,"");
    const score=d=>{const m=d.m.toLowerCase(), mc=m.replace(/[\s\-\/]/g,""); return (mc===qc?0:mc.startsWith(qc)?1:m.includes(q0)?2:3)};
    list=list.map(d=>[score(d),d]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
  }
  return {list,toks};
}
function render(){
  const {list,toks}=search();
  const box=$("#results");
  const shown=list.slice(0,state.limit);
  $("#count").textContent = list.length===DATA.length ? `${DATA.length} models · search or filter to narrow down` : `${list.length} of ${DATA.length} models`;
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
  if(!state.picked.length){ box.innerHTML='<div class="none">Nothing added yet. Search above and tap <b>+ Add</b> on each model you want.</div>'; return; }
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
$("#q").addEventListener("input",e=>{state.q=e.target.value;state.limit=40;render();});
$("#q").addEventListener("keydown",e=>{
  if(e.key==="Enter"){ e.preventDefault(); const b=$("#results button.add[data-id]"); if(b&&state.q.trim()) b.click(); }
  if(e.key==="Escape"){ e.target.value=""; state.q=""; render(); }
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
  if(!state.picked.length&&!$("#comment").value.trim()) errs.pick="Add at least one product, or write what you need in Comments.";
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
  $("#waDirect").href=`https://wa.me/${CONFIG.phone}?text=${enc}`;
  if(CONFIG.groupLink){
    $("#waGroup").href=CONFIG.groupLink;
    $("#waGroupSub").textContent="Copies your details, then opens the group";
    $("#sendNote").textContent="Group: your details are copied when you tap it. In the group, press and hold the message box, paste, and send.";
  } else {
    $("#waGroup").href=`https://wa.me/?text=${enc}`;
    $("#waGroupSub").textContent="Pick the group, then tap send";
    $("#sendNote").textContent="";
  }
  $("#waDirectSub").textContent="To +"+CONFIG.phone.replace(/^91(\d{5})(\d{5})$/,"91 $1 $2")+" · just tap send";
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
  el.innerHTML=`<b>Enquiry received${num?` · Ref E-${num}`:""}</b><span>Our team has your details and will call you back. You can still send it on WhatsApp, or start a new enquiry.</span>`;
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
$("#waDirect").addEventListener("click",e=>{
  if(!validate(true)){ e.preventDefault(); return; }
  save("direct");
  toast("WhatsApp opened with your message. Tap send to finish.");
});
$("#saveOnly").onclick=()=>{
  if(!validate(true)) return;
  const b=$("#saveOnly"); b.disabled=true; b.textContent="Sending…";
  save("form").finally(()=>{ b.disabled=false; b.textContent="Send enquiry without WhatsApp"; });
};
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

/* draft (this browser only) */
const KEY="hw-enquiry-draft-v1";
function saveDraft(){ try{ localStorage.setItem(KEY,JSON.stringify({n:$("#name").value,p:$("#phone").value,c:$("#comment").value,k:state.picked,id:state.id,s:state.sent})); }catch(_){} }
function loadDraft(){ try{ const s=JSON.parse(localStorage.getItem(KEY)||"null"); if(!s) return;
  $("#name").value=s.n||""; $("#phone").value=s.p||""; $("#comment").value=s.c||"";
  state.picked=(s.k||[]).filter(p=>p&&p.m);
  if(s.id) state.id=s.id;
  if(s.s && Date.now()-s.s.at<864e5) showDone(s.s.num); }catch(_){} }

loadDraft(); fillCats(); renderPicked(); render(); update();
