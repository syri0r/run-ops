/*
 * Netrun UI (JS) — v1
 * -------------------------------------------------
 * Verdrahtet NetrunEngine + NetrunTree mit der Seite
 * - Baut bei Bedarf Minimal-UI in #app auf
 * - Bindet Toolbar (NET-Actions), Generator, Inspector
 * - Defensive DOM-Zugriffe: kein Crash, wenn Elemente fehlen
 * - Exportiert: window.initNetrunApp()
 */
(function(){
  'use strict';

  // ---- Shortcuts ----
  const $  = (s,root=document)=> root.querySelector(s);
  const $$ = (s,root=document)=> Array.from(root.querySelectorAll(s));
  function bind(el, ev, fn){ if(el) el.addEventListener(ev, fn); return el; }

  // ---- App State ----
  let E = null; // Engine API
  let T = null; // Tree API
  let S = null; // state

  // ---- UI Builders ----
  function ensureBaseUI(){
    // Wenn eine bestehende Struktur vorhanden ist (z. B. aus deiner großen HTML), nutzen wir die.
    const svg = $('#treeSvg');
    if(svg) return; // vorhandenes UI wird verwendet

    // Minimal-UI in #app einfügen, damit die Module sofort laufen
    const app = $('#app') || document.body;
    const html = `
      <div id="nr-wrap" style="display:grid;grid-template-rows:auto 1fr;min-height:80vh;gap:8px">
        <div id="actionBar" style="position:sticky;top:0;z-index:5;padding:8px;border-bottom:1px solid #333;background:#181c25">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button data-act="SCAN">Scan</button>
            <button data-act="BACKDOOR">Backdoor</button>
            <button data-act="CONTROL">Control</button>
            <button data-act="ZAP">Zap</button>
            <button data-act="SLIDE">Slide</button>
            <button data-act="JACKIN">Jack In/Out</button>
            <span style="margin-left:auto"></span>
            <label>Skill <input id="skillValue" type="number" value="7" style="width:60px"></label>
            <label>DV <input id="dvValue" type="number" value="12" style="width:60px"></label>
            <button id="rollBtn">Skill‑Wurf</button>
            <button id="d10Btn">d10</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <label>Diff
              <select id="genDifficulty">
                <option value="easy">Leicht</option>
                <option value="standard" selected>Standard</option>
                <option value="hard">Schwer</option>
                <option value="deadly">Tödlich</option>
              </select>
            </label>
            <label>Tiefe <input id="genDepth" type="number" value="6" min="3" max="12" style="width:60px"></label>
            <label><input id="genBranch" type="checkbox" checked> Abzweigungen</label>
            <label><input id="genGuarantees" type="checkbox" checked> Datei & Control</label>
            <button id="btnGenerate">Architektur erzeugen</button>
            <button id="btnRevealAll">Alles aufdecken</button>
            <span class="pill" id="profilePill">Profil: RAW</span>
            <span class="pill" id="roundPill">Runde <b id="roundNum">1</b> · Aktionen: <b id="actionsLeft">3</b></span>
          </div>
        </div>
        <div style="position:relative;border:1px solid #333;background:#0e1220">
          <div id="layerBadge" style="position:absolute;top:8px;left:8px;background:#0b1422;border:1px solid #23314e;color:#b6d6ff;padding:4px 8px;border-radius:999px;font-size:12px">Ebene: 1</div>
          <svg id="treeSvg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid meet" style="width:100%;min-height:70vh;display:block"></svg>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <h3>Aktueller Knoten</h3>
            <div id="currentNodeBox">–</div>
          </div>
          <div>
            <h3>Inspector</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <label>Name <input id="insName" type="text"></label>
              <label>Typ
                <select id="insType">
                  <option>Password</option>
                  <option>File</option>
                  <option>Control</option>
                  <option>Black ICE</option>
                  <option>Empty</option>
                </select>
              </label>
              <label>DV <input id="insDV" type="number" value="10"></label>
              <label>Ebene <input id="insDepth" type="number" value="1" min="1"></label>
              <label>ICE DMG <input id="insIceDmg" type="number" value="2"></label>
            </div>
            <label>Notizen <textarea id="insNotes" style="width:100%;min-height:70px"></textarea></label>
            <div style="display:flex;gap:8px;margin-top:6px">
              <button id="saveNode">Speichern</button>
              <button id="delNode">Löschen</button>
            </div>
          </div>
        </div>
      </div>`;
    app.insertAdjacentHTML('beforeend', html);
  }

  // ---- Header / Inspector ----
  function updateHeader(){
    const pill = $('#profilePill'); if(pill) pill.textContent = `Profil: ${S.profile}`;
    const rn = $('#roundNum'); if(rn) rn.textContent = S.round;
    const al = $('#actionsLeft'); if(al) al.textContent = S.actionsLeft;
    const active = E.getNode(S, S.activeNodeId);
    const badge = $('#layerBadge'); if(badge && active) badge.textContent = `Ebene: ${active.depth||1}`;
    const box = $('#currentNodeBox');
    if(box && active){ box.innerHTML = `<div class="pill">Aktiv: <b>${active.name}</b></div><div style="margin-top:6px">Typ: ${active.type} | DV ${active.dv} | Ebene ${active.depth}</div>`; }
  }

  function updateInspector(){
    const n = E.getNode(S, S.activeNodeId); if(!n) return;
    const id = (sel)=> $(sel);
    const set = (el,val)=>{ if(el) el.value = val; };
    set(id('#insName'),  n.name||'');
    set(id('#insType'),  n.type||'Empty');
    set(id('#insDV'),    n.dv||10);
    set(id('#insDepth'), n.depth||1);
    set(id('#insIceDmg'),n.iceDmg||2);
    const notes = id('#insNotes'); if(notes) notes.value = n.notes||'';
  }

  // ---- Actions ----
  function selectNode(id){
    const n = E.selectNode(S, id);
    if(!n) return;
    // Black ICE Reaktion nur logikseitig – UI kann später Log anzeigen
    T.draw(S); updateInspector(); updateHeader();
  }

  function wireToolbar(){
    $$('#actionBar [data-act]').forEach(btn=>{
      bind(btn, 'click', ()=>{
        const act = btn.getAttribute('data-act');
        const isScan = act==='SCAN';
        const spend = ()=> E.spendAction(S);
        switch(act){
          case 'SCAN':{
            if(!spend()) return; const depth = Number($('#scanDepth')?.value || 1) || 1; E.pathfinderReveal(S, S.activeNodeId, depth); break;
          }
          case 'BACKDOOR':{
            if(!spend()) return; /* DV-Check/Logik kann später ergänzt werden */ break;
          }
          case 'CONTROL':{
            if(!spend()) return; break;
          }
          case 'ZAP':{
            if(!spend()) return; break;
          }
          case 'SLIDE':{
            if(!spend()) return; break;
          }
          case 'JACKIN':{
            // Kein Action-Verbrauch, nur Markierung – je nach Hausregel anpassbar
            break;
          }
        }
        T.draw(S); updateHeader();
      });
    });

    bind($('#endTurnBtn'), 'click', ()=>{ E.endTurn(S); updateHeader(); });
    bind($('#rollBtn'), 'click', ()=>{
      const skill = Number($('#skillValue')?.value||0); const dv = Number($('#dvValue')?.value||0);
      const r = E.rollSkill(skill); const ok = dv>0 ? (r.total>=dv) : undefined;
      console.log(`Skill-Wurf ${skill}${dv?` vs DV ${dv}`:''} →`, r.total, r.rolls, ok===undefined?'' : ok?'ERFOLG':'FEHLSCHLAG');
    });
    bind($('#d10Btn'), 'click', ()=> console.log('d10 →', E.d10()));
  }

  // ---- Generator ----
  function wireGenerator(){
    bind($('#btnGenerate'), 'click', ()=>{
      const diff = $('#genDifficulty')?.value || 'standard';
      const depth = Number($('#genDepth')?.value||0) || undefined;
      const branching = !!$('#genBranch')?.checked;
      const guarantees = !!$('#genGuarantees')?.checked;
      E.generateArchitecture(S, { difficulty: diff, depth, branching, guarantees });
      T.draw(S); updateInspector(); updateHeader();
    });
    bind($('#btnRevealAll'), 'click', ()=>{ Object.values(S.nodes).forEach(n=> n.visible=true); T.draw(S); });
  }

  // ---- Inspector Save/Delete ----
  function wireInspector(){
    bind($('#saveNode'), 'click', ()=>{
      const n = E.getNode(S, S.activeNodeId); if(!n) return;
      const nameEl = $('#insName'), typeEl=$('#insType'), dvEl=$('#insDV'), dEl=$('#insDepth'), notesEl=$('#insNotes'), dmgEl=$('#insIceDmg');
      if(nameEl) n.name = nameEl.value.trim()||n.name;
      if(typeEl) n.type = typeEl.value;
      if(dvEl)   n.dv   = Number(dvEl.value)||n.dv;
      if(dEl)    n.depth= Math.max(1, Number(dEl.value)||n.depth||1);
      if(dmgEl)  n.iceDmg = Number(dmgEl.value)||2;
      if(notesEl) n.notes = notesEl.value;
      T.draw(S); updateHeader();
    });
    bind($('#delNode'), 'click', ()=>{
      const id=S.activeNodeId; if(id==='root') return alert('Root kann nicht gelöscht werden.');
      if(!confirm('Knoten wirklich löschen?')) return;
      // Edges entfernen
      S.edges = S.edges.filter(e=> e.from!==id && e.to!==id);
      Object.values(S.nodes).forEach(nn=> nn.edges = (nn.edges||[]).filter(cid=> cid!==id));
      delete S.nodes[id]; S.activeNodeId='root'; S.nodes.root.active=true;
      T.draw(S); updateInspector(); updateHeader();
    });
  }

  // ---- Tree Bindings ----
  function wireTree(){
    if(!window.NetrunTree){ console.warn('NetrunTree nicht gefunden'); return; }
    T = window.NetrunTree;
    T.init('#treeSvg');
    T.on('select', (id)=> selectNode(id));
  }

  // ---- Public init ----
  function initNetrunApp(){
    if(!window.NetrunEngine){ console.error('NetrunEngine nicht gefunden. Bitte engine.js vor ui.js laden.'); return; }
    E = window.NetrunEngine;
    ensureBaseUI();
    wireTree();
    S = E.createInitialState();
    E.resetActions(S);
    T.draw(S);
    updateHeader();
    updateInspector();
    wireToolbar();
    wireGenerator();
    wireInspector();
  }

  if(typeof window!=="undefined") window.initNetrunApp = initNetrunApp;
  else if(typeof globalThis!=="undefined") globalThis.initNetrunApp = initNetrunApp;
})();
