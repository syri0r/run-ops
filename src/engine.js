/*
 * Netrun Engine (JS) — v1
 * ---------------------------------------------
 * Zweck: Reine Logik/State für die Netrun-Webapp
 * - Keine DOM- oder SVG-Zugriffe
 * - Export über window.NetrunEngine
 * - Enthält: State, Regeln, Würfel, Generator (ohne "Empty"-Knoten),
 *            Branching-Plan, Pathfinder, Aktionen, (De-)Serialisierung
 *
 * Änderungen aus letzter Runde:
 * - Generator erzeugt keine "Empty"-Nodes (außer via addChild()-Editor-Fall)
 * - Abzweigungen garantiert, wenn aktiviert (mind. 1, Tiefe 2..max-1)
 * - Garantien: min. 1 File & 1 Control
 * - Orthogonale Kanten werden im Renderer umgesetzt (nicht hier)
 */

(function(){
  'use strict';

  // --- Utilities ---
  const rint = (a,b)=> a + Math.floor(Math.random()*(b-a+1));
  function pickWeighted(table){
    const sum = table.reduce((s,[_v,w])=>s+w,0);
    let t = Math.random()*sum;
    for(const [v,w] of table){ if((t-=w)<=0) return v; }
    return table[table.length-1][0];
  }

  // --- Difficulty Config ---
  const GEN = {
    easy:     { depth:[4,6],  baseDV:9,  dvPerDepth:1, blackIceProb:0.15, iceDmg:2, branchProb:0.18 },
    standard: { depth:[6,8],  baseDV:11, dvPerDepth:1, blackIceProb:0.25, iceDmg:2, branchProb:0.25 },
    hard:     { depth:[8,10], baseDV:12, dvPerDepth:2, blackIceProb:0.35, iceDmg:3, branchProb:0.33 },
    deadly:   { depth:[10,12],baseDV:13, dvPerDepth:2, blackIceProb:0.45, iceDmg:4, branchProb:0.42 }
  };

  // --- Defaults / Factory ---
  function makeDefaultRoot(){
    return { id:'root', name:'Entry Point', type:'Password', dv:11, depth:1,
             notes:'Startknoten.', visible:true, active:true, iceDmg:2, edges:[] };
  }

  function createInitialState(){
    return {
      profile: 'RAW',
      round: 1,
      actionsPerRound: 3,
      actionsLeft: 3,
      scanDepth: 1,
      programs: { Sword:false, Killer:false, Armor:false, Speedy:false },
      nodes: { 'root': makeDefaultRoot() },
      edges: [],
      activeNodeId: 'root',
      _lastDiff: 'standard',
      _branchPlan: null
    };
  }

  // --- Rules & Programs ---
  function applyProfile(state, profile){
    state.profile = profile;
    if(profile==='RAW'){
      if(!state._userTouchedAPR) state.actionsPerRound=3;
      if(!state._userTouchedScan) state.scanDepth=1;
    }else{
      if(!state._userTouchedAPR) state.actionsPerRound=4;
      if(!state._userTouchedScan) state.scanDepth=2;
    }
  }
  function programMods(state){
    const p=state.programs||{};
    return {
      extraAction: p.Speedy?1:0,
      vsBlackIceBonus: p.Killer?2:0,
      dmgMelee: p.Sword?2:0,
      iceDmgReduction: p.Armor?1:0
    };
  }

  // --- Dice ---
  function d10(){ return 1 + Math.floor(Math.random()*10); }
  function rollSkill(skillVal){
    let total = 0, detail = [];
    let r = d10(); detail.push(r);
    if(r===10){
      total += 10;
      while(true){ const r2=d10(); detail.push(r2); total+=r2; if(r2!==10) break; }
    }else if(r===1){
      total -= 1;
      while(true){ const r2=d10(); detail.push(r2); total-=r2; if(r2!==1) break; }
    }else{ total += r; }
    return { total: total + (skillVal||0), rolls: detail };
  }

  // --- Nodes / Graph helpers ---
  function getNode(state,id){ return state.nodes[id]; }
  function clearArchitecture(state){ state.nodes={ root: makeDefaultRoot() }; state.edges=[]; state.activeNodeId='root'; }
  function createNode(state, type, depth, name){
    const id='n'+Math.random().toString(36).slice(2,8);
    const cfg=GEN[state._lastDiff||'standard'];
    const dv = cfg.baseDV + Math.max(0,depth-1)*cfg.dvPerDepth + rint(-1,1);
    const node = { id, name:name||type, type, dv, depth, notes:'', visible:false, active:false, iceDmg:cfg.iceDmg, edges:[] };
    state.nodes[id]=node; return node;
  }
  function linkNodes(state, fromId, toId){ state.edges.push({from:fromId,to:toId}); (state.nodes[fromId].edges||=[]).push(toId); }

  function addChild(state, parentId, type){
    const parent = getNode(state, parentId)||state.nodes.root;
    const nodeType = type||'Empty'; // Editor-Fall darf Empty sein
    const node = createNode(state, nodeType, (parent.depth||1)+1, nodeType==='Empty'?'Node':nodeType);
    linkNodes(state, parent.id||'root', node.id);
    // Sichtbarkeit/Active Handhabung lässt die UI übernehmen
    return node;
  }

  // --- Guarantees ---
  function ensureGuarantees(state, treeDepth){
    const hasFile = Object.values(state.nodes).some(n=>n.type==='File');
    const hasCtrl = Object.values(state.nodes).some(n=>n.type==='Control');
    const frontier = Object.values(state.nodes).filter(n=>n.depth===treeDepth);
    if(!hasFile && frontier.length){ const n=frontier[0]; n.type='File'; n.name = n.name==='Node'? 'Datenarchiv' : n.name; }
    if(!hasCtrl){ const c=Object.values(state.nodes).find(n=>n.type==='Password' || n.type==='File' || n.type==='Black ICE'); if(!c){ const e=Object.values(state.nodes).find(n=>true); if(e) e.type='Control'; } else { c.type='Control'; } }
  }

  // --- Pathfinder ---
  function pathfinderReveal(state, fromId, depth){
    const visited=new Set([fromId]); const q=[{id:fromId,d:0}];
    while(q.length){
      const {id,d}=q.shift(); const node=getNode(state,id);
      if(d>0) node.visible=true; if(d>=depth) continue;
      for(const cid of (node.edges||[])){
        if(!visited.has(cid)){
          visited.add(cid); getNode(state,cid).visible=true; q.push({id:cid,d:d+1});
        }
      }
    }
  }

  // --- Architecture Generator ---
  function generateArchitecture(state, opts={}){
    const diff=opts.difficulty||'standard'; const branching=!!opts.branching; const cfg=GEN[diff];
    const depth=Math.max(3, Math.min(12, opts.depth || rint(...cfg.depth)));
    state._lastDiff=diff; clearArchitecture(state);

    const root=state.nodes.root; root.visible=true; root.active=true; root.dv=cfg.baseDV; root.depth=1; root.name='Entry Point';

    // Branch plan (mind. 1 wenn enabled; Range nach Tiefe limitiert)
    const BR_LIMITS={ easy:[1,1], standard:[1,2], hard:[2,3], deadly:[2,4] };
    const [bMin0,bMax0]=BR_LIMITS[diff]||[1,2];
    const maxByDepth=Math.max(1, Math.floor((depth-1)/2));
    const bMin=Math.min(bMin0,maxByDepth); const bMax=Math.min(bMax0,maxByDepth);
    const planned = branching ? rint(bMin,bMax) : 0;
    const branchDepths=new Set();
    while(branching && branchDepths.size<planned){ branchDepths.add(rint(2, Math.max(2, depth-1))); }

    state._branchPlan={ total:planned, depths:Array.from(branchDepths).sort((a,b)=>a-b) };
    const forcedUsedAtDepth=new Set();

    // expand layers
    let frontier=[root.id];
    for(let d=2; d<=depth; d++){
      const next=[];
      for(let i=0;i<frontier.length;i++){
        const pid=frontier[i]; let childCount=1;
        if(branching && Math.random()<cfg.branchProb) childCount=2;
        if(branching && branchDepths.has(d) && !forcedUsedAtDepth.has(d) && i===0){ childCount=Math.max(childCount,2); forcedUsedAtDepth.add(d); }

        for(let c=0;c<childCount;c++){
          // Keine Empty-Knoten bei der Generierung
          const t = pickWeighted([
            ['Password', d===2? 2 : 0.2],
            ['File', 3],
            ['Control', 3],
            ['Black ICE', Math.max(1, Math.round(cfg.blackIceProb*10))]
          ]);
          const defaultName = t==='File'?'Datei': (t==='Control'?'Control': (t==='Password'?'Password':'Black ICE'));
          const node=createNode(state, t, d, defaultName);
          linkNodes(state, pid, node.id); next.push(node.id);
        }
      }
      frontier=next;
    }

    if(opts.guarantees) ensureGuarantees(state, depth);

    // Sichtbarkeit zurücksetzen (nur Root sichtbar/aktiv)
    Object.values(state.nodes).forEach(n=>{ if(n.id!=='root') n.visible=false; n.active=false; });
    state.nodes.root.visible=true; state.nodes.root.active=true; state.activeNodeId='root';

    // Runden-/Aktions-Reset
    state.round=1; resetActions(state);

    // Branch-Messung
    const parents=Object.values(state.nodes).reduce((m,n)=>{ m[n.id]=(n.edges?.length||0); return m; },{});
    const actualBranches=Object.values(parents).filter(c=>c>1).length;
    state._branchPlan.actual=actualBranches; state._branchPlan.usedDepths=Array.from(forcedUsedAtDepth).sort((a,b)=>a-b);

    return state;
  }

  // --- Turns ---
  function resetActions(state){ state.actionsLeft = (state.actionsPerRound||3) + (programMods(state).extraAction||0); }
  function spendAction(state){ if(state.actionsLeft<=0) return false; state.actionsLeft--; return true; }
  function endTurn(state){ state.round+=1; resetActions(state); }
  function selectNode(state,id){ Object.values(state.nodes).forEach(n=>n.active=false); const n=getNode(state,id); if(!n) return; n.active=true; state.activeNodeId=id; n.visible=true; return n; }

  // --- Persistence ---
  function toJSON(state){ return JSON.stringify(state); }
  function fromJSON(json){ const s=JSON.parse(json); return s; }

  // --- Public API ---
  const API = {
    version: '1.0.0',
    GEN,
    createInitialState,
    applyProfile,
    programMods,
    d10,
    rollSkill,
    getNode,
    addChild,
    generateArchitecture,
    pathfinderReveal,
    resetActions,
    spendAction,
    endTurn,
    selectNode,
    toJSON,
    fromJSON
  };

  if(typeof window!=="undefined"){
    window.NetrunEngine = API;
  } else if (typeof globalThis!=="undefined"){
    globalThis.NetrunEngine = API;
  }
})();
