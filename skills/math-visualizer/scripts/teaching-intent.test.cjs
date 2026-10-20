'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const M=require('../assets/modules.js'),{build,load}=require('./build_lesson.cjs');
const source=n=>path.join(__dirname,'../assets/configs',n+'.json');
function player(config){const nodes=new Map();class Element{constructor(){this.listeners={};this.children=[];this.attrs={};}addEventListener(k,f){this.listeners[k]=f;}append(x){this.children.push(x);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=String(v);}removeAttribute(k){delete this.attrs[k];}}
 const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};get('lesson-data').textContent=JSON.stringify(config);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/player.js'),'utf8'),{MathModules:M,document:{getElementById:get,createElement:()=>new Element()}});return {get,click:id=>get(id).listeners.click(),value:v=>{get('parameter').value=v;get('parameter').listeners.input({target:get('parameter')});}};}
test('same question and referenced model produce distinct teaching flows without duplicated runtime',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'intent-'));try{const a=load(source('circle-concept')),b=load(source('circle-worked-example'));assert.equal(a.config.problem,b.config.problem);assert.deepEqual([...new Set(a.inputs.slice(1))],b.inputs.slice(1));assert.deepEqual(a.config.scenes[0].model,b.config.scenes[0].model);
 const ar=build(source('circle-concept'),path.join(dir,'a.html'),{review:'preview'}),br=build(source('circle-worked-example'),path.join(dir,'b.html'),{review:'preview'});assert.deepEqual(ar.assets,br.assets);assert.deepEqual([...new Set(ar.models)],br.models);assert.notEqual(ar.configSHA256,br.configSHA256);assert.notEqual(ar.purpose,br.purpose);
 const ac=a.config.scenes.flatMap(s=>s.steps),bc=b.config.scenes[0];assert.deepEqual(ac.map(s=>s.interactive),[false,true,true,true,false]);assert.deepEqual(bc.steps.map(s=>s.interactive),[false,false,false,true,false]);assert.ok(!ac.at(-1).formula.includes('(1,3)'));assert.ok(bc.steps.at(-1).formula.includes('(1,3)'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('point foot and triangle obey geometric invariants at all observation stops',()=>{
 const scene=load(source('circle-concept')).config.scenes[0];
 for(const r of [.25,.5,1,1.01,2,3,4]){const d=M.derive(scene,r);for(const l of d.lines){const [cx,cy]=[scene.model.cx,scene.model.cy],foot=l.foot;for(const q of l.points){const dot=(q[0]-foot[0])*(cx-foot[0])+(q[1]-foot[1])*(cy-foot[1]);assert.ok(Math.abs(dot)<1e-12);assert.ok(Math.abs(Math.hypot(q[0]-cx,q[1]-cy)-r)<1e-12);assert.ok(Math.abs(Math.hypot(q[0]-foot[0],q[1]-foot[1])**2+l.distance**2-r*r)<1e-12);}}
 const out=M.render(scene,r,2);assert.equal(out.svg.includes('#7e3daf'),r>1);assert.ok(out.body.includes(String(d.nearCount)));}
});
test('remove visual completely; backtracking restores geometry and the same observation parameter',()=>{
 const config=load(source('circle-concept')).config,p=player(config);p.click('next');p.value(2.5);p.click('next');p.click('next');p.value(3);p.click('next');assert.equal(p.get('visual-panel').hidden,true);assert.equal(p.get('visual').innerHTML,'');assert.equal(p.get('stage').className,'stage without-visual');assert.equal(p.get('controls').hidden,true);
 p.click('previous');assert.equal(p.get('visual-panel').hidden,false);assert.ok(p.get('visual').innerHTML.includes('<svg'));assert.equal(p.get('parameter').value,3);p.click('restart');assert.equal(p.get('counter').textContent,'1 / 5');assert.equal(p.get('parameter').value,2);
});
test('worked-example backtracking never restores stale radius prose',()=>{
 const p=player(load(source('circle-worked-example')).config);p.click('next');p.click('next');p.click('next');p.value(4);p.click('previous');p.click('previous');p.click('previous');assert.ok(p.get('body').textContent.includes('r=4'));assert.equal(p.get('parameter').value,4);assert.equal(p.get('counter').textContent,'1 / 5');
});
test('model reference rejects ambiguous inputs and protects shared data from output/sidecar overwrite',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'intent-ref-'));try{const model=path.join(dir,'model.json'),input=path.join(dir,'lesson.json'),c=load(source('circle-concept')).config,raw=JSON.stringify(c.scenes[0].model);fs.writeFileSync(model,raw);delete c.scenes[0].model;c.scenes[0].modelRef='model.json';fs.writeFileSync(input,JSON.stringify(c));assert.throws(()=>build(input,model,{review:'preview'}));assert.equal(fs.readFileSync(model,'utf8'),raw);
 const side=path.join(dir,'page.html.build.json');fs.writeFileSync(side,raw);c.scenes[0].modelRef='page.html.build.json';fs.writeFileSync(input,JSON.stringify(c));assert.throws(()=>build(input,path.join(dir,'page.html'),{review:'preview'}));assert.equal(fs.readFileSync(side,'utf8'),raw);
 c.scenes[0].model={};fs.writeFileSync(input,JSON.stringify(c));assert.throws(()=>load(input));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
 const c=load(source('circle-concept')).config;c.scenes.at(-1).steps.at(-1).interactive=true;assert.throws(()=>M.validate(c));
});

test('teacher objective stays out of public eyebrow; step labels and jumps are supported',()=>{
 const c=load(source('circle-worked-example')).config;c.teaching.objective='SECRET ANSWER';c.scenes[0].steps[0].tab='观察';
 const p=player(c);assert.equal(p.get('eyebrow').textContent,'原题讲解');assert.equal(p.get('objective').textContent,'SECRET ANSWER');
 assert.equal(p.get('steps').children[0].children[0].textContent,'观察');p.get('steps').children[2].listeners.click();assert.equal(p.get('counter').textContent,'3 / 5');
});
test('equation supports balanced sup/sub only and escapes literal entities',()=>{
 assert.equal(M.formatEquation('x<sup>2</sup> + I<sub>1</sub>'),'x<sup>2</sup> + I<sub>1</sub>');
 assert.equal(M.formatEquation('x<y'),'x&lt;y');
 assert.equal(M.formatEquation('x < 0; r > 1'),'x &lt; 0; r &gt; 1');
 assert.equal(M.formatEquation('&lt;img&gt;'),'&amp;lt;img&amp;gt;');
 for(const value of ['<img src=x>','<sup onclick="x">2</sup>','<span>k</span>','<sup>2</sub>','<sup>2'])assert.throws(()=>M.formatEquation(value));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'equation-'));try{const c=load(source('circle-worked-example')).config;c.equation='x<sup>2</sup>';const input=path.join(dir,'in.json'),out=path.join(dir,'out.html');fs.writeFileSync(input,JSON.stringify(c));build(input,out,{review:'preview'});assert.ok(fs.readFileSync(out,'utf8').includes('<div class="equation">x<sup>2</sup></div>'));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
