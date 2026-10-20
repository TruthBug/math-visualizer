/* Stable teacher controls; all scenes share the same player. */
(function(){
  'use strict';
  const config=MathModules.validate(JSON.parse(document.getElementById('lesson-data').textContent));
  const MV=(typeof MathViz==='undefined')?null:MathViz;
  const $=id=>document.getElementById(id),values=config.scenes.map(s=>s.control.initial);
  const steps=config.scenes.flatMap((s,scene)=>s.steps.map((_,step)=>({scene,step})));let current=0,activeScene=-1;
  const visual=$('visual');let probe=null,probeScene=-1,dragging=false,dragRejected=false;
  for(const k of ['title','problem','source','teacher'])$(k).textContent=config[k];
  const teaching=config.teaching,names={concept:'概念解析','worked-example':'原题讲解',transfer:'方法迁移'};
  $('teaching-summary').hidden=!teaching;
  if(teaching){$('purpose').textContent=names[teaching.purpose];$('objective').textContent=teaching.objective;$('scope').textContent=teaching.scope;$('teacher').textContent=`前置知识：${teaching.prerequisites}\n${config.teacher}`;}
  $('edition').textContent='';
  $('eyebrow').textContent=teaching?names[teaching.purpose]:'数学观察与解释';
  const notesToggle=$('notes-toggle'),notes=$('notes');
  if(notesToggle&&notes)notesToggle.addEventListener('click',()=>{const open=notes.hidden;notes.hidden=!open;notesToggle.setAttribute('aria-expanded',String(open));});
  /* v2 课堂工具：题目条常驻、备课卡、打印学案/备课卡、字号、全屏。全部可选，缺节点时静默跳过（兼容旧壳与测试替身）。 */
  const has=id=>document.getElementById(id)!=null,esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if(has('task-text'))$('task-text').textContent=config.problem;
  const prep=config.prep,prepPanel=has('prep')?$('prep'):null,prepToggle=has('prep-toggle')?$('prep-toggle'):null;
  function prepHTML(withTools){if(!prep)return '';const sec=(t,b)=>b?`<section><h3>${t}</h3>${b}</section>`:'',p=x=>x?`<p>${esc(x)}</p>`:'';
    const meta=[['用途',prep.position],['考点',prep.examPoints],['建议用时',prep.minutes?`约 ${prep.minutes} 分钟`:'']].filter(x=>x[1]);
    return `<div class="prep-head"><h2>备课卡 · ${esc(config.title)}</h2>${withTools?'<div><button type="button" data-prep="print">打印</button><button type="button" data-prep="close">收起</button></div>':''}</div>`
    +sec('本题定位',meta.length?`<dl>${meta.map(([k,v])=>`<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`:'')
    +sec('题眼（突破口）',p(prep.breakthrough))
    +sec('启发提问链',(prep.thinking||[]).length?`<ol>${prep.thinking.map(q=>`<li>${esc(q.ask)}<span class="expect">预期：${esc(q.expect)}</span></li>`).join('')}</ol>`:'')
    +sec('预设错误与应对',(prep.errors||[]).length?`<ul>${prep.errors.map(e=>`<li><b>${esc(e.error)}</b>　${esc(e.cause)}<span class="expect">应对：${esc(e.remedy)}</span></li>`).join('')}</ul>`:'')
    +sec('方法提炼',p(prep.method))
    +sec('变式练习',(prep.variants||[]).length?`<ol>${prep.variants.map(v=>`<li>${esc(v.problem)}<span class="expect">改动：${esc(v.change)}；答案：${esc(v.answer)}</span></li>`).join('')}</ol>`:'')
    +sec('板书要点',p(prep.board));}
  if(prepPanel&&prep){prepPanel.innerHTML=prepHTML(true);if(has('print-prep'))$('print-prep').innerHTML=prepHTML(false);}
  function setPrep(open){if(!prepPanel)return;prepPanel.hidden=!open;if(prepToggle)prepToggle.setAttribute('aria-expanded',String(open));}
  if(prepToggle)prepToggle.addEventListener('click',()=>setPrep(prepPanel.hidden));
  function printAs(kind){const b=document.body;if(!b||typeof window==='undefined'||!window.print)return;b.classList.add('print-'+kind);const done=()=>{b.classList.remove('print-'+kind);window.removeEventListener('afterprint',done);};window.addEventListener('afterprint',done);window.print();setTimeout(done,1000);}
  if(prepPanel)prepPanel.addEventListener('click',e=>{const a=e.target&&e.target.getAttribute&&e.target.getAttribute('data-prep');if(a==='close')setPrep(false);if(a==='print')printAs('prep');});
  if(has('print-handout')){
    const items=steps.map(pos=>{const st=config.scenes[pos.scene].steps[pos.step];return `<li><b>${esc(st.title)}</b><span class="ask">${esc(MathModules.render(config.scenes[pos.scene],config.scenes[pos.scene].control.initial,pos.step).question)}</span><div class="blank"></div></li>`;}).join('');
    const first=config.scenes[0].steps.findIndex(st=>st.showVisual!==false);
    const fig=first>=0?MathModules.render(config.scenes[0],config.scenes[0].control.initial,first).svg:'';
    $('print-handout').innerHTML=`<h1>${esc(config.title)}</h1><p class="sub">学案　姓名________　班级________</p><div class="problem">${esc(config.problem)}</div>${fig?`<div class="figure">${fig}</div>`:''}<ol>${items}</ol>`;
    if(has('print-handout-btn'))$('print-handout-btn').addEventListener('click',()=>printAs('handout'));
  }else if(has('print-handout-btn'))$('print-handout-btn').hidden=true;
  const root=document.documentElement;let fs=1;
  try{const saved=Number(localStorage.getItem('mathviz-fs'));if(saved>=0.8&&saved<=1.6)fs=saved;}catch(e){}
  function zoom(d){fs=Math.min(1.6,Math.max(0.8,Math.round((fs+d)*10)/10));if(root&&root.style)root.style.setProperty('--fs',String(fs));try{localStorage.setItem('mathviz-fs',String(fs));}catch(e){}}
  if(fs!==1)zoom(0);
  if(has('zoom-in'))$('zoom-in').addEventListener('click',()=>zoom(0.1));
  if(has('zoom-out'))$('zoom-out').addEventListener('click',()=>zoom(-0.1));
  function toggleFull(){const m=document.querySelector&&document.querySelector('main');if(!m)return;if(document.fullscreenElement){document.exitFullscreen&&document.exitFullscreen();}else if(m.requestFullscreen){m.requestFullscreen().catch(()=>{});}}
  if(has('fullscreen'))$('fullscreen').addEventListener('click',toggleFull);
  const stepsNav=$('steps'),tabs=[],stopButtons=[];
  if(stepsNav)steps.forEach((pos,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',config.scenes[pos.scene].steps[pos.step].title);b.textContent=String(i+1).padStart(2,'0');const short=config.scenes[pos.scene].steps[pos.step].tab;if(short){const label=document.createElement('span');label.textContent=short;b.append(label);}b.addEventListener('click',()=>{current=i;paint();});stepsNav.append(b);tabs.push(b);});
  /* P1-7 drag：画布内拖动即设参数（control.type='drag'）。player 提供指针捕获、键盘等价与
     焦点保持，并做钳位与 step 吸附；拖动方向与数学映射来自模块的 drag 声明，值走与滑块、
     stops、方向键相同的更新入口。非交互步骤门控（tabindex=-1 + aria-disabled）。 */
  function dragOn(pos){const scene=config.scenes[pos.scene],step=scene.steps[pos.step];return scene.control.type==='drag'&&step.interactive&&step.showVisual!==false&&probe&&probeScene===pos.scene;}
  function setupDrag(pos,scene,step){
    const c=scene.control,supported=c.type==='drag',active=supported&&step.interactive&&step.showVisual!==false&&MV;
    if(active){
      if(probeScene!==pos.scene){probe=MV.createPlot({...scene.view,width:680,height:450});probeScene=pos.scene;}
      const def=MathModules.capabilities(scene);
      visual.setAttribute('tabindex','0');visual.setAttribute('role','slider');
      visual.setAttribute('aria-label',c.label);visual.setAttribute('aria-orientation',def.drag.axis==='y'?'vertical':'horizontal');
      visual.setAttribute('aria-valuemin',String(c.min));visual.setAttribute('aria-valuemax',String(c.max));
      visual.setAttribute('aria-valuenow',String(values[pos.scene]));
      visual.setAttribute('aria-valuetext',`${def.parameter} = ${values[pos.scene]}`);
      visual.setAttribute('class',`draggable drag-${def.drag.axis}`);
      visual.setAttribute('data-drag-hint',def.drag.axis==='y'?'↕ 上下拖动调节':'↔ 左右拖动调节');
      visual.removeAttribute('aria-disabled');
    }else{
      if(supported){probe=null;probeScene=-1;visual.setAttribute('tabindex','-1');visual.setAttribute('aria-disabled','true');}
      else visual.removeAttribute('tabindex');
      ['role','class','aria-label','aria-orientation','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext','data-drag-hint'].forEach(k=>visual.removeAttribute(k));
    }
  }
  function paint(){dragRejected=false;const pos=steps[current],scene=config.scenes[pos.scene],step=scene.steps[pos.step],out=MathModules.render(scene,values[pos.scene],pos.step);
    $('visual-panel').hidden=step.showVisual===false;$('stage').className=step.showVisual===false?'stage without-visual':'stage';
    setupDrag(pos,scene,step);
    visual.innerHTML=out.svg;$('step-title').textContent=step.title;
    for(const k of ['body','formula','question'])$(k).textContent=out[k];$('formula').hidden=!out.formula;
    $('notice').textContent=[dragOn(pos)?'可在图上拖动 · 方向键微调':'',out.notice,out.collisions.length?`已省略：${out.collisions.slice(0,3).map(c=>c.text).join('、')} 等 ${out.collisions.length} 项。`:''].filter(Boolean).join(' ');
    $('controls').hidden=!step.interactive;$('counter').textContent=`${current+1} / ${steps.length}`;
    $('previous').disabled=current===0;$('next').disabled=current===steps.length-1;
    tabs.forEach((b,i)=>{if(i===current)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    const c=scene.control;if(activeScene!==pos.scene){$('parameter-label').textContent=c.label;Object.assign($('parameter'),{min:c.min,max:c.max,step:'any'});
      $('range-min').textContent=String(c.min);$('range-max').textContent=String(c.max);
      $('stops').replaceChildren();stopButtons.length=0;
      for(const v of c.stops){const b=document.createElement('button');b.type='button';b.textContent=`${MathModules.capabilities(scene).parameter} = ${v}`;b.addEventListener('click',()=>{values[pos.scene]=v;paint();});$('stops').append(b);stopButtons.push({scene:pos.scene,v,b});}activeScene=pos.scene;}
    $('parameter').value=values[pos.scene];$('value').textContent=String(values[pos.scene]);
    for(const s of stopButtons)s.b.setAttribute('aria-pressed',String(values[s.scene]===s.v));
  }
  /* 滑块是连续的（step:'any'），构建时只试算了网格点；网格之间某个值若让图形无定义，保持原值并提示，不让整页停住。 */
  function setValue(i,v){try{MathModules.derive(config.scenes[i],v);}catch(err){paint();$('notice').textContent=`${MathModules.capabilities(config.scenes[i]).parameter} = ${v} 时图形没有定义，已保持原值。`;return;}values[i]=v;paint();}
  function nudge(i,key){const c=config.scenes[i].control;setValue(i,key==='Home'?c.min:key==='End'?c.max:Math.min(c.max,Math.max(c.min,Number((values[i]+(['ArrowLeft','ArrowDown'].includes(key)?-c.step:c.step))).toPrecision(12))));}
  $('parameter').addEventListener('input',e=>{setValue(steps[current].scene,Number(e.target.value));});
  $('parameter').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();nudge(steps[current].scene,e.key);}});
  visual.addEventListener('keydown',e=>{const pos=steps[current];if(dragOn(pos)&&['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();nudge(pos.scene,e.key);}});
  function dragTo(e){const pos=steps[current],scene=config.scenes[pos.scene],c=scene.control;if(!dragOn(pos))return;
    const rect=visual.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const px=(e.clientX-rect.left)*680/rect.width,py=(e.clientY-rect.top)*450/rect.height,origin=probe.map([0,0]);
    const pt={x:(px-origin[0])/probe.scale,y:(origin[1]-py)/probe.scale};
    const cap=MathModules.capabilities(scene).drag,raw=cap.fromPoint(scene.model,pt);
    if(!Number.isFinite(raw)){
      const message=cap.explain?cap.explain(scene.model,pt):'此处无法确定参数，请拖到其他位置。';
      if($('notice').textContent!==message)$('notice').textContent=message;
      dragRejected=true;return;
    }
    const v=Math.min(c.max,Math.max(c.min,Number((Math.round(raw/c.step)*c.step).toPrecision(12))));
    if(v!==values[pos.scene]||dragRejected){values[pos.scene]=v;paint();}}
  visual.addEventListener('pointerdown',e=>{const pos=steps[current];if(!dragOn(pos)||e.button!==0)return;dragging=true;if(visual.setPointerCapture)visual.setPointerCapture(e.pointerId);dragTo(e);e.preventDefault();});
  visual.addEventListener('pointermove',e=>{if(dragging)dragTo(e);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(k=>visual.addEventListener(k,()=>{dragging=false;}));
  $('previous').addEventListener('click',()=>{if(current>0){current--;paint();}});$('next').addEventListener('click',()=>{if(current<steps.length-1){current++;paint();}});
  if(document.addEventListener)document.addEventListener('keydown',e=>{const t=e.target&&e.target.tagName;if(t&&['INPUT','SELECT','TEXTAREA'].includes(t))return;const onSlider=e.target&&e.target.getAttribute&&e.target.getAttribute('role')==='slider';const fwd=e.key==='PageDown'||(!onSlider&&e.key==='ArrowRight'),back=e.key==='PageUp'||(!onSlider&&e.key==='ArrowLeft');if(fwd&&current<steps.length-1){e.preventDefault();current++;paint();}else if(back&&current>0){e.preventDefault();current--;paint();}else if((e.key==='f'||e.key==='F')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){toggleFull();}else if(e.key==='Escape'&&prepPanel&&!prepPanel.hidden){setPrep(false);}});
  $('reset').addEventListener('click',()=>{const i=steps[current].scene;values[i]=config.scenes[i].control.initial;paint();});
  $('restart').addEventListener('click',()=>{config.scenes.forEach((s,i)=>values[i]=s.control.initial);current=0;paint();});
  /* 网址定位（截图与验收用）：#step=3&v=0.5 打开第 3 步，并把这一步所在场景的参数设为 0.5；无效值忽略，按默认状态打开。 */
  try{const h=typeof location!=='undefined'&&location.hash?new URLSearchParams(location.hash.slice(1)):null;
    if(h){const n=Number(h.get('step'));if(Number.isInteger(n)&&n>=1&&n<=steps.length)current=n-1;
      const i=steps[current].scene,c=config.scenes[i].control,v=Number(h.get('v'));
      if(h.has('v')&&Number.isFinite(v)&&v>=c.min&&v<=c.max){try{MathModules.derive(config.scenes[i],v);values[i]=v;}catch(err){}}}}catch(err){}
  paint();
  /* #audit=1：把布局检查结果写到 body 的 data-mathviz-audit 上，供截图脚本经 --dump-dom 读取（纯文本模型也能拿到结论）。 */
  try{if(typeof location!=='undefined'&&/(^|[#&])audit=1(&|$)/.test(location.hash||'')&&typeof window!=='undefined'&&document.documentElement&&document.body){
    const pos=steps[current],de=document.documentElement;
    document.body.setAttribute('data-mathviz-audit',JSON.stringify({step:current+1,value:values[pos.scene],viewport:`${window.innerWidth}x${window.innerHeight}`,
      overflowX:de.scrollWidth>window.innerWidth+1,scrollWidth:de.scrollWidth,notice:$('notice').textContent}));}}catch(err){}
})();
