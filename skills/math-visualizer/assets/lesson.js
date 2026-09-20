/* 统一课堂壳的步骤播放器：模型/场景函数属于题目自己；壳负责步骤标签页、参数栏与备课提示开关。
 *
 * 【兼容步骤壳】本文件是"低层组合路径"的参考壳，不再演进：
 * 不新增能力、不做行为改动（仅允许修复确定的缺陷）。配置路径（build_lesson.cjs +
 * modules.js + player.js）是唯一演进路径，新能力只进入 modules.js 的模块契约。
 * 新任务能用配置路径就不要新写本壳页面。 */
(function(root){
  'use strict';
  function mount(config){
    const $=id=>document.getElementById(id), state={step:0,...config.initial};
    const controls=config.controls||[];
    const stepsNav=$('steps'), tabs=[], stopButtons=[];
    if(stepsNav){
      config.steps.forEach((s,i)=>{
        const b=document.createElement('button');
        b.type='button';b.setAttribute('aria-label',s.title);
        b.append(document.createTextNode(String(i+1).padStart(2,'0')));
        if(s.tab){const span=document.createElement('span');span.textContent=s.tab;b.append(span);}
        b.addEventListener('click',()=>{state.step=i;paint();});
        stepsNav.append(b);tabs.push(b);
      });
    }
    const notesToggle=$('notes-toggle'),notes=$('notes');
    if(notesToggle&&notes)notesToggle.addEventListener('click',()=>{
      const open=notes.hidden;notes.hidden=!open;notesToggle.setAttribute('aria-expanded',String(open));
    });
    function paint(){
      const step=config.steps[state.step];
      $('step-title').textContent=step.title;
      $('explanation').innerHTML=step.body(state);
      $('question').textContent=typeof step.question==='function'?step.question(state):(step.question||'');
      $('visual').innerHTML=config.draw(state);
      $('counter').textContent=`${state.step+1} / ${config.steps.length}`;
      $('previous').disabled=state.step===0;
      $('next').disabled=state.step===config.steps.length-1;
      tabs.forEach((b,i)=>{if(i===state.step)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
      let anyVisible=false;
      for(const c of controls){
        const visible=state.step>=(c.from||0) && state.step<=(c.to??Infinity);
        $('wrap-'+c.key).hidden=!visible;anyVisible=anyVisible||visible;
        $('value-'+c.key).textContent=c.format?c.format(state[c.key]):String(state[c.key]);
        $('input-'+c.key).value=String(state[c.key]);
      }
      $('controls').hidden=!anyVisible;
      for(const s of stopButtons)s.b.setAttribute('aria-pressed',String(state[s.c.key]===s.v));
    }
    for(const c of controls){
      const wrap=document.createElement('div');wrap.className='parameter';wrap.id='wrap-'+c.key;
      const heading=document.createElement('div');heading.className='parameter-heading';
      const name=document.createElement('span');name.textContent=c.label;
      const value=document.createElement('output');value.id='value-'+c.key;
      heading.append(name,value);
      const rangeWrap=document.createElement('div');rangeWrap.className='range-wrap';
      const input=document.createElement('input');input.type='range';input.id='input-'+c.key;
      input.min=c.min;input.max=c.max;input.step=c.step;input.value=state[c.key];
      input.addEventListener('input',()=>{state[c.key]=Number(input.value);paint();});
      value.htmlFor=input.id;
      const labels=document.createElement('div');labels.className='range-labels';
      const lo=document.createElement('span');lo.textContent=c.format?c.format(c.min):String(c.min);
      const hint=document.createElement('span');
      const hi=document.createElement('span');hi.textContent=c.format?c.format(c.max):String(c.max);
      labels.append(lo,hint,hi);
      rangeWrap.append(input,labels);
      wrap.append(heading,rangeWrap);
      if(Array.isArray(c.stops)&&c.stops.length){
        const stops=document.createElement('div');stops.className='stops';stops.setAttribute('aria-label','代表位置');
        for(const v of c.stops){
          const b=document.createElement('button');b.type='button';
          b.textContent=c.format?c.format(v):String(v);
          b.addEventListener('click',()=>{state[c.key]=v;paint();});
          stops.append(b);stopButtons.push({c,v,b});
        }
        wrap.append(stops);
      }
      $('controls').append(wrap);
    }
    $('previous').addEventListener('click',()=>{if(state.step>0){state.step--;paint();}});
    $('next').addEventListener('click',()=>{if(state.step<config.steps.length-1){state.step++;paint();}});
    $('reset').addEventListener('click',()=>{Object.assign(state,config.initial);paint();});
    $('restart').addEventListener('click',()=>{Object.assign(state,config.initial);state.step=0;paint();});
    paint();
    return {state,paint};
  }
  root.MathLesson={mount};
})(globalThis);
