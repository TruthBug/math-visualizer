const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../assets/mathviz.js');
test('coordinates preserve equal scale and upward positive y', () => {
  const p=M.createPlot({width:900,height:400,xMin:-10,xMax:10,yMin:-2,yMax:2});
  const o=p.map([0,0]),x=p.map([1,0]),y=p.map([0,1]);
  assert.ok(Math.abs((x[0]-o[0])-(o[1]-y[1]))<1e-10); assert.ok(y[1]<o[1]);
});
test('explicit domains and segments do not bridge asymptotes', () => {
  const p=M.createPlot(); p.curve(x=>1/x,{segments:[[-3,-.1],[.1,3]],samples:20,maxJump:100000});
  const d=p.svg().match(/<path d="([^"]*)" fill="none"/)[1];
  assert.equal((d.match(/M/g)||[]).length,2);
  const q=M.createPlot();q.curve(x=>x,{domain:x=>Math.abs(x)>1,samples:20,maxJump:100000});
  assert.equal((q.svg().match(/<path d="([^"]*)" fill="none"/)[1].match(/M/g)||[]).length,2);
});
test('labels clamp to viewbox, avoid each other, report excess density', () => {
  const p=M.createPlot({width:250,height:200});
  for(let i=0;i<30;i++)p.label([5,4],`标签${i}`);
  assert.ok(p.collisions.length>0);
  for(const a of p.labels){assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=250&&a.y+a.h<=200);for(const b of p.labels){if(a===b)continue;assert.ok(a.x>=b.x+b.w||a.x+a.w<=b.x||a.y>=b.y+b.h||a.y+a.h<=b.y);}}
});
test('origin and tick labels stay attached to their coordinates under crowding', () => {
  const p=M.createPlot({xMin:-5,xMax:5,yMin:-5,yMax:5});
  const o=p.map([0,0]);
  p.label([0,0],'reserved',{fontSize:20,dx:-23,dy:28,fixed:true}).axes({step:.5});
  assert.equal(p.labels.find(l=>l.text==='O'),undefined);
  assert.ok(p.collisions.some(l=>l.text==='O'));
  const q=M.createPlot({xMin:-5,xMax:5,yMin:-5,yMax:5}).axes({step:.5});
  const origin=q.labels.find(l=>l.text==='O');
  assert.ok(origin);assert.equal(origin.x,o[0]-23);assert.equal(origin.y,o[1]+2);
  for(const l of q.labels) {
    assert.equal(l.fixed,true);
    const anchor=q.map(l.point);
    assert.ok(Math.hypot(l.x-anchor[0],l.y-anchor[1])<=45,'axis label must remain near its anchor');
  }
});
test('Unicode minus labels fit adjacent ticks without permitting real overlap', () => {
  const options={width:400,height:400,padding:20,xMin:0,xMax:10,yMin:0,yMax:10};
  const style={fontSize:20,dx:0,dy:0,fixed:true};
  const p=M.createPlot(options);
  p.label([2,5],'−2',style).label([3,5],'−1',style);
  assert.deepEqual(p.labelEvidence.map(e=>e.status),['rendered','rendered'],
    '36px spacing fits two negative integer labels with padding');
  assert.ok(p.labels[0].x+p.labels[0].w<=p.labels[1].x);
  assert.ok(p.svg().includes('>−2</text>')&&p.svg().includes('>−1</text>'),
    'preserve the mathematical minus in the rendered text');
  const crowded=M.createPlot(options);
  crowded.label([2,5],'−2',style).label([2.7,5],'−1',style);
  assert.equal(crowded.labelEvidence[1].status,'omitted','25.2px spacing is too narrow');
  const chinese=M.createPlot(options);
  chinese.label([2,5],'中文',style).label([3,5],'汉字',style);
  assert.equal(chinese.labelEvidence[1].status,'omitted','CJK labels retain full-width estimates');
});
test('distant labels retain an explicit leader to their mathematical point', () => {
  const p=M.createPlot().label([0,0],'A',{dx:100,dy:0});
  assert.equal(p.labels[0].leader,true);
  assert.ok(p.svg().includes('data-label-leader="A"'));
  const [x,y]=p.map([0,0]);
  assert.ok(p.svg().includes(`x1="${x}" y1="${y}"`));
});
test('rational reduction is exact, arbitrary decimals are explicitly approximate', () => {
  assert.deepEqual(M.fraction(-6,-8),{n:3,d:4,text:'3/4',value:.75});
  assert.equal(M.fraction(0,4).text,'0');assert.throws(()=>M.fraction(.1,3));assert.throws(()=>M.fraction(1,0));
  assert.equal(M.approximate(5.5625,2),'≈ 5.56');
});
test('3D projection and vectors use true 3D data independently', () => {
  assert.deepEqual(M.project3([1,2,3],{azimuth:0,elevation:0}),[1,3]);
  assert.deepEqual(M.vector.cross([1,0,0],[0,1,0]),[0,0,1]);
  assert.equal(M.vector.dot([1,2,3],[4,5,6]),32);assert.equal(M.vector.norm([3,4]),5);
});
test('SVG escapes content and uses instance-local clipping IDs', () => {
  const p=M.createPlot({title:'<unsafe>'}).axes().label([1,1],'<b>');
  assert.ok(p.svg().includes('&lt;unsafe&gt;'));assert.ok(p.svg().includes('&lt;b&gt;'));
  assert.notEqual(p.svg().match(/id="(mv-\d+)-title/)[1],M.createPlot().svg().match(/id="(mv-\d+)-title/)[1]);
  assert.ok(p.svg().includes('>x</text>'));assert.ok(p.svg().includes('>y</text>'));assert.ok(p.svg().includes('>O</text>'));
});
test('essential label omission remains observable through SVG evidence', () => {
  const p=M.createPlot({width:160,height:160,padding:10});
  p.label([0,0],'占位',{fixed:true,id:'occupied'});
  p.label([0,0],'必要',{fixed:true,id:'target',importance:'essential'});
  const item=p.labelEvidence.find(x=>x.id==='target');
  assert.equal(item.status,'omitted');assert.equal(item.importance,'essential');
  assert.match(p.svg(),/data-mathviz-label-evidence/);
  const twice=p.svg();p.svg();
  assert.equal(p.labelEvidence.length,2,'repeated svg() must not append evidence');
  assert.equal((twice.match(/data-mathviz-label-evidence/g)||[]).length,1);
});
test('label ids are unique, importance is validated, neither leaks into SVG attributes', () => {
  const p=M.createPlot();p.label([0,0],'一',{id:'a'});assert.throws(()=>p.label([1,1],'二',{id:'a'}),/duplicate label id/);
  assert.throws(()=>M.createPlot().label([0,0],'x',{importance:'zz'}),/importance/);
  const q=M.createPlot();q.label([1,1],'正文',{id:'obj.a',importance:'essential'});
  assert.ok(!/<text[^>]*\sid=/.test(q.svg())&&!/<text[^>]*importance=/.test(q.svg()));
  const old=M.createPlot();old.label([1,1],'旧式');
  assert.equal(old.labelEvidence[0].id,null);assert.equal(old.labelEvidence[0].importance,'supporting');assert.equal(old.labelEvidence[0].status,'rendered');
});
test('axis ticks are decorative evidence while O/x/y keep fixed placement semantics', () => {
  const p=M.createPlot({xMin:-2,xMax:2,yMin:-2,yMax:2});p.axes({step:1});
  const ticks=p.labelEvidence.filter(e=>e.importance==='decorative');
  assert.ok(ticks.length>=4);for(const t of ticks)assert.equal(t.id,null);
  const origin=p.labelEvidence.find(e=>e.text==='O');
  assert.equal(origin.status,'rendered');assert.equal(origin.importance,'supporting');
  const crowded=M.createPlot({width:220,height:180,xMin:-5,xMax:5,yMin:-5,yMax:5});
  crowded.label([0,0],'reserved',{fontSize:20,dx:-23,dy:28,fixed:true});crowded.axes({step:.5});
  const omittedTicks=crowded.labelEvidence.filter(e=>e.importance==='decorative'&&e.status==='omitted');
  assert.ok(omittedTicks.length>0,'crowded plot should omit ordinary ticks, which is acceptable');
  for(const e of crowded.labelEvidence)if(e.status==='omitted')assert.ok(e.reason.length>0,'omitted labels must carry a readable reason');
});
