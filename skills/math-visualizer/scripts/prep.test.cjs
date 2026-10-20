'use strict';
/* 备课卡 prep：结构校验、页面呈现、打印学案不泄露答案、旧配置审校包不变。 */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const M=require('../assets/modules.js'),{build,load}=require('./build_lesson.cjs');
const base=()=>load(path.join(__dirname,'../assets/configs/gaokao-2025-q7.json')).config;
const prep={position:'例题',examPoints:'点到直线距离',minutes:12,breakthrough:'距离为 1 的点组成两条平行线',
  thinking:[{ask:'所求的点满足哪两个条件？',expect:'在圆上；到直线距离为 1'}],
  errors:[{error:'端点取闭区间',cause:'把相切当两个交点',remedy:'第 5 步分别选 r=1、r=3'}],
  method:'d−k<r<d+k',variants:[{problem:'恰有 3 个点时求 r',change:'两个改为三个',answer:'r=3'}],board:'分段表'};
function player(config){const nodes=new Map();class El{constructor(){this.listeners={};this.children=[];this.attrs={};this.innerHTML='';}addEventListener(k,f){this.listeners[k]=f;}append(x){this.children.push(x);}replaceChildren(){this.children=[];}setAttribute(k,v){this.attrs[k]=String(v);}removeAttribute(k){delete this.attrs[k];}getAttribute(k){return this.attrs[k];}}
  const ids=new Set(['lesson-data','title','problem','source','teacher','teaching-summary','purpose','objective','scope','edition','eyebrow','notes-toggle','notes','steps','visual','visual-panel','stage','step-title','body','formula','question','notice','controls','counter','previous','next','parameter-label','parameter','range-min','range-max','stops','value','reset','restart','task-text','prep','prep-toggle','print-prep','print-handout','print-handout-btn','zoom-in','zoom-out','fullscreen']);
  const get=id=>{if(!ids.has(id))return null;if(!nodes.has(id))nodes.set(id,new El());return nodes.get(id);};
  get('lesson-data').textContent=JSON.stringify(config);get('prep').hidden=true;
  const MV=require('../assets/mathviz.js');
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/player.js'),'utf8'),{MathModules:M,MathViz:MV,document:{getElementById:get,createElement:()=>new El(),addEventListener(){}}});
  return get;}
test('prep 通过校验；未知字段、缺题眼、非法用时被拒绝',()=>{
  const c=base();c.prep=prep;assert.doesNotThrow(()=>M.validate(c));
  for(const bad of [{...prep,extra:'x'},{...prep,breakthrough:''},{...prep,minutes:0},{...prep,thinking:[{ask:'问'}]}]){const d=base();d.prep=bad;assert.throws(()=>M.validate(d));}
  const d=base();delete d.prep;assert.doesNotThrow(()=>M.validate(d));
});
test('页面呈现题目条与备课卡；打印学案只含问题，不含答案',()=>{
  const c=base();c.prep=prep;const get=player(c);
  assert.equal(get('task-text').textContent,c.problem);
  assert.match(get('prep').innerHTML,/距离为 1 的点组成两条平行线/);assert.match(get('print-prep').innerHTML,/预期：在圆上/);
  const sheet=get('print-handout').innerHTML;
  for(const s of c.scenes[0].steps)assert.ok(sheet.includes(s.title.replace(/&/g,'&amp;')),s.title);
  assert.ok(!sheet.includes('选 B')&&!sheet.includes('1&lt;r&lt;3'),'学案不得包含最终答案');
  get('prep-toggle').listeners.click();assert.equal(get('prep').hidden,false);
});
test('有 prep 的配置构建出备课卡按钮；没有 prep 的不出现',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prep-'));try{
    const c=base();c.prep=prep;const src=path.join(dir,'with.json');fs.writeFileSync(src,JSON.stringify(c));
    build(src,path.join(dir,'with.html'),{review:'preview'});assert.match(fs.readFileSync(path.join(dir,'with.html'),'utf8'),/id="prep-toggle"/);
    const plain=path.join(dir,'plain.json');fs.writeFileSync(plain,JSON.stringify(base()));
    build(plain,path.join(dir,'plain.html'),{review:'preview'});const h=fs.readFileSync(path.join(dir,'plain.html'),'utf8');
    assert.ok(!h.includes('id="prep-toggle"'));assert.match(h,/id="task-text"/);assert.match(h,/id="print-handout"/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
