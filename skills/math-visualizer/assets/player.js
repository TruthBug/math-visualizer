/* Stable teacher controls; all scenes share the same player. */
(function(){
  'use strict';
  const config=MathModules.validate(JSON.parse(document.getElementById('lesson-data').textContent));
  const MV=(typeof MathViz==='undefined')?null:MathViz;
  const $=id=>document.getElementById(id),values=config.scenes.map(s=>s.control.initial);
  const steps=config.scenes.flatMap((s,scene)=>s.steps.map((_,step)=>({scene,step})));let current=0,activeScene=-1;
  const visual=$('visual');let probe=null,probeScene=-1,dragging=false;
  for(const k of ['title','problem','source','teacher'])$(k).textContent=config[k];
  const teaching=config.teaching,names={concept:'概念解析','worked-example':'原题讲解',transfer:'方法迁移'};
  $('teaching-summary').hidden=!teaching;
  if(teaching){$('purpose').textContent=names[teaching.purpose];$('objective').textContent=teaching.objective;$('scope').textContent=teaching.scope;$('teacher').textContent=`前置知识：${teaching.prerequisites}\n${config.teacher}`;}
  $('edition').textContent=teaching?names[teaching.purpose]:'';
  $('eyebrow').textContent=teaching?names[teaching.purpose]:'数学观察与解释';
  const notesToggle=$('notes-toggle'),notes=$('notes');
  if(notesToggle&&notes)notesToggle.addEventListener('click',()=>{const open=notes.hidden;notes.hidden=!open;notesToggle.setAttribute('aria-expanded',String(open));});
  const stepsNav=$('steps'),tabs=[],stopButtons=[];
  if(stepsNav)steps.forEach((pos,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',config.scenes[pos.scene].steps[pos.step].title);b.textContent=String(i+1).padStart(2,'0');const short=config.scenes[pos.scene].steps[pos.step].tab;if(short){const label=document.createElement('span');label.textContent=short;b.append(label);}b.addEventListener('click',()=>{current=i;paint();});stepsNav.append(b);tabs.push(b);});
  /* 画布拖动：画布内拖动即设参数（control.type='drag'）。player 提供指针捕获、键盘等价与
     焦点保持，并做钳位与 step 吸附；拖动方向与数学映射来自模块的 drag 声明，值走与滑块、
     stops、方向键相同的更新入口。非交互步骤门控（tabindex=-1 + aria-disabled）。 */
  function dragOn(pos){const scene=config.scenes[pos.scene],step=scene.steps[pos.step];return scene.control.type==='drag'&&step.interactive&&step.showVisual!==false&&probe&&probeScene===pos.scene;}
  function setupDrag(pos,scene,step){
    const c=scene.control,supported=c.type==='drag',active=supported&&step.interactive&&step.showVisual!==false&&MV;
    if(active){
      if(probeScene!==pos.scene){probe=MV.createPlot({...scene.view,width:680,height:450});probeScene=pos.scene;}
      const def=MathModules.definitions[scene.module];
      visual.setAttribute('tabindex','0');visual.setAttribute('role','slider');
      visual.setAttribute('aria-label',c.label);visual.setAttribute('aria-orientation',def.drag.axis==='y'?'vertical':'horizontal');
      visual.setAttribute('aria-valuemin',String(c.min));visual.setAttribute('aria-valuemax',String(c.max));
      visual.setAttribute('aria-valuenow',String(values[pos.scene]));
      visual.setAttribute('aria-valuetext',`${def.parameter} = ${values[pos.scene]}`);
      visual.setAttribute('class',`draggable drag-${def.drag.axis}`);
      visual.removeAttribute('aria-disabled');
    }else{
      if(supported){probe=null;probeScene=-1;visual.setAttribute('tabindex','-1');visual.setAttribute('aria-disabled','true');}
      else visual.removeAttribute('tabindex');
      ['role','class','aria-label','aria-orientation','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext'].forEach(k=>visual.removeAttribute(k));
    }
  }
  function paint(){const pos=steps[current],scene=config.scenes[pos.scene],step=scene.steps[pos.step],out=MathModules.render(scene,values[pos.scene],pos.step);
    $('visual-panel').hidden=step.showVisual===false;$('stage').className=step.showVisual===false?'stage without-visual':'stage';
    setupDrag(pos,scene,step);
    visual.innerHTML=out.svg;$('step-title').textContent=step.title;
    for(const k of ['body','formula','question'])$(k).textContent=out[k];$('formula').hidden=!out.formula;
    $('notice').textContent=[dragOn(pos)?'可在图上拖动 · 方向键微调':'',out.notice,out.collisions.length?'部分标签因拥挤省略，请结合文字说明。':''].filter(Boolean).join(' ');
    $('controls').hidden=!step.interactive;$('counter').textContent=`${current+1} / ${steps.length}`;
    $('previous').disabled=current===0;$('next').disabled=current===steps.length-1;
    tabs.forEach((b,i)=>{if(i===current)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    const c=scene.control;if(activeScene!==pos.scene){$('parameter-label').textContent=c.label;Object.assign($('parameter'),{min:c.min,max:c.max,step:'any'});
      $('range-min').textContent=String(c.min);$('range-max').textContent=String(c.max);
      $('stops').replaceChildren();stopButtons.length=0;
      for(const v of c.stops){const b=document.createElement('button');b.type='button';b.textContent=`${MathModules.definitions[scene.module].parameter} = ${v}`;b.addEventListener('click',()=>{values[pos.scene]=v;paint();});$('stops').append(b);stopButtons.push({scene:pos.scene,v,b});}activeScene=pos.scene;}
    $('parameter').value=values[pos.scene];$('value').textContent=String(values[pos.scene]);
    for(const s of stopButtons)s.b.setAttribute('aria-pressed',String(values[s.scene]===s.v));
  }
  function nudge(i,key){const c=config.scenes[i].control;values[i]=key==='Home'?c.min:key==='End'?c.max:Math.min(c.max,Math.max(c.min,Number((values[i]+(['ArrowLeft','ArrowDown'].includes(key)?-c.step:c.step))).toPrecision(12)));paint();}
  $('parameter').addEventListener('input',e=>{values[steps[current].scene]=Number(e.target.value);paint();});
  $('parameter').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();nudge(steps[current].scene,e.key);}});
  visual.addEventListener('keydown',e=>{const pos=steps[current];if(dragOn(pos)&&['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();nudge(pos.scene,e.key);}});
  function dragTo(e){const pos=steps[current],scene=config.scenes[pos.scene],c=scene.control;if(!dragOn(pos))return;
    const rect=visual.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const px=(e.clientX-rect.left)*680/rect.width,py=(e.clientY-rect.top)*450/rect.height,origin=probe.map([0,0]);
    const pt={x:(px-origin[0])/probe.scale,y:(origin[1]-py)/probe.scale};
    const raw=MathModules.definitions[scene.module].drag.fromPoint(scene.model,pt);if(!Number.isFinite(raw))return;
    const v=Math.min(c.max,Math.max(c.min,Number((Math.round(raw/c.step)*c.step).toPrecision(12))));
    if(v!==values[pos.scene]){values[pos.scene]=v;paint();}}
  visual.addEventListener('pointerdown',e=>{const pos=steps[current];if(!dragOn(pos)||e.button!==0)return;dragging=true;if(visual.setPointerCapture)visual.setPointerCapture(e.pointerId);dragTo(e);e.preventDefault();});
  visual.addEventListener('pointermove',e=>{if(dragging)dragTo(e);});
  ['pointerup','pointercancel','lostpointercapture'].forEach(k=>visual.addEventListener(k,()=>{dragging=false;}));
  $('previous').addEventListener('click',()=>{if(current>0){current--;paint();}});$('next').addEventListener('click',()=>{if(current<steps.length-1){current++;paint();}});
  $('reset').addEventListener('click',()=>{const i=steps[current].scene;values[i]=config.scenes[i].control.initial;paint();});
  $('restart').addEventListener('click',()=>{config.scenes.forEach((s,i)=>values[i]=s.control.initial);current=0;paint();});paint();
})();
