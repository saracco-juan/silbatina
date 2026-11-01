(function(){
  const TAGS = ["AFA","Arbitraje","Torneo y calendario","Televisación","Clubes","Seguridad","Selección","Otro"];
  const MAX_LEN = 280;
  const $ = id => document.getElementById(id);
  const state = {posts:[], myPost:null, myVotes:[], maxVotes:5, filter:"Todos", sort:"top", loaded:false, adminKey:""};
  try{ state.adminKey = sessionStorage.getItem("silbatina-admin")||""; }catch(e){}
  if(location.hash==="#moderar"){ $("adminBox").hidden=false; }

  async function api(method, url, body, extra){
    const r = await fetch(url,{method, headers:Object.assign({"Content-Type":"application/json"},extra||{}), body: body?JSON.stringify(body):undefined, credentials:"same-origin"});
    let data={}; try{ data=await r.json(); }catch(e){}
    if(!r.ok) throw new Error(data.error||"Algo falló. Probá de nuevo.");
    return data;
  }

  $("tag").innerHTML = TAGS.map(t=>`<option>${t}</option>`).join("");
  const chips=$("chips");
  ["Todos",...TAGS].forEach(t=>{
    const b=document.createElement("button"); b.type="button"; b.className="chip"; b.textContent=t;
    b.setAttribute("aria-pressed",t==="Todos"?"true":"false");
    b.onclick=()=>{state.filter=t; chips.querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-pressed",c===b?"true":"false")); render();};
    chips.appendChild(b);
  });
  $("sortTop").onclick=()=>setSort("top"); $("sortNew").onclick=()=>setSort("new");
  function setSort(s){state.sort=s;$("sortTop").setAttribute("aria-pressed",s==="top");$("sortNew").setAttribute("aria-pressed",s==="new");render();}
  $("text").addEventListener("input",updCount);
  function updCount(){const n=$("text").value.trim().length;$("count").textContent=n+" / "+MAX_LEN;$("count").classList.toggle("over",n>MAX_LEN);}
  function host(h){try{return new URL(h).hostname.replace(/^www\./,"");}catch(e){return "";}}
  function ago(ts){ if(!ts) return ""; const s=Math.max(0,(Date.now()-ts)/1000);
    if(s<60) return "recién"; if(s<3600) return "hace "+Math.floor(s/60)+" min";
    if(s<86400) return "hace "+Math.floor(s/3600)+" h"; return "hace "+Math.floor(s/86400)+" d"; }
  function safeLink(a,href){ try{const u=new URL(href); if(u.protocol==="https:"||u.protocol==="http:"){a.href=u.href; return true;}}catch(e){} return false; }

  function render(){
    const posts=state.posts;
    const total=posts.reduce((a,p)=>a+p.votes,0);
    $("tPosts").textContent=posts.length; $("tVotes").textContent=total;
    const ranked=[...posts].sort((a,b)=>b.votes-a.votes||b.createdAt-a.createdAt);
    const top=ranked[0], bm=$("boardMsg"), bf=$("boardFoot"); bf.textContent="";
    if(top&&top.votes>0){
      bm.textContent="“"+top.text+"”"; bm.classList.remove("empty");
      const s1=document.createElement("span"); const bb=document.createElement("b"); bb.textContent=top.votes; s1.append(bb," silbidos");
      const s2=document.createElement("span"); s2.textContent=(top.alias||"Hincha anónimo")+" · "+top.tag;
      bf.append(s1,s2);
      if(ranked[1]){const s3=document.createElement("span"); s3.textContent="Al segundo le faltan "+Math.max(1,top.votes-ranked[1].votes+1)+" para sacarlo"; bf.append(s3);}
      if(top.link){const a=document.createElement("a"); if(safeLink(a,top.link)){a.target="_blank"; a.rel="noopener noreferrer nofollow"; a.textContent="Fuente: "+host(top.link); bf.append(a);}}
    } else {
      bm.classList.add("empty");
      bm.textContent=posts.length?"Nadie silbó todavía. El primero que lo haga pone su mensaje acá.":"El tablero está libre. Escribí el primer mensaje.";
      const s=document.createElement("span"); s.textContent="Esperando silbidos"; bf.append(s);
    }
    const ids=new Set(posts.map(p=>p.id));
    const used=state.myVotes.filter(id=>ids.has(id)).length;
    const w=$("whistles"); w.innerHTML="";
    for(let i=0;i<state.maxVotes;i++){const s=document.createElement("span"); if(i<used) s.className="used"; w.appendChild(s);}
    w.setAttribute("aria-label",(state.maxVotes-used)+" de "+state.maxVotes+" silbidos disponibles");

    let view=posts.filter(p=>state.filter==="Todos"||p.tag===state.filter);
    view.sort(state.sort==="top"?(a,b)=>b.votes-a.votes||b.createdAt-a.createdAt:(a,b)=>b.createdAt-a.createdAt);
    const list=$("list"); list.innerHTML="";
    if(state.loaded&&!view.length){
      const e=document.createElement("div"); e.className="empty-state";
      e.innerHTML=posts.length?"<strong>No hay mensajes sobre este tema.</strong><span>Probá con otro filtro o sé el primero en escribir.</span>"
        :"<strong>La tribuna está vacía.</strong><span>Acá van a aparecer los mensajes de los hinchas, ordenados por silbidos. Escribí el tuyo en el formulario.</span>";
      list.appendChild(e);
    }
    const rankOf={}; ranked.forEach((p,i)=>rankOf[p.id]=i+1);
    view.forEach(p=>{
      const row=document.createElement("article"); row.className="post"+(rankOf[p.id]===1&&p.votes>0?" top":"");
      const r=document.createElement("div"); r.className="rank"; r.textContent=String(rankOf[p.id]).padStart(2,"0");
      const body=document.createElement("div"); body.style.minWidth="0";
      const t=document.createElement("p"); t.textContent=p.text;
      const m=document.createElement("div"); m.className="meta";
      const tg=document.createElement("span"); tg.className="tag"; tg.textContent=p.tag;
      const al=document.createElement("span"); al.textContent=p.alias||"Hincha anónimo";
      if(state.myPost&&state.myPost.id===p.id){al.className="mine"; al.textContent+=" (vos)";}
      const tm=document.createElement("span"); tm.textContent=ago(p.createdAt);
      m.append(tg,al,tm);
      if(p.link){const a=document.createElement("a"); if(safeLink(a,p.link)){a.target="_blank"; a.rel="noopener noreferrer nofollow"; a.textContent=host(p.link); m.append(a);}}
      if(state.adminKey){const d=document.createElement("button"); d.className="mod"; d.type="button"; d.textContent="Quitar"; d.onclick=()=>moderate(p.id,d); m.append(d);}
      body.append(t,m);
      const v=document.createElement("button"); v.type="button"; v.className="vote";
      const on=state.myVotes.includes(p.id);
      v.setAttribute("aria-pressed",on?"true":"false");
      const vb=document.createElement("b"); vb.textContent=p.votes; const vs=document.createElement("small"); vs.textContent=on?"silbaste":"silbar"; v.append(vb,vs);
      v.setAttribute("aria-label",(on?"Quitar tu silbido":"Silbar este mensaje")+", "+p.votes+" silbidos");
      v.disabled=!on&&used>=state.maxVotes;
      if(v.disabled) v.title="Ya usaste tus silbidos. Sacá uno para silbar este.";
      v.onclick=()=>toggleVote(p.id);
      row.append(r,body,v); list.appendChild(row);
    });
  }

  function flash(t,err){const m=$("formMsg"); m.textContent=t; m.classList.toggle("err",!!err);}
  function fillForm(force){
    const mine=state.myPost;
    $("remove").hidden=!mine; $("save").textContent=mine?"Actualizar":"Publicar";
    $("formTitle").textContent=mine?"Tu silbido está en la tribuna":"Tu silbido";
    if(mine&&(force||!fillForm.done)){ $("text").value=mine.text; $("tag").value=mine.tag; $("alias").value=mine.alias||""; $("link").value=mine.link||""; updCount(); fillForm.done=true; }
  }

  async function loadState(){
    try{ const d=await api("GET","/api/state"); state.posts=d.posts; state.loaded=true; $("status").textContent=""; render(); }
    catch(e){ if(!state.loaded) $("status").textContent="No se pudo cargar la tribuna. Recargá en un rato."; }
  }
  async function loadMe(){
    try{ const d=await api("GET","/api/me"); state.myPost=d.post; state.myVotes=d.votes; state.maxVotes=d.maxVotes||5; fillForm(); render(); }catch(e){}
  }

  let voting=false;
  async function toggleVote(id){
    if(voting) return; voting=true;
    const before={votes:state.myVotes.slice(), posts:state.posts.map(p=>({...p}))};
    const on=state.myVotes.includes(id);
    state.myVotes=on?state.myVotes.filter(x=>x!==id):[...state.myVotes,id];
    state.posts.forEach(p=>{ if(p.id===id) p.votes+=on?-1:1; }); render();
    try{ await api("POST","/api/vote",{postId:id}); loadState(); }
    catch(e){ state.myVotes=before.votes; state.posts=before.posts; render(); flash(e.message,true); }
    voting=false;
  }

  async function moderate(id,btn){
    if(btn.dataset.confirm!=="1"){btn.dataset.confirm="1"; btn.textContent="¿Seguro? Tocá de nuevo"; return;}
    try{ await api("DELETE","/api/admin/post/"+id,null,{"X-Admin-Key":state.adminKey}); loadState(); }
    catch(e){ btn.textContent=e.message; }
  }

  $("adminForm").addEventListener("submit",e=>{
    e.preventDefault(); state.adminKey=$("adminKey").value.trim();
    try{ sessionStorage.setItem("silbatina-admin",state.adminKey); }catch(err){}
    $("adminMsg").textContent=state.adminKey?"Modo moderación activo en esta pestaña.":"Modo moderación desactivado."; render();
  });

  $("form").addEventListener("submit",async e=>{
    e.preventDefault();
    const text=$("text").value.trim().replace(/\s+/g," ");
    if(text.length<8){flash("Escribí al menos una frase corta.",true);return;}
    if(text.length>MAX_LEN){flash("Te pasaste de "+MAX_LEN+" caracteres. Acortalo un poco.",true);return;}
    $("save").disabled=true;
    try{
      const had=!!state.myPost;
      await api("PUT","/api/post",{text,tag:$("tag").value,alias:$("alias").value,link:$("link").value});
      flash(had?"Mensaje actualizado.":"Publicado. Ahora compartilo para que lo silben.");
      await Promise.all([loadState(),loadMe()]); fillForm(true);
    }catch(err){ flash(err.message,true); }
    $("save").disabled=false;
  });

  $("remove").addEventListener("click",async()=>{
    const b=$("remove");
    if(b.dataset.confirm!=="1"){b.dataset.confirm="1"; b.textContent="Tocá de nuevo para borrar"; return;}
    b.dataset.confirm=""; b.textContent="Borrar mi mensaje";
    try{ await api("DELETE","/api/post"); $("form").reset(); updCount(); fillForm.done=false; flash("Borraste tu mensaje."); await Promise.all([loadState(),loadMe()]); }
    catch(e){ flash(e.message,true); }
  });

  $("share").addEventListener("click",async()=>{
    const url=location.origin; const btn=$("share");
    try{
      if(navigator.share){ await navigator.share({title:"La Silbatina",text:"Silbá al fútbol argentino. El mensaje más silbado se queda con el tablero.",url}); return; }
      await navigator.clipboard.writeText(url); btn.textContent="Link copiado";
    }catch(e){ btn.textContent=url; }
    setTimeout(()=>btn.textContent="Compartir",2500);
  });

  render(); updCount();
  loadState(); loadMe();
  setInterval(()=>{ if(!document.hidden) loadState(); },10000);
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) loadState(); });
})();
