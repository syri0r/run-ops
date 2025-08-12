/*
 * Netrun Tree (JS) — v1
 * ---------------------------------------------
 * Zweck: Reines SVG-Rendering der Architektur (eckige Kanten)
 * - Erwartet State aus NetrunEngine (window.NetrunEngine)
 * - Keine Spielregeln / kein Generator hier
 * - Exportiert window.NetrunTree mit:
 *   - init(svgSelector [,options])
 *   - draw(state)
 *   - on(event, handler)  // events: "select"
 *   - getLayout()
 *
 * Notes
 * - Orthogonale Verbindungen via <polyline> (keine Bezier)
 * - Defensive DOM-Zugriffe (SVG darf fehlen → kein Crash)
 */
(function(){
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  const DEFAULTS = {
    node: { w:160, h:50, rx:10 },
    gap:  { x:220, y:160, padTop:40 },
    view: { w:1200, h:900 },
    classes: { link:'link', linkVisible:'link visible', node:'node', nodeActive:'node active', nodeHidden:'node hidden' }
  };

  let svgEl = null;
  let options = JSON.parse(JSON.stringify(DEFAULTS));
  let handlers = { select: [] };
  let lastLayout = { posById:{}, depths:[], size:{w:DEFAULTS.view.w,h:DEFAULTS.view.h} };

  function $(sel){ return document.querySelector(sel); }
  function create(tag){ return document.createElementNS(NS, tag); }
  function on(evt, fn){ if(!handlers[evt]) handlers[evt]=[]; handlers[evt].push(fn); }
  function emit(evt, payload){ (handlers[evt]||[]).forEach(fn=>{ try{ fn(payload); }catch(e){ console.error(e); } }); }

  function init(svgSelector, opts={}){
    svgEl = typeof svgSelector==='string' ? $(svgSelector) : svgSelector;
    options = Object.assign({}, DEFAULTS, opts||{});
    if(!svgEl){ console.warn('[NetrunTree] SVG not found for selector', svgSelector); return; }
    // ensure viewBox
    svgEl.setAttribute('viewBox', `0 0 ${options.view.w} ${options.view.h}`);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  function groupByDepth(state){
    const byDepth={};
    Object.values(state.nodes||{}).forEach(n=>{ const d=n.depth||1; (byDepth[d]||(byDepth[d]=[])).push(n); });
    Object.values(byDepth).forEach(arr=> arr.sort((a,b)=> (a.name||'').localeCompare(b.name||'')));
    return byDepth;
  }

  function computeLayout(state){
    const byDepth = groupByDepth(state);
    const depths = Object.keys(byDepth).map(n=>+n).sort((a,b)=>a-b);
    const W = options.view.w; const H = Math.max(options.view.h, options.gap.padTop + (depths.length)*options.gap.y + 100);
    const posById = {};
    depths.forEach((dep, idx)=>{
      const arr = byDepth[dep];
      const y = options.gap.padTop + idx*options.gap.y;
      const totalW = (arr.length-1)*options.gap.x;
      const startX = (W/2) - totalW/2;
      arr.forEach((n,i)=>{ posById[n.id] = { x:startX+i*options.gap.x, y }; });
    });
    lastLayout = { posById, depths, size:{w:W,h:H} };
    return lastLayout;
  }

  function draw(state){
    if(!svgEl) return;
    const { node, classes } = options;
    const layout = computeLayout(state);
    // Resize viewBox height if needed
    svgEl.setAttribute('viewBox', `0 0 ${layout.size.w} ${layout.size.h}`);

    // wipe
    while(svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    // Links (orthogonal via polyline)
    for(const e of (state.edges||[])){
      const a = layout.posById[e.from];
      const b = layout.posById[e.to];
      if(!a || !b) continue;
      const fromNode = state.nodes[e.from];
      const toNode   = state.nodes[e.to];
      const visible  = (fromNode?.visible && toNode?.visible);
      const sx = a.x + node.w/2, sy = a.y + node.h;
      const ex = b.x + node.w/2, ey = b.y;
      const midY = (sy + ey) / 2;
      const poly = create('polyline');
      poly.setAttribute('points', `${sx},${sy} ${sx},${midY} ${ex},${midY} ${ex},${ey}`);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('class', visible ? classes.linkVisible : classes.link);
      svgEl.appendChild(poly);
    }

    // Nodes
    for(const n of Object.values(state.nodes||{})){
      const p = layout.posById[n.id] || {x:0,y:0};
      const g = create('g');
      const cls = (!n.visible ? classes.nodeHidden : (n.active ? classes.nodeActive : classes.node));
      g.setAttribute('class', cls);
      g.setAttribute('transform', `translate(${p.x},${p.y})`);
      g.setAttribute('data-id', n.id);

      const rect = create('rect');
      rect.setAttribute('width', node.w);
      rect.setAttribute('height', node.h);
      rect.setAttribute('rx', node.rx);
      g.appendChild(rect);

      const t1 = create('text');
      t1.setAttribute('x', node.w/2);
      t1.setAttribute('y', 18);
      t1.setAttribute('text-anchor', 'middle');
      t1.textContent = n.name || 'Node';
      g.appendChild(t1);

      const t2 = create('text');
      t2.setAttribute('x', node.w/2);
      t2.setAttribute('y', 36);
      t2.setAttribute('text-anchor', 'middle');
      t2.textContent = `${n.type || '—'} · DV ${n.dv ?? '—'}`;
      g.appendChild(t2);

      g.addEventListener('click', ()=> emit('select', n.id));
      svgEl.appendChild(g);
    }
  }

  function getLayout(){ return lastLayout; }

  const API = { init, draw, on, getLayout };
  if(typeof window!=="undefined") window.NetrunTree = API;
  else if(typeof globalThis!=="undefined") globalThis.NetrunTree = API;
})();
