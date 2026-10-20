#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),modules=require('../assets/modules.js');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const {load,check}=require('./lesson_source.cjs');
function formalRoots(extra=[]){return [path.join(root,'assets','examples'),...(extra||[]).map(d=>path.resolve(d))];}
function build(source,target,options={}){
  source=path.resolve(source);target=path.resolve(target);
  /* 公开入口默认正式门禁，与 CLI 一致；开发试作与测试必须显式传 preview。 */
  const review=options.review||'require';
  if(review!=='require'&&review!=='preview')throw new Error(`review 必须是 require|preview：${review}`);
  const canonical=p=>{const resolved=fs.existsSync(p)?fs.realpathSync(p):path.resolve(p);return process.platform==='win32'?resolved.toLowerCase():resolved;};
  const {config,inputs}=load(source);
  if(review==='require'){
    const {gateOne}=require('./teaching_review.cjs');
    const verdict=gateOne('config',source);
    if(!verdict.ok)throw new Error(`教学审校门禁未通过：${verdict.reasons.join('；')}。先完成独立审校（teaching_review.cjs pack/verify-response），或以 --preview 生成明确标注的未审校预览。`);
  }else{
    const t=canonical(target);for(const dir of formalRoots(options.formalRoots))if(t.startsWith(canonical(dir)+path.sep))throw new Error(`未审校预览不得写入正式交付目录：${dir}`);
  }
  for(const input of inputs)for(const output of [target,target+'.build.json'])if(canonical(input)===canonical(output))throw new Error('Output must not overwrite input');
  const assets=['classroom.css','mathviz.js','modules.js','player.js'].map(f=>({name:f,content:fs.readFileSync(path.join(root,'assets',f),'utf8')}));
  const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
  const record={core:modules.version,configSHA256:hash(JSON.stringify(config)),purpose:config.teaching?.purpose||'unspecified',review:review==='preview'?'unreviewed-preview':review,models:config.scenes.map(s=>hash(JSON.stringify(s.model))),modules:config.scenes.map(s=>({id:s.module,version:modules.definitions[s.module].version})),assets:assets.map(a=>({name:a.name,sha256:hash(a.content)})),validation:'structure-and-model-boundaries; teacher review and browser checks still required'};
  const data=JSON.stringify(config).replace(/</g,'\\u003c');
  const preview=review==='preview';
  const banner=preview?`<div role="alert" style="background:#fef2f2;border:2px solid #b91c1c;color:#7f1d1d;padding:10px 16px;font:600 16px/1.5 sans-serif">⚠ 未审校预览 · 本页面未经独立教学审校，不得作为正式交付。</div>`:'';
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${preview?'【未审校预览】':''}${esc(config.title)}</title><link rel="icon" href="data:,">
<style>${assets[0].content}\n.explanation,#teacher{white-space:pre-line}</style>
${banner}<main><header><div class="identity"><span class="mark" aria-hidden="true">∩</span><span>数学 · 课堂讲解</span><span class="edition" id="edition"></span></div><div class="tools"><button id="notes-toggle" aria-expanded="false" aria-controls="notes">题目与备课提示</button>${config.prep?'<button id="prep-toggle" aria-expanded="false" aria-controls="prep">备课卡</button>':''}<button id="print-handout-btn" title="打印给学生的学案：题目、每步问题与作答空白">打印学案</button><span class="zoom" role="group" aria-label="字号"><button id="zoom-out" aria-label="缩小字号">A−</button><button id="zoom-in" aria-label="放大字号">A+</button></span><button id="fullscreen" title="全屏投影（F）">全屏</button></div></header>
<section id="notes" hidden><p><strong>原题</strong>：<span id="problem"></span></p><section id="teaching-summary" class="teaching-summary" hidden><span id="purpose"></span><p id="objective"></p><p id="scope" class="note"></p></section><p><strong>教师备课</strong>：<span id="teacher"></span></p><p id="source" class="source"></p></section>
<div class="intro"><div><p class="eyebrow" id="eyebrow"></p><h1 id="title"></h1></div>${config.equation?`<div class="equation">${modules.formatEquation(config.equation)}</div>`:''}</div>
<section class="task" aria-label="本课任务"><b>题</b><span id="task-text"></span></section>
<div class="stage" id="stage"><section class="visual" id="visual-panel"><div id="visual"></div><p id="notice" class="note" role="status"></p></section>
<section class="explanation"><h2 id="step-title"></h2><p id="body"></p><div id="formula" class="formula"></div><p id="question" class="note"></p></section></div>
<section class="parameter-bar" id="controls"><div class="parameter"><div class="parameter-heading"><span id="parameter-label"></span><output id="value" for="parameter"></output></div><div class="range-wrap"><input id="parameter" type="range"><div class="range-labels"><span id="range-min"></span><span>拖动滑块 · 方向键微调</span><span id="range-max"></span></div></div><div class="stops" id="stops" aria-label="关键观察位置"></div></div><button id="reset" class="quiet">恢复参数</button></section>
<footer><nav class="steps" id="steps" aria-label="讲解步骤"></nav><div class="navigation"><span id="counter" class="counter"></span><button id="restart" class="quiet">重新讲解</button><button id="previous" aria-label="上一步">←</button><button id="next" class="primary">下一步</button></div></footer>
${config.prep?'<aside class="prep" id="prep" hidden aria-label="备课卡"></aside><section class="print-only print-sheet print-prep" id="print-prep"></section>':''}<section class="print-only print-sheet print-handout" id="print-handout"></section></main>
<script id="lesson-data" type="application/json">${data}</script>${assets.slice(1).map(a=>`<script>\n${a.content}\n</script>`).join('')}</html>`;
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,html);fs.writeFileSync(target+'.build.json',JSON.stringify(record,null,2)+'\n');return record;
}
if(require.main===module){
  try{
    const args=process.argv.slice(2);
    if(args[0]==='--check'&&args.length===2){
      console.log(JSON.stringify(check(args[1]),null,2));
    }else if(args[0]==='--lint'&&args.length===2){
      const warnings=require('./lesson_inspect.cjs').lint(load(args[1]).config);
      console.log(warnings.length?warnings.map(w=>`- ${w.where}：${w.message}`).join('\n')+`\nlint：${warnings.length} 条提醒（不阻止构建；审校前先处理）`:'lint：没有提醒');
    }else if(args[0]==='--inspect'&&(args.length===2||(args.length===3&&args[2]==='--json'))){
      const I=require('./lesson_inspect.cjs'),report=I.inspect(load(args[1]).config);
      console.log(args[2]==='--json'?JSON.stringify(report,null,2):I.formatReport(report));
    }else{
      const preview=args.includes('--preview'),rest=[];
      for(let i=0;i<args.length;i++){
        if(args[i]==='--preview')continue;
        if(args[i]==='--formal-root'){rest.push(args[i],args[++i]);continue;}
        rest.push(args[i]);
      }
      const formalRoots=[],files=[];
      for(let i=0;i<rest.length;i++){
        if(rest[i]==='--formal-root'){formalRoots.push(rest[++i]);continue;}
        files.push(rest[i]);
      }
      if(files.length!==2||files.some(a=>a.startsWith('--')))throw new Error('Usage: node scripts/build_lesson.cjs --check lesson.json\n       node scripts/build_lesson.cjs --lint lesson.json\n       node scripts/build_lesson.cjs --inspect lesson.json [--json]\n       node scripts/build_lesson.cjs [--preview] [--formal-root <dir>]… lesson.json output.html\n--check 仅预检，不生成页面或发起审校。默认正式构建需通过独立审校；--preview 带未审校标记且拒写正式目录（默认仅 skill 自带 assets/examples；宿主仓库正式目录用 --formal-root 追加，可多次）。');
      build(files[0],files[1],{review:preview?'preview':'require',formalRoots});console.log(files[1]);
    }
  }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={build,load,check};
