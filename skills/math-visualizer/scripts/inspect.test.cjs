'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const M=require('../assets/modules.js'),V=require('../assets/mathviz.js');
const {lint,inspect,formatReport}=require('./lesson_inspect.cjs'),S=require('./screenshot.cjs');
const load=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/configs',name),'utf8'));
const xex=(domain=[[-9,1.3]])=>({schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',
  teaching:{purpose:'worked-example',objective:'o',prerequisites:'p',scope:'图中参数 a 在 [−0.6, 1.2] 内可调。'},
  scenes:[{module:'function-graph',model:{param:'a',objects:[{id:'f',type:'curve',expr:'x*e^x',domain},{id:'level',type:'hline',y:'a',label:'y=a'},{id:'cross',type:'intersections',of:['f','level']}],
    checks:[{at:0,expect:{'cross.count':1}}]},
    view:{xMin:-3.9,xMax:0.9,yMin:-0.9,yMax:2.4,tick:1,title:'图'},control:{label:'a',min:-0.6,max:1.2,step:0.1,initial:0.5,stops:[-0.2,0]},
    steps:[{title:'转化',body:'曲线 y=f(x) 与水平线 y=a 的公共点个数就是解的个数。',formula:'',question:'先求什么？',layers:['f','level'],interactive:false},
      {title:'数公共点',body:'当前有 {{cross.count}} 个公共点。',formula:'',question:'在哪里变化？',layers:['f','level','cross'],interactive:true}]}]});

test('lint catches the two review blockers that rules can find, and stays quiet on the fixed version',()=>{
  const ok=xex();M.validate(ok);assert.deepEqual(lint(ok),[]);
  const bad=xex();bad.teaching.scope='图中参数 a 在 [−0.6, 2] 内可调。';bad.scenes[0].steps[0].layers=['f'];
  const w=lint(bad).map(x=>x.message);
  assert.ok(w.some(m=>/scope 写了区间 \[-0.6, 2\]，但滑块范围是 \[-0.6, 1.2\]/.test(m)));
  assert.ok(w.some(m=>/正文提到了「y=a」.*没有对象 level/.test(m)));
});
test('lint ignores intervals that are mathematical conclusions and concepts named without their label',()=>{
  const c=xex();c.teaching.scope='完整求出 a 的范围 (0,2]；拖动只用于观察。';c.scenes[0].steps[0].body='选项 D 问的是切线，本课先看交点。';
  assert.deepEqual(lint(c),[]);
  for(const f of ['gaokao-2022-q10.json','gaokao-2024-q6.json','quadratic-level.json','gaokao-2025-q7.json','templates/param-zero-count.json','templates/piecewise-monotone.json','templates/tangent-through-origin.json'])
    assert.deepEqual(lint(load(f)),[],f);
});
test('lint flags numbers shown without their object, early answer bindings and missing checks',()=>{
  const c=xex();c.scenes[0].steps[1].layers=['f','level'];delete c.scenes[0].model.checks;c.scenes[0].steps[0].formula='{{cross.count}}';c.scenes[0].steps[0].layers=['f','level','cross'];
  const w=lint(c).map(x=>x.message).join('\n');
  assert.match(w,/绑定了 \{\{cross.count\}\}，但这一步图上没有对象 cross/);
  assert.match(w,/第 1 步就绑定了 \{\{cross.count\}\}/);
  assert.match(w,/没有写 checks/);
});
test('inspect lists every step at the initial value and stops, with omitted labels and notices',()=>{
  const r=inspect(load('gaokao-2024-q6.json')),sc=r.scenes[0];
  assert.deepEqual(sc.values,[-2,-1,-0.5,0,0.5]);
  assert.equal(sc.steps.length,7);
  assert.equal(sc.steps[0].states.length,1,'non-interactive steps list only the initial value');
  assert.equal(sc.steps[1].states.length,5);
  assert.ok(sc.steps.every(st=>st.states.every(x=>Array.isArray(x.omittedLabels)&&Array.isArray(x.omittedTicks))));
  const text=formatReport(r);
  assert.match(text,/# 自查报告（lint 0 条提醒）/);
  assert.match(text,/第 4 步「两段各自递增/);
});
test('inspect warns when a too-narrow domain hides intersections, but not for a genuine asymptote',()=>{
  const narrow=xex([[-3,1.3]]);M.validate(narrow);
  assert.ok(inspect(narrow).scenes[0].hints.some(h=>/domain 之外还有 1 个交点/.test(h)),'a=-0.1 has a root near x=-3.58, outside [-3,1.3]');
  const wide=xex([[-60,1.3]]);M.validate(wide);
  assert.deepEqual(inspect(wide).scenes[0].hints,[]);
});
test('a wide domain along an asymptote does not invent tangency roots',()=>{
  const s=xex([[-60,1.3]]).scenes[0];
  assert.equal(M.derive(s,0)['cross.count'],1,'x·eˣ=0 only at the origin even though the left branch hugs the axis');
  assert.equal(M.derive(s,-0.2)['cross.count'],2);
  assert.equal(M.derive(s,-1/Math.E)['cross.count'],1,'true tangency is still detected');
});
test('player opens the step and parameter given in the URL hash and ignores invalid values',()=>{
  const open=hash=>{
    const nodes=new Map();
    class El{constructor(){this.listeners={};this.children=[];this.attrs={};this.textContent='';this.hidden=false;}addEventListener(k,f){this.listeners[k]=f;}append(x){this.children.push(x);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=String(v);}removeAttribute(k){delete this.attrs[k];}getBoundingClientRect(){return{left:0,top:0,width:680,height:450};}}
    const get=id=>{if(!nodes.has(id))nodes.set(id,new El());return nodes.get(id);};get('lesson-data').textContent=JSON.stringify(load('gaokao-2024-q6.json'));
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/player.js'),'utf8'),{MathModules:M,MathViz:V,URLSearchParams,location:{hash},
      document:{getElementById:get,createElement:()=>new El(),addEventListener(){}}});
    return {counter:get('counter').textContent,value:get('value').textContent};
  };
  assert.deepEqual(open('#step=4&v=-2'),{counter:'4 / 7',value:'-2'});
  assert.deepEqual(open('#step=2'),{counter:'2 / 7',value:'-0.5'});
  assert.deepEqual(open('#step=99&v=7'),{counter:'1 / 7',value:'-0.5'},'out-of-range step and value fall back to defaults');
  assert.deepEqual(open(''),{counter:'1 / 7',value:'-0.5'});
});
test('screenshot plan covers each step plus stops at the first size only, and finds a browser',()=>{
  const c=load('gaokao-2024-q6.json');
  const one=S.plan(c,['1366x768']);
  assert.equal(one.audits.length,7);
  assert.equal(one.shots.length,7+4*4,'four interactive steps × four stops that differ from the initial value');
  const two=S.plan(c,['1366x768','1440x900']);
  assert.equal(two.shots.length,one.shots.length+7);
  assert.match(S.stateUrl('C:\\课件\\a b.html',{step:3,v:-0.5},true),/^file:\/\/\/.+#step=3&v=-0.5&audit=1$/);
  assert.match(S.wrapperHtml('file:///x.html#a="b"',390,844),/width="390" height="844" src="file:\/\/\/x.html#a=&quot;b&quot;"/);
  assert.equal(S.findBrowser(null,{PROGRAMFILES:'C:\\PF'},'win32',p=>p==='C:\\PF\\Microsoft\\Edge\\Application\\msedge.exe'.replace(/\\/g,path.sep)||p.endsWith('msedge.exe')),path.join('C:\\PF','Microsoft','Edge','Application','msedge.exe'));
  assert.throws(()=>S.findBrowser(null,{},'linux',()=>false),/没找到 Chrome 或 Edge/);
  assert.throws(()=>S.readConfig('<html></html>'),/不是 build_lesson.cjs 生成的课件/);
});
