'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../assets/modules.js');
const ev=(src,scope={},vars=Object.keys(scope))=>M.compileExpr(src,vars,'t')(scope);
const scene=(model,extra={})=>({module:'function-graph',model,view:{xMin:-3,xMax:3,yMin:-3,yMax:4,tick:1,title:'图'},
  control:{label:'参数 a',min:-2,max:3,step:0.5,initial:1,stops:[1]},steps:[{title:'看图',body:'a={{a}}',formula:'',question:'看到了什么？',layers:model.objects.map(o=>o.id),interactive:true}],...extra});
const lesson=s=>({schemaVersion:1,title:'t',problem:'p',source:'s',teacher:'t',scenes:[s]});
const cubic={param:'a',objects:[{id:'f',type:'curve',expr:'x^3-x+1',domain:[[-4,4]],label:'y=f(x)'},{id:'level',type:'hline',y:'a',label:'y=a'},{id:'cross',type:'intersections',of:['f','level']}]};

test('expression parser: precedence, functions, constants and unicode operators',()=>{
  assert.equal(ev('1+2*3^2'),19);
  assert.equal(ev('-x^2',{x:3}),-9);
  assert.equal(ev('2^3^2'),512);
  assert.equal(ev('(1+2)*(3-1)/4'),1.5);
  assert.equal(ev('sqrt(16)+abs(-2)+lg(100)+ln(e)'),9);
  assert.equal(ev('log(2,8)'),3);
  assert.equal(ev('cbrt(-8)'),-2);
  assert.ok(Math.abs(ev('sin(pi/2)')-1)<1e-15);
  assert.equal(ev('2×x−3÷x',{x:3}),5);
  assert.equal(ev('x²+π*0',{x:4}),16);
  assert.equal(ev(2.5),2.5);
  assert.ok(Number.isNaN(ev('sqrt(x)',{x:-1})));
});
test('expression parser: actionable errors for common model mistakes',()=>{
  const bad=(src,re,vars=['x','a'])=>assert.throws(()=>M.compileExpr(src,vars,'expr'),re);
  bad('2x',/缺少乘号.*2\*x/);
  bad('x(x+1)',/缺少乘号/);
  bad('ax',/未知名称 'ax'.*a\*x/);
  bad('sin x',/函数 sin 后面要接括号/);
  bad('log(8)',/log 需要 2 个参数.*ln/);
  bad('(x+1',/缺少 '\)'/);
  bad('x+1)',/多余的 '\)'/);
  bad('x+',/表达式不完整/);
  bad('x;alert(1)',/无法识别的字符 ';'/);
  bad('x+y',/未知名称 'y'/);
  bad('',/不能为空/);
  bad('x+'.repeat(120)+'1',/不超过 200/);
  bad('('.repeat(60)+'x'+')'.repeat(60),/嵌套过深/,['x']);
});
test('expression parser never reaches object prototypes or globals',()=>{
  for(const src of ['constructor','__proto__','toString','process','globalThis','this','Function'])
    assert.throws(()=>M.compileExpr(src,['x'],'expr'),/未知名称|无法识别/);
  assert.throws(()=>M.compileExpr('x["constructor"]',['x'],'expr'),/无法识别/);
  assert.throws(()=>M.compileExpr({},['x'],'expr'),/表达式字符串/);
});

test('function-graph schema: layers, fields and drag axis come from the model',()=>{
  const s=scene({param:'a',objects:[...cubic.objects,{id:'P',type:'point',on:'f',x:'a'},{id:'t',type:'tangent',of:'f',at:'a'}]});
  const caps=M.capabilities(s);
  assert.equal(caps.parameter,'a');
  assert.deepEqual(caps.layers,['f','level','cross','P','t']);
  assert.deepEqual(caps.fields,['a','cross.count','P.x','P.y','t.slope','t.x','t.y']);
  assert.equal(caps.drag.axis,'y');
  assert.equal(M.capabilities(scene({param:'m',objects:[cubic.objects[0],{id:'v',type:'vline',x:'m'}]})).drag.axis,'x');
  assert.equal(M.capabilities(scene({param:'a',objects:[cubic.objects[0]]})).drag,undefined);
  M.validate(lesson(s));
});
test('intersections count simple roots, tangency (double roots) and ignore jumps',()=>{
  const s=scene(cubic),r=Math.sqrt(3)/3,peak=1+2*r/3,valley=1-2*r/3;
  assert.equal(M.derive(s,1).count===undefined,true);
  assert.equal(M.derive(s,1)['cross.count'],3);
  assert.equal(M.derive(s,peak)['cross.count'],2,'tangent at the local max counts once');
  assert.equal(M.derive(s,valley)['cross.count'],2);
  assert.equal(M.derive(s,3)['cross.count'],1);
  for(const [x,y] of M.derive(s,1).geo.cross)assert.ok(Math.abs(x**3-x+1-y)<1e-9&&Math.abs(y-1)<1e-9);
  const jump=scene({param:'a',objects:[{id:'g',type:'curve',expr:'1/x',domain:[[-3,-0.01],[0.01,3]]},{id:'axis',type:'hline',y:'0'},{id:'z',type:'intersections',of:['g','axis']}]});
  assert.equal(M.derive(jump,0)['z.count'],0,'asymptote sign change is not a root');
  const pw=scene({param:'a',objects:[{id:'h',type:'piecewise',pieces:[{expr:'-1',from:-3,to:0,right:'open'},{expr:'1',from:0,to:3,left:'closed'}]},{id:'axis',type:'hline',y:'0'},{id:'z',type:'intersections',of:['h','axis']}]});
  assert.equal(M.derive(pw,0)['z.count'],0,'piecewise jump across y=0 is not a root');
});
test('piecewise evaluation respects open/closed endpoints and rejects two closed ends',()=>{
  const model={param:'a',objects:[{id:'h',type:'piecewise',pieces:[{expr:'-x^2-2*a*x-a',from:-3,to:0,right:'open'},{expr:'exp(x)+ln(x+1)',from:0,to:3,left:'closed'}]},
    {id:'P',type:'point',on:'h',x:'0'}]};
  assert.equal(M.derive(scene(model),-1)['P.y'],1);
  const twoClosed=JSON.parse(JSON.stringify(model));twoClosed.objects[0].pieces[0].right='closed';
  assert.throws(()=>M.validate(lesson(scene(twoClosed))),/两侧不能都取实心/);
});
test('tangent slope is accurate and tidy; endpoints without both sides are rejected',()=>{
  const s=scene({param:'a',objects:[cubic.objects[0],{id:'t',type:'tangent',of:'f',at:'a'}]});
  assert.equal(M.derive(s,1)['t.slope'],2);
  assert.equal(M.derive(s,0)['t.slope'],-1);
  assert.equal(M.derive(s,1)['t.y'],1);
  const edge=scene({param:'a',objects:[cubic.objects[0],{id:'t',type:'tangent',of:'f',at:'4'}]});
  assert.throws(()=>M.derive(edge,0),/两侧都要有定义/);
});
test('keypoint claims are verified: position, extremum kind and zero',()=>{
  const ok={id:'mx',type:'keypoint',on:'f',x:'-sqrt(3)/3',y:'1+2*sqrt(3)/9',kind:'max',label:'极大值'};
  M.validate(lesson(scene({param:'a',objects:[cubic.objects[0],ok]})));
  const wrongY={...ok,y:'1.385'};
  assert.throws(()=>M.validate(lesson(scene({param:'a',objects:[cubic.objects[0],wrongY]}))),/不在 f 上.*精确式/);
  const wrongKind={...ok,kind:'min'};
  assert.throws(()=>M.validate(lesson(scene({param:'a',objects:[cubic.objects[0],wrongKind]}))),/标为极小值/);
  const notZero={id:'z',type:'keypoint',on:'f',x:'0',y:'1',kind:'zero'};
  assert.throws(()=>M.validate(lesson(scene({param:'a',objects:[cubic.objects[0],notZero]}))),/零点/);
});
test('checks catch a miscopied critical value',()=>{
  const good={...cubic,checks:[{at:'1+2*sqrt(3)/9',expect:{'cross.count':2}},{at:2,expect:{'cross.count':1}}]};
  M.validate(lesson(scene(good)));
  const bad={...cubic,checks:[{at:1,expect:{'cross.count':2}}]};
  assert.throws(()=>M.validate(lesson(scene(bad))),/a=1 时 cross.count 实际是 3，与写的 2 不符/);
  assert.throws(()=>M.validate(lesson(scene({...cubic,checks:[{at:1,expect:{'nope.count':1}}]}))),/unsupported field nope.count/);
});
test('model validation messages point at the field to fix',()=>{
  const v=model=>()=>M.validate(lesson(scene(model)));
  assert.throws(v({param:'x',objects:cubic.objects}),/参数名/);
  assert.throws(v({param:'a',objects:[{id:'f',type:'curve',expr:'x^2'}]}),/domain/);
  assert.throws(v({param:'a',objects:[{id:'f',type:'circle'}]}),/type 只能是/);
  assert.throws(v({param:'a',objects:[cubic.objects[0],{id:'P',type:'point',on:'g',x:'a'}]}),/P.on 要引用/);
  assert.throws(v({param:'a',objects:[{...cubic.objects[0],tone:'red'}]}),/tone 只能是/);
  assert.throws(v({param:'a',objects:[{...cubic.objects[0],label:'{{cross.count}}'}]}),/不存在的字段/);
  assert.throws(v({param:'a',objects:[cubic.objects[0],{id:'P',type:'point',on:'f',x:'x'}]}),/未知名称 'x'/);
  const s=scene(cubic);s.steps[0].layers=['f','g'];
  assert.throws(()=>M.validate(lesson(s)),/unsupported layer: g（可用：f、level、cross）/);
});
test('render draws only the requested layers and reports label evidence',()=>{
  const model={param:'a',objects:[...cubic.objects,{id:'mx',type:'keypoint',on:'f',x:'-sqrt(3)/3',y:'1+2*sqrt(3)/9',kind:'max',label:'极大值 {{mx.y}}'}]};
  const s=scene(model);s.steps[0].layers=['f'];s.steps.push({...s.steps[0],layers:['f','level','cross','mx']});
  const first=M.render(s,1,0),second=M.render(s,1,1);
  assert.ok(!first.svg.includes('极大值'),'keypoint label stays hidden until its layer is shown');
  assert.ok(second.labelEvidence.some(e=>e.id==='mx'&&e.status==='rendered'&&e.text.startsWith('极大值 ≈ 1.3849')));
  assert.ok(second.labelEvidence.some(e=>e.id==='level'));
  const far=M.render(s,40,1);
  assert.equal(far.data['cross.count'],1);
  assert.ok(far.labelEvidence.some(e=>e.id==='level'&&e.status==='omitted'),'off-screen line keeps an omitted record, not a dangling label');
});
test('every visible object type actually draws SVG geometry',()=>{
  const model={param:'a',objects:[{id:'f',type:'curve',expr:'x^2',domain:[[-3,3]]},{id:'h',type:'piecewise',pieces:[{expr:'x',from:-3,to:0,right:'open'},{expr:'x+1',from:0,to:3,left:'closed'}]},
    {id:'k',type:'hline',y:'a'},{id:'v',type:'vline',x:'1'},{id:'P',type:'point',on:'f',x:'a'},{id:'t',type:'tangent',of:'f',at:'a'},{id:'z',type:'intersections',of:['f','k']},{id:'q',type:'keypoint',on:'f',x:0,y:0,kind:'min'}]};
  const s=scene(model),paths=layers=>{s.steps[0].layers=layers;return (M.render(s,1,0).svg.match(/<path d="M[\d.]/g)||[]).length;},count=(layers,re)=>{s.steps[0].layers=layers;return (M.render(s,1,0).svg.match(re)||[]).length;};
  assert.equal(paths(['f']),1);
  assert.equal(paths(['h']),2);
  const base=count([],/<line /g);
  assert.ok(count(['k'],/<line /g)>base&&count(['v'],/<line /g)>base&&count(['t'],/<line /g)>base);
  const dots=count([],/<circle /g);
  assert.equal(count(['h'],/<circle /g)-dots,2,'open and closed endpoint markers');
  assert.equal(count(['P'],/<circle /g)-dots,1);
  assert.equal(count(['f','k','z'],/<circle /g)-dots,2);
  assert.equal(count(['q'],/<circle /g)-dots,1);
});
test('optional objects vanish quietly where undefined and cannot be bound in step text',()=>{
  const model={param:'a',objects:[{id:'L',type:'piecewise',pieces:[{expr:'-x^2-2*a*x-a',from:-3,to:0,right:'open'}]},{id:'top',type:'keypoint',on:'L',x:'-a',y:'a^2-a',kind:'max',optional:true,label:'最高点 {{top.y}}'}]};
  const s=scene(model);
  assert.ok(M.derive(s,1).geo.top);
  assert.equal(M.derive(s,-1).geo.top,undefined);
  assert.ok(M.render(s,-1,0).labelEvidence.some(e=>e.id==='top'&&e.status==='omitted'));
  assert.ok((M.render(s,-1,0).svg.match(/<path d="M[\d.]/g)||[]).length===1,'the curve is still drawn');
  s.steps[0].body='{{top.y}}';
  assert.throws(()=>M.validate(lesson(s)),/unsupported binding: top.y/);
  assert.throws(()=>M.validate(lesson(scene({...model,objects:[model.objects[0],{...model.objects[1],optional:false}]}))),/没有定义/);
});
test('bundled function-graph configs and templates validate with their checks',()=>{
  const fs=require('node:fs'),path=require('node:path'),dir=path.join(__dirname,'../assets/configs');
  const files=['gaokao-2022-q10.json','gaokao-2024-q6.json',...fs.readdirSync(path.join(dir,'templates')).map(f=>'templates/'+f)];
  assert.ok(files.length>=5);
  for(const f of files){const c=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));M.validate(c);assert.equal(c.scenes[0].module,'function-graph',f);}
});
/* 回归：独立审查（2026-10-20）复现的缺陷 */
const hl=(id,y)=>({id,type:'hline',y});
test('review fix: a jump whose one-sided limit touches the line is not an intersection',()=>{
  const s=scene({param:'a',objects:[{id:'h',type:'piecewise',pieces:[{expr:'x-1',from:0,to:1,right:'open'},{expr:'x+5',from:1,to:3,left:'closed'}]},hl('z','0'),{id:'I',type:'intersections',of:['h','z']}]});
  assert.equal(M.derive(s,0)['I.count'],0);
});
test('review fix: two roots closer than the sampling step are both found',()=>{
  const s=scene({param:'a',objects:[{id:'f',type:'curve',expr:'(x-0.5)^2-a',domain:[[-3,3]]},hl('z','0'),{id:'I',type:'intersections',of:['f','z']}]});
  assert.equal(M.derive(s,1e-8)['I.count'],2);
  assert.equal(M.derive(s,0)['I.count'],1,'exact tangency still counts once');
});
test('review fix: wide domains sample densely enough for nearby roots',()=>{
  const s=scene({param:'a',objects:[{id:'f',type:'curve',expr:'x^2+a*x',domain:[[-1000,1000]]},hl('z','0'),{id:'I',type:'intersections',of:['f','z']}]});
  assert.equal(M.derive(s,0.5)['I.count'],2);
});
test('review fix: tolerance is local, so a small positive minimum on a wide domain is not a tangency',()=>{
  const s=scene({param:'a',objects:[{id:'f',type:'curve',expr:'x^2+a',domain:[[-100,100]]},hl('z','0'),{id:'I',type:'intersections',of:['f','z']}]});
  assert.equal(M.derive(s,1e-7)['I.count'],0);
});
test('review fix: object ids that shadow Object.prototype members are safe',()=>{
  const s=scene({param:'a',objects:[{id:'f',type:'curve',expr:'x',domain:[[-3,0]]},{id:'constructor',type:'point',on:'f',x:'a',optional:true,label:'P'}]});
  assert.equal(M.derive(s,2).geo.constructor,undefined);
  assert.doesNotThrow(()=>M.render(s,2,0));
});
test('review fix: in-place model edits recompile instead of reusing stale closures',()=>{
  const model={param:'a',objects:[{id:'f',type:'curve',expr:'x',domain:[[-3,3]]},hl('z','1'),{id:'I',type:'intersections',of:['f','z']}]},s=scene(model);
  assert.deepEqual(M.derive(s,0).geo.I,[[1,1]]);
  model.objects[0].expr='x+0.5';
  assert.deepEqual(M.derive(s,0).geo.I,[[0.5,1]]);
});
test('review fix: validation sweeps the slider grid so an undefined interior value fails the build',()=>{
  const s=scene({param:'a',objects:[{id:'f',type:'curve',expr:'x^2',domain:[[-3,0],[1,3]]},{id:'T',type:'tangent',of:'f',at:'a'}]});
  s.control={label:'a',min:-1,max:2,step:0.5,initial:-1,stops:[1.5]};
  assert.throws(()=>M.validate(lesson(s)),/对象 T：/,'interior grid points (a=0, 0.5) are checked, not only min/max/initial/stops');
});
