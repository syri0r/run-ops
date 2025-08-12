/*
 * Netrun UI (JS) — v2
 * -------------------------------------------------
 * Verdrahtet Engine + Tree mit DOM. Erstellt bei Bedarf UI-Teile nach,
 * ohne vorhandenes Markup zu überschreiben.
 * - Toolbar (NET-Actions), Generator, Programme, Inspector.
 * - Exportiert: window.initNetrunApp()
 */
(function(){
  'use strict';

  const $  = (s,root=document)=> root.querySelector(s);
  const $$ = (s,root=document)=> Array.from(root.querySelectorAll(s));
  function bind(el, ev, fn){ if(el) el.addEventListener(ev, fn); return el; }

  let E=null, T=null, S=null;

  // -------- UI scaffold (füllt fehlende Teile auf) --------
  function ensureBaseUI(){
    const app = $('#app') || document.body;

    // Toolbar nachrüsten, wenn nicht vorhanden
    if(!$('#actionBar')){
      app.insertAdjacentHTML('afterbegin', `
        <div id="actionBar" class="topbar" style="position:sticky;top:56px;z-index:5;padding:10px 12px;border-bottom:1px solid #1d2536;background:linear-gradient(180deg,#10182a,#0c1220)">
          <div class="toolbar" style="display:flex;gap:8px;flex-wrap:wrap">
            <button data-act="SCAN" class="btn-accent">Scan</button>
            <button data-act="BACKDOOR">Backdoor</button>
            <button data-act="CONTROL">Control</button>
            <button data-act="ZAP">Zap</button>
            <button data-act="SLIDE">Slide</button>
            <button data-act="JACKIN">Jack In/Out</button>
            <span style="margin-left:auto"></span>
            <label>Skill <input id="skillValue" type="number" value="7" style="width:64px"></label>
            <label>DV <input id="dvValue" type="number" value="12" style="width:64px"></label>
            <button id="rollBtn" class="btn-soft">Skill‑Wurf</button>
            <button id="d10Btn" class="btn-soft">d10</button>
          </div>
          <div class="toolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
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
            <button id="btnGenerate" class="btn-accent">Architektur erzeugen</button>
            <button id="btnRevealAll" class="btn-soft">Alles aufdecken</button>
            <span class="pill" id="profilePill">Profil: RAW</span>
            <span class="pill">Runde <b id="roundNum">1</b> · Aktionen: <b id="actionsLeft">3</b></span>
          </div>
          <div class="toolbar" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <label>Profil
              <select id="ruleProfile"><option value="RAW" selected>RAW</option><option value="HOUSE">Hausregeln</option></select>
            </label>
            <label>Aktionen/Runde <input id="actionsPerRound" type="number" value="3" min="1" max="6" style="width:64px"></label>
            <label>Scan‑Tiefe <input id="scanDepth" type="number" value="1" min="1" max="5" style="width:64px"></label>
            <label class="pill"><input type="checkbox" id="progSword"> Sword</label>
            <label class="pill"><input type="checkbox" id="progKiller"> Killer</label>
            <label class="pill"><input type="checkbox" id="progArmor"> Armor</label>
            <label class="pill"><input type="checkbox" id="progSpeedy"> Speedy</label>
          </div>
        </div>`);
    }

    // Tree + Inspector nachrüsten, wenn nicht vorhanden
    if(!$('#treeSvg')){
      app.insertAdjacentHTML('beforeend', `
        <section class="tree-wrap">
          <div class="badge" id="layerBadge">Ebene: 1</div>
          <svg id="treeSvg" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid meet"></svg>
        </section>
        <section class="inspector">
          <div class="col">
            <h3>Aktueller Knoten</h3>
            <div id="currentNodeBox">–</div>
          </div>
          <div class="col">
            <h3>Inspector</h3>
            <div class="grid2">
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
            <label>Notizen <textarea id="insNotes"></textarea></label>
            <div class="row">
              <button id="saveNode">Speichern</button>
              <button id="delNode">Löschen</button>
            </div>
          </div>
        </section>`);
    }
  }

  // -------- Header/Inspector Updates --------
  function updateHeader(){
    const pill=$('#profilePill'); if(pill) pill.textContent=`Profil: ${S.profile}`;
    const rn=$('#roundNum'); if(rn) rn.textContent=S.round;
    const al=$('#actionsLeft'); if(al) al.textContent=S.actionsLeft;
    const active=E.getNode(S,S.activeNodeId);
    const badge=$('#layerBadge'); if(badge && active) badge.textContent=`Ebene: ${active.depth||1}`;
    const box=$('#currentNodeBox'); if(box && active){ box.innerHTML=`<div class="pill">Aktiv: <b>${active.name}</b></div><div style="margin-top:6px">Typ: ${active.type} | DV ${active.dv} | Ebene ${active.depth}</div>`; }
  }
  function updateInspector(){
    const n=E.getNode(S,S.activeNodeId); if(!n) return;
    const set=(sel,val)=>{ const el=$(sel); if(el) el.value=val; };
    set('#insName',n.name||''); set('#insType',n.type||'Empty'); set('#insDV',n.dv||10); set('#insDepth',n.depth||1); set('#insIceDmg',n.iceDmg||2);
    const notes=$('#insNotes'); if(notes) notes.value=n.notes||'';
  }

  // -------- Actions --------
  function selectNode(id){ const n=E.selectNode(S,id); if(!n) return; T.draw(S); updateInspector(); updateHeader(); }

  function wireToolbar(){
    $$('#actionBar [data-act]').forEach(btn=>{
      bind(btn,'click',()=>{
        const act=btn.getAttribute('data-act');
        const spend=()=>E.spendAction(S);
        switch(act){
          case 'SCAN':{
            if(!spend()) return; const depth=Number($('#scanDepth')?.value||S.scanDepth||1)||1; E.pathfinderReveal(S,S.activeNodeId,depth); break;
          }
          case 'BACKDOOR':{
            if(!spend()) return; /* hier könnte DV/Skill-Wurf folgen */ break;
          }
          case 'CONTROL':{ if(!spend()) return; break; }
          case 'ZAP':{ if(!spend()) return; break; }
          case 'SLIDE':{ if(!spend()) return; break; }
          case 'JACKIN':{ /* Status markieren */ break; }
        }
        T.draw(S); updateHeader();
      });
    });

    bind($('#endTurnBtn'),'click',()=>{ E.endTurn(S); updateHeader(); });
    bind($('#rollBtn'),'click',()=>{ const skill=Number($('#skillValue')?.value||0); const dv=Number($('#dvValue')?.value||0); const r=E.rollSkill(skill); const ok=dv? r.total>=dv:undefined; console.log(`Skill ${skill}${dv?` vs DV ${dv}`:''} →`, r.total, r.rolls, ok===undefined?'' : ok?'ERFOLG':'FEHLSCHLAG'); });
    bind($('#d10Btn'),'click',()=> console.log('d10 →', E.d10()));
  }

  // -------- Generator --------
  function wireGenerator(){
    bind($('#btnGenerate'),'click',()=>{
      const diff=$('#genDifficulty')?.value||'standard';
      const depth=Number($('#genDepth')?.value||0)||undefined;
      const branching=!!$('#genBranch')?.checked;
      const guarantees=!!$('#genGuarantees')?.checked;
      E.generateArchitecture(S,{difficulty:diff, depth, branching, guarantees});
      T.draw(S); updateInspector(); updateHeader();
    });
    bind($('#btnRevealAll'),'click',()=>{ Object.values(S.nodes).forEach(n=> n.visible=true); T.draw(S); });
  }

  // -------- Programme & Profile --------
  function wireSetup(){
    const prof=$('#ruleProfile'); if(prof){ prof.value=S.profile; bind(prof,'change',e=>{ E.applyProfile(S,e.target.value); E.resetActions(S); updateHeader(); }); }
    const apr=$('#actionsPerRound'); if(apr){ apr.value=S.actionsPerRound; bind(apr,'input',e=>{ S.actionsPerRound=Number(e.target.value)||3; S._userTouchedAPR=true; E.resetActions(S); updateHeader(); }); }
    const sd=$('#scanDepth'); if(sd){ sd.value=S.scanDepth; bind(sd,'input',e=>{ S.scanDepth=Number(e.target.value)||1; S._userTouchedScan=true; }); }
    ['Sword','Killer','Armor','Speedy'].forEach(k=>{ const el=$('#prog'+k); if(el){ el.checked=!!S.programs[k]; bind(el,'change',()=>{ S.programs[k]=el.checked; E.resetActions(S); updateHeader(); }); }});
  }

  // -------- Inspector Save/Delete --------
  function wireInspector(){
    bind($('#saveNode'),'click',()=>{
      const n=E.getNode(S,S.activeNodeId); if(!n) return;
      const name=$('#insName'), type=$('#insType'), dv=$('#insDV'), d=$('#insDepth'), notes=$('#insNotes'), dmg=$('#insIceDmg');
      if(name) n.name=name.value.trim()||n.name; if(type) n.type=type.value; if(dv) n.dv=Number(dv.value)||n.dv; if(d) n.depth=Math.max(1,Number(d.value)||n.depth||1); if(dmg) n.iceDmg=Number(dmg.value)||2; if(notes) n.notes=notes.value;
      T.draw(S); updateHeader();
    });
    bind($('#delNode'),'click',()=>{
      const id=S.activeNodeId; if(id==='root'){ alert('Root kann nicht gelöscht werden.'); return; }
      if(!confirm('Knoten wirklich löschen?')) return;
      S.edges=S.edges.filter(e=> e.from!==id && e.to!==id); Object.values(S.nodes).forEach(nn=> nn.edges=(nn.edges||[]).filter(cid=>cid!==id)); delete S.nodes[id]; S.activeNodeId='root'; S.nodes.root.active=true; T.draw(S); updateInspector(); updateHeader();
    });
  }

  // -------- Tree Bindings --------
  function wireTree(){ if(!window.NetrunTree){ console.warn('NetrunTree nicht gefunden'); return; } T=window.NetrunTree; T.init('#treeSvg'); T.on('select', id=> selectNode(id)); }

  // -------- Public init --------
  function initNetrunApp(){
    if(!window.NetrunEngine){ console.error('NetrunEngine nicht gefunden. Bitte engine.js vor ui.js laden.'); return; }
    E=window.NetrunEngine; ensureBaseUI(); wireTree(); S=E.createInitialState(); E.resetActions(S); T.draw(S); updateHeader(); updateInspector(); wireToolbar(); wireGenerator(); wireSetup(); wireInspector();
  }

  if(typeof window!=="undefined") window.initNetrunApp=initNetrunApp; else if(typeof globalThis!=="undefined") globalThis.initNetrunApp=initNetrunApp;
})();
