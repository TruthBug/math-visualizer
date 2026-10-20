'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const M=require('../assets/modules.js'),V=require('../assets/mathviz.js'),{build}=require('./build_lesson.cjs');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/configs',name),'utf8'));
test('drag accepts an optional explanation function and rejects a non-callable explanation',()=>{
 const config=load('quadratic-level.json'),cap=M.definitions['quadratic-level'].drag;
 try{
  cap.explain='not a function';
  assert.throws(()=>M.validate(config),/drag.explain/);
  cap.explain=()=> '此处无定义。';
  M.validate(config);
 }finally{delete cap.explain;}
 M.validate(config);
});
test('quadratic roots satisfy equations for both opening directions',()=>{
 for(const a of [-2,1,3])for(const h of [-1,2])for(const k of [-1,3,7]){const s={module:'quadratic-level',model:{a,h,v:3}},d=M.derive(s,k);assert.equal(d.count,(k-3)/a<0?0:k===3?1:2);for(const [x,y]of d.points)assert.ok(Math.abs(a*(x-h)**2+3-y)<1e-10);}
});
test('circle critical counts and decimal tangency',()=>{
 const s=load('gaokao-2025-q7.json').scenes[0];assert.deepEqual([.5,1,2,3,4].map(r=>M.derive(s,r).count),[0,1,2,3,4]);
 s.model={cx:.1,cy:.1,nx:3,ny:4,c:0,distance:1};assert.equal(M.derive(s,1.14).count,3);assert.equal(M.derive(s,1.14-1e-8).count,2);assert.equal(M.derive(s,1.14+1e-8).count,4);
 for(const r of [.5,1,2,3])for(const [x,y]of M.derive(s,r).points){assert.ok(Math.abs(Math.hypot(x-.1,y-.1)-r)<1e-12);assert.ok(Math.abs(Math.abs(3*x+4*y)/5-1)<1e-12);}
});
test('validation rejects unknown capabilities, fields and unsafe ticks',()=>{
 const c=load('quadratic-level.json');c.scenes[0].module='missing';assert.throws(()=>M.validate(c));c.scenes[0].module='quadratic-level';c.scenes[0].steps[0].body='{{unknown}}';assert.throws(()=>M.validate(c));c.scenes[0].steps[0].body='ok';Object.assign(c.scenes[0].view,{xMin:1e16,xMax:1e16+4,tick:.1});assert.throws(()=>M.validate(c));assert.throws(()=>V.createPlot({xMin:1e16,xMax:1e16+4}).axes({step:.1}));
});
test('builder preserves input against output/sidecar collisions and embeds data safely',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'math-reuse-'));try{const input=path.join(dir,'lesson.html.build.json'),output=path.join(dir,'lesson.html'),c=load('quadratic-level.json');c.title='</script><script>alert(1)</script>';const raw=JSON.stringify(c);fs.writeFileSync(input,raw);assert.throws(()=>build(input,output,{review:'preview'}));assert.equal(fs.readFileSync(input,'utf8'),raw);const target=path.join(dir,'safe.html');build(input,target,{review:'preview'});const html=fs.readFileSync(target,'utf8');assert.ok(html.includes('\\u003c/script>'));assert.ok(!html.includes('<script>alert(1)</script>'));if(process.platform==='win32')assert.throws(()=>build(input,input.toUpperCase(),{review:'preview'}));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('player reuses controls, preserves parameters across scenes and distinguishes reset/restart',()=>{ const c=load('quadratic-level.json');c.scenes.push(load('gaokao-2025-q7.json').scenes[0]);const nodes=new Map();const docListeners={};
 class Element{constructor(){this.listeners={};this.children=[];this.attrs={};}addEventListener(k,f){this.listeners[k]=f;}append(x){this.children.push(x);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=String(v);}removeAttribute(k){delete this.attrs[k];}getBoundingClientRect(){return{left:0,top:0,width:680,height:450};}setPointerCapture(){}releasePointerCapture(){}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};get('lesson-data').textContent=JSON.stringify(c);
 const context={MathModules:M,MathViz:V,document:{getElementById:get,createElement:()=>new Element(),addEventListener:(k,f)=>{docListeners[k]=f;}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/player.js'),'utf8'),context);
 const input=get('parameter'),click=id=>get(id).listeners.click();input.value=4;input.listeners.input({target:input});click('next');click('reset');assert.equal(get('counter').textContent,'2 / 9');assert.equal(input.value,1);
 click('next');click('next');assert.equal(get('counter').textContent,'4 / 9');for(let i=0;i<4;i++)click('next');input.value=3;input.listeners.input({target:input});assert.ok(get('body').textContent.includes('3 个'));for(let i=0;i<5;i++)click('previous');assert.equal(input.value,1);click('next');assert.equal(input.value,3);assert.equal(input,get('parameter'));click('restart');assert.equal(get('counter').textContent,'1 / 9');assert.equal(input.value,1);
 /* P1-7 drag：画布键盘与指针拖动走同一更新入口，aria 与 data-drag-hint 随值同步；非交互步门控 */
 const visual=get('visual');
 assert.equal(visual.attrs.role,'slider');assert.equal(visual.attrs['aria-valuemin'],'-2');assert.equal(visual.attrs['aria-orientation'],'vertical');
 assert.equal(visual.attrs['data-drag-hint'],'↕ 上下拖动调节');
 assert.ok(visual.attrs.class.includes('draggable drag-y'));assert.ok(get('notice').textContent.includes('可在图上拖动'));
 visual.listeners.keydown({key:'ArrowUp',preventDefault(){}});
 assert.equal(visual.attrs['aria-valuenow'],'1.25');assert.equal(input.value,1.25);
 visual.listeners.pointerdown({button:0,pointerId:1,clientX:300,clientY:300,preventDefault(){}});
 visual.listeners.pointermove({clientX:300,clientY:318.5});  /* map 反解：318.5px 对应数学 y=0（k=0） */
 visual.listeners.pointerup({pointerId:1});
 assert.equal(visual.attrs['aria-valuenow'],'0');assert.equal(input.value,0);
 click('next');click('next');
 assert.equal(visual.attrs['aria-disabled'],'true');assert.equal(visual.attrs.tabindex,'-1');assert.equal(visual.attrs.role,undefined);assert.equal(visual.attrs['data-drag-hint'],undefined);
 click('previous');
 assert.equal(visual.attrs.role,'slider');assert.equal(visual.attrs['aria-valuenow'],'0');assert.ok(!('aria-disabled' in visual.attrs));
 /* 课堂翻页笔/键盘全局 PageDown / PageUp 快捷键（非输入控件焦点时生效） */
 docListeners.keydown({key:'PageDown',target:{tagName:'BODY'},preventDefault(){}});
 assert.equal(get('counter').textContent,'3 / 9');
 docListeners.keydown({key:'PageUp',target:{tagName:'INPUT'},preventDefault(){}});
 assert.equal(get('counter').textContent,'3 / 9','输入控件内按键不得触发全局翻页');
 docListeners.keydown({key:'PageUp',target:{tagName:'BODY'},preventDefault(){}});
 assert.equal(get('counter').textContent,'2 / 9');
});
/* 可选对象标识（annotations）：身份按 derive 规范化 offset 的减/加侧，不按当次远近重排。 */
test('circle-line-distance annotations identify objects, reject misuse and never dangle',()=>{
 const base=()=>({schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[{module:'circle-line-distance',model:{cx:2,cy:-1,nx:0,ny:1,c:-3,distance:1},view:{xMin:-4,xMax:6,yMin:-5,yMax:4,tick:1,title:'v'},control:{label:'r',min:.5,max:5,step:.5,initial:2,stops:[1,3]},steps:[{title:'a',body:'b',formula:'',question:'q',layers:['circle','loci'],interactive:true,annotations:[{objectId:'locus.minus',text:'甲',importance:'essential'},{objectId:'locus.plus',text:'乙'}]}]}]});
 let c=base();M.validate(c);
 const out=M.render(c.scenes[0],2,0);
 for(const id of ['locus.minus','locus.plus'])assert.equal(out.labelEvidence.find(e=>e.id===id).status,'rendered');
 assert.ok(out.svg.includes('>甲</text>')&&out.svg.includes('>乙</text>'));
 const bare=base();delete bare.scenes[0].steps[0].annotations;M.validate(bare);
 assert.deepEqual(M.render(c.scenes[0],2,0).data,M.render(bare.scenes[0],2,0).data,'annotations must not change derived math');
 assert.deepEqual(M.derive(c.scenes[0],3),M.derive(bare.scenes[0],3));
 let bad=base();bad.scenes[0].steps[0].layers=['circle'];assert.throws(()=>M.validate(bad),/requires layer 'loci'/);
 bad=base();bad.scenes[0].steps[0].layers=['near-locus'];assert.throws(()=>M.validate(bad),/requires layer 'loci'/);
 bad=base();bad.scenes[0].steps[0].annotations=[{objectId:'locus.middle',text:'x'}];assert.throws(()=>M.validate(bad),/declares no object/);
 bad=base();bad.scenes[0].steps[0].annotations.push({objectId:'locus.minus',text:'丙'});assert.throws(()=>M.validate(bad),/duplicate annotation/);
 bad=base();Object.assign(bad.scenes[0].steps[0],{showVisual:false,layers:[],interactive:false});assert.throws(()=>M.validate(bad),/showVisual/);
 bad=base();bad.scenes[0].steps[0].annotations=[{objectId:'original',text:'原直线',importance:'critical'}];assert.throws(()=>M.validate(bad),/importance/);
 const quad={schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[{module:'quadratic-level',model:{a:1,h:0,v:0},view:{xMin:-5,xMax:5,yMin:-3,yMax:4,tick:1,title:'v'},control:{label:'k',min:-2,max:4,step:1,initial:1,stops:[]},steps:[{title:'a',body:'b',formula:'',question:'q',layers:['curve'],interactive:true,annotations:[{objectId:'curve',text:'抛物线'}]}]}]};
 assert.throws(()=>M.validate(quad),/declares no object 'curve'/);
 /* 模块声明了对象却缺 anchor / 缺 objectLayer 映射，必须在 validate 阶段就拒绝，不能等 render 抛错 */
 const stub={version:'1.0.0',parameter:'r',fields:['r'],layers:['loci'],objects:['x'],objectLayer:{x:'loci'},
   validate(){},derive(){return{r:1}},draw(){}};
 const stubCfg={schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[{module:'stub-no-anchor',model:{},view:{xMin:-5,xMax:5,yMin:-3,yMax:4,tick:1,title:'v'},control:{label:'r',min:.5,max:4,step:.5,initial:1,stops:[]},steps:[{title:'a',body:'b',formula:'',question:'q',layers:['loci'],interactive:true,annotations:[{objectId:'x',text:'X'}]}]}]};
 M.definitions['stub-no-anchor']=stub;
 try{
   assert.throws(()=>M.validate(stubCfg),/has no anchor/);
   stub.anchor=()=>{throw new Error('should not be called during validate');};
   const stubNoLayer={...stub,objects:['x'],objectLayer:{}};
   M.definitions['stub-no-layer']=stubNoLayer;stubCfg.scenes[0].module='stub-no-layer';
   assert.throws(()=>M.validate(stubCfg),/maps it to no layer/);
 }finally{delete M.definitions['stub-no-anchor'];delete M.definitions['stub-no-layer'];}
 const vert=base();vert.scenes[0].model={cx:0,cy:0,nx:1,ny:0,c:0,distance:2};M.validate(vert);
 const ev=M.render(vert.scenes[0],3,0).labelEvidence;
 /* offset −2 → 直线 x=2（minus），offset +2 → x=−2（plus）：身份绑定 offset 侧而非位置 */
 assert.ok(Math.abs(ev.find(e=>e.id==='locus.minus').anchor[0]-2)<1e-9&&Math.abs(ev.find(e=>e.id==='locus.plus').anchor[0]+2)<1e-9);
 vert.scenes[0].view={xMin:-1,xMax:6,yMin:-3,yMax:3,tick:1,title:'v'};M.validate(vert);
 const narrow=M.render(vert.scenes[0],3,0),plus=narrow.labelEvidence.find(e=>e.id==='locus.plus');
 assert.equal(plus.status,'omitted');assert.match(plus.reason,/not visible/);assert.ok(!narrow.svg.includes('>乙</text>'),'invisible object must not leave a dangling label');
 assert.equal(narrow.labelEvidence.find(e=>e.id==='locus.minus').status,'rendered');
});
/* 抛物线法线弦：垂直条件锁死 Q、面积公式、退化与对称性（与 verify_q9.py 的独立核验互为对照） */
test('parabola-normal-chord derives the normal chord, area formula and rejects t=0',()=>{
 const s={module:'parabola-normal-chord',model:{}};
 for(const t of [0.1,0.25,Math.sqrt(3)/6,0.5,1,2,-0.5,-2]){
  const d=M.derive(s,t),[P,Q]=d.points;
  assert.ok(Math.abs(Q[1]-Q[0]*Q[0])<1e-9,'Q lies on y=x^2');
  const dot=(Q[0]-P[0])*(0-P[0])+(Q[1]-P[1])*(-t*t-P[1]);
  assert.ok(Math.abs(dot)<1e-9*Math.max(1,Math.abs((Q[1]-P[1])*(t*t+P[1]))),'PQ is perpendicular to PR');
  assert.ok(d.s!==0&&d.s!==t,'Q stays non-origin and distinct from P');
  assert.ok(Math.abs(d.area-(4*t*t+1)**2/(8*Math.abs(t)))<1e-9*Math.max(1,d.area),'closed-form area');
  assert.ok(Math.abs(d.area-d.pq*d.pr/2)<1e-12,'area equals half the leg product');
  assert.ok(Math.abs(d.uStar-Math.sqrt(3)/6)<1e-15&&Math.abs(d.areaMin-4*Math.sqrt(3)/9)<1e-15,'minimum constants');
 }
 assert.equal(M.derive(s,0.7).area,M.derive(s,-0.7).area,'mirror symmetry in t');
 assert.throws(()=>M.derive(s,0),/nonzero/);
});
test('parabola-normal-chord config validation, rendering and out-of-view reporting',()=>{
 const c=()=>({schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[
  {module:'parabola-normal-chord',model:{},view:{xMin:-3.2,xMax:3.2,yMin:-1.6,yMax:5.2,tick:1,title:'v'},
   control:{label:'t',min:0.1,max:2,step:0.01,initial:0.5,stops:[0.15,0.5,1,2]},
   steps:[{title:'a',body:'Q 的横坐标 s={{s}}',formula:'',question:'q',
     layers:['parabola','tangent','normal','intersections','triangle'],interactive:true}]}]});
 M.validate(c());
 const out=M.render(c().scenes[0],0.5,0);
 const st=id=>out.labelEvidence.find(e=>e.id===id);
 assert.ok(['P','Q','R'].every(id=>st(id).status==='rendered'),'point identities rendered');
 assert.ok(out.svg.includes('>P</text>')&&out.svg.includes('>Q</text>')&&out.svg.includes('>R</text>'));
 assert.ok(out.body.includes('s=-1.5'),'dynamic binding resolves');
 const far=M.render(c().scenes[0],0.15,0);
 assert.ok(far.notice.includes('当前视窗外'),'out-of-view intersection reported');
 assert.ok(!far.svg.includes('>Q</text>'),'no dangling Q label outside the view');
 const straddle=c();straddle.scenes[0].control.min=-1;
 assert.throws(()=>M.validate(straddle),/straddle/);
 const unknown=c();unknown.scenes[0].steps[0].body='{{nope}}';
 assert.throws(()=>M.validate(unknown),/unsupported binding/);
 const areaView=c();Object.assign(areaView.scenes[0],{view:{xMin:0,xMax:0.7,yMin:0.6,yMax:1.6,tick:0.2,title:'area'},
   control:{label:'t',min:0.09,max:0.7,step:0.01,initial:0.5,stops:[0.09,0.2887,0.45,0.7]},
   steps:[{title:'b',body:'S={{area}}',formula:'',question:'q',layers:['area-graph','area-marker','area-minimum'],interactive:true}]});
 M.validate(areaView);
 const ar=M.render(areaView.scenes[0],0.2887,0);
 assert.ok(ar.svg.includes('4√3/9'),'minimum label rendered');
 assert.ok(ar.labelEvidence.some(e=>e.id==='areaMin'&&e.status==='rendered'),'minimum identity tracked');
});
/* 场景换平面时轴标签可改名（view.axisX/axisY）：阻止 u/S 平面残留 x/y 符号歧义 */
test('view axisX/axisY rename axis letters; defaults unchanged and inputs validated',()=>{
 const p=V.createPlot({xMin:0,xMax:1.2,yMin:0,yMax:1.7});p.axes({step:.25,xLabel:'u',yLabel:'S'});
 assert.ok(p.svg().includes('>u</text>')&&p.svg().includes('>S</text>'));
 const q=V.createPlot({xMin:-1,xMax:1,yMin:-1,yMax:1});q.axes({step:1});
 assert.ok(q.svg().includes('>x</text>')&&q.svg().includes('>y</text>'),'defaults keep x/y');
 assert.throws(()=>V.createPlot({xMin:-1,xMax:1,yMin:-1,yMax:1}).axes({step:1,xLabel:3}),/strings/);
 const cfg=()=>({schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[
  {module:'parabola-normal-chord',model:{},view:{xMin:0,xMax:1.2,yMin:0,yMax:1.7,tick:.25,title:'v',axisX:'u',axisY:'S'},
   control:{label:'t',min:.09,max:.7,step:.01,initial:.5,stops:[.09,.2887,.45,.7]},
   steps:[{title:'a',body:'b',formula:'',question:'q',layers:['area-graph'],interactive:true}]}]});
 M.validate(cfg());
 const out=M.render(cfg().scenes[0],.5,0);
 assert.ok(out.svg.includes('>u</text>')&&out.svg.includes('>S</text>'),'render passes renamed axes');
 const bad=cfg();delete bad.scenes[0].view.axisX;bad.scenes[0].view.axisX='';
 assert.throws(()=>M.validate(bad),/axisX/);
});
/* P1-7 control.type 契约：drag 控件要求模块声明 drag:{axis,fromPoint}；range 为缺省；step 仍必填。 */
test('control.type drag contract: capability declared and validated, pilot config accepted',()=>{
 const cfg=()=>load('quadratic-level.json');
 M.validate(cfg());
 const cap=M.definitions['quadratic-level'].drag;
 assert.equal(cap.axis,'y');
 assert.equal(cap.fromPoint({a:1,h:1,v:0},{x:2,y:3}),3,'fromPoint maps the declared axis to the parameter');
 const badType=cfg();badType.scenes[0].control.type='pinch';
 assert.throws(()=>M.validate(badType),/control\.type/);
 /* 模块无 drag 能力却用 drag 控件 → validate 拒绝（circle-line-distance 未声明 drag） */
 const noCap=cfg();noCap.scenes[0].module='circle-line-distance';noCap.scenes[0].model=load('gaokao-2025-q7.json').scenes[0].model;
 noCap.scenes[0].control={label:'r',min:0.5,max:5,step:0.5,initial:2,stops:[1,3],type:'drag'};
 assert.throws(()=>M.validate(noCap),/drag/);
 /* 能力声明的三种非法形态：缺能力、axis 非法、fromPoint 非有限 */
 const stub={version:'1.0.0',parameter:'x',fields:[],layers:['loci'],objects:[],validate(){},derive(){return{x:1}},draw(){}};
 const stubCfg=()=>({schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[{module:'stub-drag',model:{},view:{xMin:0,xMax:1,yMin:0,yMax:1,tick:1,title:'v'},control:{label:'x',min:0,max:1,step:0.5,initial:0.5,stops:[],type:'drag'},steps:[{title:'a',body:'b',formula:'',question:'q',layers:[],interactive:true}]}]});
 M.definitions['stub-drag']=stub;
 try{
  assert.throws(()=>M.validate(stubCfg()),/drag/);
  M.definitions['stub-drag'].drag={axis:'z',fromPoint:()=>0};
  assert.throws(()=>M.validate(stubCfg()),/axis/);
  M.definitions['stub-drag'].drag={axis:'x',fromPoint:()=>NaN};
  assert.throws(()=>M.validate(stubCfg()),/finite/);
  M.definitions['stub-drag'].drag={axis:'x',fromPoint:()=>0};
  M.validate(stubCfg());
 }finally{delete M.definitions['stub-drag'];}
 /* 缺省 type 视为 range：无 drag 能力的模块 + 无 type 字段 = 合法 */
 const plain=cfg();plain.scenes[0].control.type=undefined;
 M.validate(plain);
});
/* 通用 render 不认识图层名或模块语义：模块不回报 notice 就没有提示，图层名本身不构成特例。 */
test('render forwards what a module reports and never derives notices from layer names',()=>{
 const cfg=()=>({schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[{module:'stub-notice',model:{},view:{xMin:0,xMax:1,yMin:0,yMax:1,tick:1,title:'v'},
   control:{label:'x',min:1,max:2,step:1,initial:1,stops:[]},
   steps:[{title:'a',body:'b',formula:'',question:'q',layers:['intersections'],interactive:true}]}]});
 /* 1. 模块自报的 notice 被透传（derive 给出的 [9,9] 在视窗外，但通用层不该自己下结论） */
 M.definitions['stub-notice']={version:'1.0.0',parameter:'x',fields:[],layers:['intersections'],objects:[],
   validate(){},derive(){return{points:[[9,9]]}},draw(){return{notice:'模块自报：视窗外的交点数由模块自己判断。'};}};
 try{
  const c=cfg();M.validate(c);
  assert.equal(M.render(c.scenes[0],1,0).notice,'模块自报：视窗外的交点数由模块自己判断。');
  /* 2. 模块不回报 notice（无返回 / 空对象 / 非字符串）就没有提示，图层名不被当作语义 */
  M.definitions['stub-notice'].draw=()=>{};
  assert.equal(M.render(c.scenes[0],1,0).notice,'');
  M.definitions['stub-notice'].draw=()=>({});
  assert.equal(M.render(c.scenes[0],1,0).notice,'');
  M.definitions['stub-notice'].draw=()=>({notice:7});
  assert.equal(M.render(c.scenes[0],1,0).notice,'','非文本 notice 不得进入产物');
  /* 3. 三个内置模块仍各自负责提示：视窗外交点有提示，全部可见时无提示 */
  const circle=load('gaokao-2025-q7.json').scenes[0];
  const stepWith=layers=>{const s=JSON.parse(JSON.stringify(circle));s.steps=[{title:'a',body:'b',formula:'',question:'q',layers,interactive:true}];return s;};
  const wide=stepWith(['circle','loci','intersections']);
  assert.equal(M.render(wide,2,0).notice,'','全部交点可见时不应有提示');
  const narrow=stepWith(['circle','loci','intersections']);Object.assign(narrow.view,{xMin:-1,xMax:1,yMin:-1,yMax:1});
  assert.match(M.render(narrow,3,0).notice,/^2 个交点在当前视窗外/);
  const nearOnly=stepWith(['circle','loci','near-intersections']);Object.assign(nearOnly.view,{xMin:-1,xMax:1,yMin:-1,yMax:1});
  assert.match(M.render(nearOnly,3,0).notice,/^1 个交点在当前视窗外/,'near-intersections 只报当次较近的一对');
  const quad={schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[{module:'quadratic-level',model:{a:1,h:0,v:0},
    view:{xMin:-1,xMax:1,yMin:-1,yMax:5,tick:1,title:'v'},control:{label:'k',min:1,max:4,step:1,initial:1,stops:[]},
    steps:[{title:'a',body:'b',formula:'',question:'q',layers:['curve','level','intersections'],interactive:true}]}]};
  assert.match(M.render(quad.scenes[0],2,0).notice,/^2 个交点在当前视窗外/);
  const noLayer=JSON.parse(JSON.stringify(quad));noLayer.scenes[0].steps[0].layers=['curve','level'];
  assert.equal(M.render(noLayer.scenes[0],2,0).notice,'','未画交点层就不该提示交点');
 }finally{delete M.definitions['stub-notice'];}
});
test('list_capabilities exports drag metadata so agents can discover direct manipulation modules',()=>{
 const {execFileSync}=require('node:child_process');
 const out=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'list_capabilities.cjs')],{encoding:'utf8'}));
 const quad=out.modules.find(x=>x.id==='quadratic-level');
 const circle=out.modules.find(x=>x.id==='circle-line-distance');
 assert.deepEqual(quad.drag,{axis:'y',hasExplain:false});
 assert.equal(circle.drag,null);
});

