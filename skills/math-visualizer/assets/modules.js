/* Trusted, reusable mathematical models. Lesson JSON never contains executable code. */
(function(root,factory){
  const api=factory(typeof module==='object'?require('./mathviz.js'):root.MathViz);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MathModules=api;
})(globalThis,function(M){
  'use strict';
  const version='2.6.0', blue='#315eca', orange='#b65320';
  const assert=(condition,message)=>{if(!condition)throw new Error(message);};
  const number=(x,name)=>assert(Number.isFinite(x),`${name}: finite number required`);
  const text=(x,name)=>assert(typeof x==='string'&&x.trim().length>0,`${name}: text required`);
  function keys(obj,allowed,name){assert(obj&&typeof obj==='object'&&!Array.isArray(obj),`${name}: object required`);for(const k of Object.keys(obj))assert(allowed.includes(k),`${name}: unsupported field ${k}`);}
  /* 精确可表示的小数（如滑块网格上的 1.5、0.25）按原值显示；无限近似才加 ≈。 */
  const fmt=x=>{if(Number.isInteger(x))return String(x);const exact=Number(x.toFixed(6));return exact===x?String(x):M.approximate(x,4);};
  function formatEquation(value){
    text(value,'equation');const stack=[];
    for(const token of value.match(/<\/?[A-Za-z!][^>]*>/g)||[]){
      assert(/^<\/?(?:sup|sub)>$/.test(token),'equation: only sup/sub tags without attributes are supported');
      if(token[1]==='/')assert(stack.pop()===token.slice(2,-1),'equation: unbalanced tags');
      else stack.push(token.slice(1,-1));
    }
    assert(stack.length===0,'equation: unbalanced tags');
    return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/&lt;(\/?(?:sup|sub))&gt;/g,'<$1>');
  }
  /* 通用 render 不解释任何模块语义：哪些点是"交点"只有模块自己知道，因此诊断由模块在 draw 里
     回报，render 只透传 notice。这里的点数口径是——视窗外的那部分交点未画出，但完整模型仍按
     全部交点计算（文字里的交点数不会跟着变小）。 */
  const outsideNotice=(p,points)=>{const hidden=points.filter(q=>!p.inside(q)).length;return hidden?`${hidden} 个交点在当前视窗外；交点数仍按完整模型计算。`:'';};
  const definitions={
    'quadratic-level':{
      version:'1.1.0',parameter:'k',fields:['k','count','critical','vertexX','vertexY'],
      layers:['curve','level','intersections'],
      objects:[],
      /* 拖动能力声明（control.type='drag' 时必填）：player 提供指针捕获/键盘等价/焦点保持，
         模块只声明拖动方向与数学映射。本模块的参数 k 就是水平线的纵坐标，画布内竖直拖动即设 k。 */
      drag:{axis:'y',fromPoint:(m,pt)=>pt.y},
      validate(m){keys(m,['a','h','v'],'model');for(const k of ['a','h','v'])number(m[k],k);assert(m.a!==0,'a must not be zero');},
      derive(m,k){const q=(k-m.v)/m.a;const xs=q<0?[]:q===0?[m.h]:[m.h-Math.sqrt(q),m.h+Math.sqrt(q)];return {k,count:xs.length,critical:m.v,vertexX:m.h,vertexY:m.v,points:xs.map(x=>[x,k])};},
      draw(p,m,d,layers){if(layers.includes('curve'))p.curve(x=>m.a*(x-m.h)**2+m.v);if(layers.includes('level'))p.curve(()=>d.k,{stroke:orange});if(layers.includes('intersections'))for(const q of d.points)p.point(q,{fill:orange});return {notice:layers.includes('intersections')?outsideNotice(p,d.points):''};}
    },
    'circle-line-distance':{
      version:'1.3.0',parameter:'r',fields:['r','count','distanceLow','distanceHigh','nearCount','farCount'],
      layers:['circle','original','loci','intersections','distances','near-locus','near-distance','near-intersections','near-triangle','sample-distance'],
      /* 可选对象标识：annotations 只允许引用这里声明的对象。minus/plus 指 derive 中规范化
         offset 的减/加侧（lines[0]/lines[1]），与"当次远近"无关，身份不随参数重排。 */
      objects:['circle.center','original','locus.minus','locus.plus'],
      objectLayer:{'circle.center':'circle','original':'original','locus.minus':'loci','locus.plus':'loci'},
      /* 返回 {point,visible}：直线的锚点取可见线段中点（法线 n·p+offset=0 与视窗矩形求交），
         对象在当前视窗不可见时 visible:false，调用方不得留下悬空标签。 */
      anchor(m,d,objectId,view){
        if(objectId==='circle.center')return{point:[m.cx,m.cy],visible:m.cx>=view.xMin&&m.cx<=view.xMax&&m.cy>=view.yMin&&m.cy<=view.yMax};
        const offset=objectId==='original'?d.c:objectId==='locus.minus'?d.lines[0].offset:d.lines[1].offset;
        const bx=-offset*d.nx,by=-offset*d.ny,dxv=-d.ny,dyv=d.nx;
        let t0=-Infinity,t1=Infinity;
        for(const [base,dir,lo,hi] of [[bx,dxv,view.xMin,view.xMax],[by,dyv,view.yMin,view.yMax]]){
          if(Math.abs(dir)<1e-12){if(base<lo||base>hi)return{point:null,visible:false};}
          else{const a=(lo-base)/dir,b=(hi-base)/dir;t0=Math.max(t0,Math.min(a,b));t1=Math.min(t1,Math.max(a,b));}
        }
        if(!(t1-t0>1e-9))return{point:null,visible:false};
        const t=(t0+t1)/2;return{point:[bx+t*dxv,by+t*dyv],visible:true};
      },
      validate(m){keys(m,['cx','cy','nx','ny','c','distance'],'model');for(const k of ['cx','cy','nx','ny','c','distance'])number(m[k],k);assert(Math.hypot(m.nx,m.ny)>0,'line normal must be nonzero');assert(m.distance>0,'distance must be positive');},
      derive(m,r){assert(r>0,'radius must be positive');const norm=Math.hypot(m.nx,m.ny),nx=m.nx/norm,ny=m.ny/norm,c=m.c/norm;
        const lines=[c-m.distance,c+m.distance].map(offset=>{const signed=nx*m.cx+ny*m.cy+offset,distance=Math.abs(signed),foot=[m.cx-signed*nx,m.cy-signed*ny];
          const tolerance=16*Number.EPSILON*Math.max(1,r,distance,Math.abs(m.cx),Math.abs(m.cy),Math.abs(offset));
          const tangent=Math.abs(r-distance)<=tolerance;
          const count=tangent?1:r<distance?0:2,t=tangent?0:Math.sqrt(Math.max(0,(r-distance)*(r+distance)));
          return {offset,distance,foot,points:(count===0?[]:count===1?[0]:[-t,t]).map(s=>[foot[0]-s*ny,foot[1]+s*nx])};});
        const ordered=lines.slice().sort((a,b)=>a.distance-b.distance);return {r,nx,ny,c,lines,points:lines.flatMap(l=>l.points),count:lines.reduce((s,l)=>s+l.points.length,0),distanceLow:ordered[0].distance,distanceHigh:ordered[1].distance,nearCount:ordered[0].points.length,farCount:ordered[1].points.length};},
      draw(p,m,d,layers){const line=(c,style)=>{const origin=p.map([0,0]),center=[(p.width/2-origin[0])/p.scale,(origin[1]-p.height/2)/p.scale],signed=d.nx*center[0]+d.ny*center[1]+c,foot=[center[0]-signed*d.nx,center[1]-signed*d.ny],span=Math.hypot(p.width,p.height)/p.scale;p.line([foot[0]-span*d.ny,foot[1]+span*d.nx],[foot[0]+span*d.ny,foot[1]-span*d.nx],style);};
        if(layers.includes('circle')){p.circle([m.cx,m.cy],d.r,{stroke:blue,fill:'none','stroke-width':3});p.point([m.cx,m.cy]);p.label([m.cx,m.cy],'C');}
        if(layers.includes('original'))line(d.c,{stroke:'#64748b','stroke-dasharray':'8 6'});
        if(layers.includes('loci'))for(const l of d.lines)line(l.offset,{stroke:orange});
        if(layers.includes('distances'))for(const l of d.lines){p.line([m.cx,m.cy],l.foot,{stroke:'#23796d','stroke-dasharray':'5 5'});p.point(l.foot,{fill:'#23796d',r:3});p.label([(m.cx+l.foot[0])/2,(m.cy+l.foot[1])/2],fmt(l.distance),{fill:'#23796d',fontSize:20});}
        if(layers.includes('intersections'))for(const q of d.points)p.point(q,{fill:orange});
        const near=d.lines.slice().sort((a,b)=>a.distance-b.distance)[0];
        if(layers.includes('near-locus'))line(near.offset,{stroke:orange});
        if(layers.includes('near-distance')){p.line([m.cx,m.cy],near.foot,{stroke:'#23796d','stroke-dasharray':'5 5'});p.point(near.foot,{fill:'#23796d'});p.label(near.foot,'H');}
        if(layers.includes('near-intersections'))for(const q of near.points)p.point(q,{fill:orange});
        if(layers.includes('near-triangle')&&near.points.length===2){const q=near.points[0];p.line([m.cx,m.cy],q,{stroke:'#7e3daf'});p.line(near.foot,q,{stroke:orange,'stroke-width':5});p.label(q,'P');}
        if(layers.includes('sample-distance')){const P=near.foot,signed=d.nx*P[0]+d.ny*P[1]+d.c,F=[P[0]-signed*d.nx,P[1]-signed*d.ny];
          if(Math.hypot(F[0]-P[0],F[1]-P[1])>1e-9){p.point(P,{fill:orange,r:5});p.label(P,'P',{fill:orange});p.line(P,F,{stroke:orange,'stroke-width':3.5});p.point(F,{fill:'#23796d',r:3});p.label([(P[0]+F[0])/2,(P[1]+F[1])/2],fmt(m.distance),{fill:orange,fontSize:20});}}
        /* intersections 优先于 near-intersections：单步同时开两层时只报完整交点集（与去特例前的行为一致）。 */
        return {notice:layers.includes('intersections')?outsideNotice(p,d.points):layers.includes('near-intersections')?outsideNotice(p,near.points):''};}
    },
    /* 抛物线 y=x² 的法线弦构型：P(t,t²) 处切线交 y 轴于 R(0,−t²)，垂直条件 PQ⊥PR
       把 Q 锁定为法线与抛物线的另一交点 s=−t−1/(2t)。一份 derive 同时服务两个场景：
       layers 前五项画 (x,y) 几何图，后三项在 (u,S) 平面画面积函数（u=|t|），
       不为两种呈现复制数学函数。滑杆范围不得跨越 0（t=0 时构型蜕化）。 */
    'parabola-normal-chord':{
      version:'1.0.0',parameter:'t',fields:['t','s','area','pq','pr','uStar','areaMin'],
      layers:['parabola','tangent','normal','intersections','triangle','area-graph','area-marker','area-minimum'],
      objects:[],
      validate(m){keys(m,[],'model');},
      derive(m,t){assert(t!==0,'t must be nonzero: at the origin the tangent passes through P itself and the normal chord degenerates');
        const s=-t-1/(2*t),P=[t,t*t],Q=[s,s*s],R=[0,-t*t];
        const pq=Math.hypot(Q[0]-P[0],Q[1]-P[1]),pr=Math.hypot(R[0]-P[0],R[1]-P[1]);
        /* 面积用闭式 (4t²+1)²/(8|t|)：与 ½|PQ||PR| 恒等，但在可整除的演示参数上避免浮点噪声 */
        const area=(4*t*t+1)**2/(8*Math.abs(t));
        return {t,s,pq,pr,area,uStar:Math.sqrt(3)/6,areaMin:4*Math.sqrt(3)/9,points:[P,Q],P,Q,R};},
      draw(p,m,d,layers){
        const span=2*(p.width+p.height)/p.scale;
        const through=(A,dir,style)=>p.line([A[0]-span*dir[0],A[1]-span*dir[1]],[A[0]+span*dir[0],A[1]+span*dir[1]],style);
        const readout=v=>{const a=fmt(v);return a.startsWith('≈')?` ${a}`:`=${a}`;};
        if(layers.includes('parabola'))p.curve(x=>x*x);
        if(layers.includes('area-graph')){const origin=p.map([0,0]),xe=(p.width/2-origin[0])/p.scale+p.width/(2*p.scale);
          p.curve(u=>(4*u*u+1)**2/(8*u),{segments:[[0.05,xe]],stroke:blue});}
        if(layers.includes('tangent')){through(d.P,[1,2*d.t],{stroke:orange});
          p.point(d.P,{fill:blue});p.label(d.P,'P',{id:'P',importance:'essential'});
          p.point(d.R,{fill:'#7e3daf'});p.label(d.R,'R',{id:'R',importance:'essential',fill:'#7e3daf'});}
        if(layers.includes('normal')){through(d.P,[-2*d.t,1],{stroke:'#23796d'});
          const L=Math.hypot(1,2*d.t),uT=[1/L,2*d.t/L],uN=[-2*d.t/L,1/L],a=0.15;
          p.polygon([[d.P[0]+a*uT[0],d.P[1]+a*uT[1]],[d.P[0]+a*(uT[0]+uN[0]),d.P[1]+a*(uT[1]+uN[1])],[d.P[0]+a*uN[0],d.P[1]+a*uN[1]]],{fill:'none',stroke:'#18233a','stroke-width':2});}
        if(layers.includes('intersections')){p.point(d.Q,{fill:orange});
          if(p.inside(d.Q))p.label(d.Q,'Q',{id:'Q',importance:'essential'});}
        if(layers.includes('triangle')){p.polygon([d.P,d.Q,d.R],{fill:'#315eca14',stroke:'#9aa7bd','stroke-width':1.5});
          p.arrow(d.P,d.Q,{stroke:orange});p.arrow(d.P,d.R,{stroke:'#23796d'});}
        if(layers.includes('area-minimum')){p.line([0,d.areaMin],[d.uStar,d.areaMin],{stroke:'#23796d','stroke-dasharray':'5 5','stroke-width':1.5});
          p.line([d.uStar,0],[d.uStar,d.areaMin],{stroke:'#23796d','stroke-dasharray':'5 5','stroke-width':1.5});
          p.point([d.uStar,d.areaMin],{fill:'#23796d',r:6});
          p.label([d.uStar,d.areaMin],'4√3/9 ≈ 0.770',{id:'areaMin',importance:'essential',fill:'#23796d'});}
        if(layers.includes('area-marker')){p.line([0,d.area],[d.t,d.area],{stroke:'#8a94a8','stroke-dasharray':'5 5','stroke-width':1.5});
          p.line([d.t,0],[d.t,d.area],{stroke:'#8a94a8','stroke-dasharray':'5 5','stroke-width':1.5});
          p.point([d.t,d.area],{fill:orange});
          p.label([d.t,d.area],`S${readout(d.area)}`,{fill:orange,fontSize:20});}
        /* 本层的"交点"只有 Q：P 是切点（tangent 层）、R 是切线与 y 轴的交点，都不属于 intersections 层。
           d.points=[P,Q] 是给别处用的另一种语义，把它当交点集会报出并不存在于本层的越界提示。 */
        return {notice:layers.includes('intersections')?outsideNotice(p,[d.Q]):''};
      }
    }
  };
  function validate(config){
    keys(config,['schemaVersion','title','problem','source','teacher','teaching','scenes','equation'],'lesson');assert(config.schemaVersion===1,'schemaVersion must be 1');
    for(const k of ['title','problem','source','teacher'])text(config[k],k);
    if(config.equation!==undefined)formatEquation(config.equation);
    if(config.teaching!==undefined){keys(config.teaching,['purpose','objective','prerequisites','scope'],'teaching');assert(['concept','worked-example','transfer'].includes(config.teaching.purpose),'unsupported teaching purpose');for(const k of ['objective','prerequisites','scope'])text(config.teaching[k],`teaching.${k}`);}
    assert(Array.isArray(config.scenes)&&config.scenes.length>0&&config.scenes.length<=12,'1..12 scenes required');
    for(const scene of config.scenes){
      keys(scene,['module','model','view','control','steps'],'scene');const def=definitions[scene.module];assert(def,`unsupported module: ${scene.module}`);def.validate(scene.model);
      keys(scene.view,['xMin','xMax','yMin','yMax','title','tick','axisX','axisY'],'view');for(const k of ['xMin','xMax','yMin','yMax','tick'])number(scene.view[k],k);
      if(scene.view.axisX!==undefined)text(scene.view.axisX,'view.axisX');
      if(scene.view.axisY!==undefined)text(scene.view.axisY,'view.axisY');
      assert(scene.view.xMin<scene.view.xMax&&scene.view.yMin<scene.view.yMax&&scene.view.tick>0,'invalid view bounds/tick');
      for(const k of ['xMin','xMax','yMin','yMax'])assert(Number.isSafeInteger(Math.ceil(scene.view[k]/scene.view.tick)),'view ticks exceed numerical precision');
      assert((scene.view.xMax-scene.view.xMin)/scene.view.tick<200&&(scene.view.yMax-scene.view.yMin)/scene.view.tick<200,'too many ticks');text(scene.view.title,'view.title');
      const c=scene.control;keys(c,['label','min','max','step','initial','stops','type'],'control');text(c.label,'control.label');
      assert(c.type===undefined||['range','drag'].includes(c.type),'control.type must be range|drag');
      for(const k of ['min','max','step','initial'])number(c[k],`control.${k}`);assert(c.min<c.max&&c.step>0&&c.step<=c.max-c.min&&c.initial>=c.min&&c.initial<=c.max,'invalid control range');
      if(scene.module==='circle-line-distance')assert(c.min>0,'radius range must be positive');
      if(scene.module==='parabola-normal-chord')assert(c.min>0||c.max<0,'t=0 (the origin) is excluded: slider range must not straddle 0');
      assert(Array.isArray(c.stops)&&c.stops.every(x=>Number.isFinite(x)&&x>=c.min&&x<=c.max),'stops must lie in control range');
      /* drag 控件：拖动方向与数学映射由模块声明，player 通用承接；step 仍必填——键盘微调与审校扫参都依赖网格。 */
      if((c.type||'range')==='drag'){
        const cap=def.drag;
        assert(cap&&['x','y'].includes(cap.axis)&&typeof cap.fromPoint==='function',`module ${scene.module} must declare drag:{axis:'x'|'y', fromPoint} for a drag control`);
        const probe={x:(scene.view.xMin+scene.view.xMax)/2,y:(scene.view.yMin+scene.view.yMax)/2};
        assert(Number.isFinite(cap.fromPoint(scene.model,probe)),'drag.fromPoint must return a finite parameter value');
      }
      assert(Array.isArray(scene.steps)&&scene.steps.length>0&&scene.steps.length<=20,'1..20 steps required');
      for(const step of scene.steps){keys(step,['title','body','formula','question','layers','interactive','showVisual','tab','annotations'],'step');for(const k of ['title','body','question'])text(step[k],`step.${k}`);assert(typeof step.formula==='string','formula must be text');assert(typeof step.interactive==='boolean','interactive must be boolean');
        if(step.tab!==undefined)text(step.tab,'step.tab');
        if(step.showVisual!==undefined)assert(typeof step.showVisual==='boolean','showVisual must be boolean');
        if(step.showVisual===false)assert(!step.interactive&&step.layers.length===0,'hidden visual must have no layers or interaction');
        assert(Array.isArray(step.layers)&&step.layers.every(l=>def.layers.includes(l)),'unsupported layer');
        for(const s of [step.body,step.formula,step.question])for(const match of s.matchAll(/\{\{([^{}]+)\}\}/g))assert(def.fields.includes(match[1]),`unsupported binding: ${match[1]}`);
        if(step.annotations!==undefined){
          assert(Array.isArray(step.annotations),'annotations must be an array');
          assert(step.showVisual!==false,'annotations require a visible visual: showVisual:false forbids annotations');
          const declared=def.objects||[];
          for(const objectId of declared)assert(typeof def.anchor==='function',`module ${scene.module} declares object '${objectId}' but has no anchor()`);
          for(const objectId of declared)assert((def.objectLayer||{})[objectId],`module ${scene.module} declares object '${objectId}' but maps it to no layer`);
          const seen=new Set();
          for(const a of step.annotations){
            keys(a,['objectId','text','importance'],'annotation');text(a.objectId,'annotation.objectId');text(a.text,'annotation.text');
            assert(declared.includes(a.objectId),`module ${scene.module} declares no object '${a.objectId}' (declared: ${declared.join(', ')||'none'})`);
            if(a.importance!==undefined)assert(['essential','supporting','decorative'].includes(a.importance),'annotation.importance must be essential|supporting|decorative');
            assert(!seen.has(a.objectId),`duplicate annotation for '${a.objectId}' in one step`);seen.add(a.objectId);
            const need=(def.objectLayer||{})[a.objectId];
            if(need)assert(step.layers.includes(need),`annotated object '${a.objectId}' requires layer '${need}' in this step`);
          }
        }
      }
      for(const v of [c.min,c.max,c.initial,...c.stops])derive(scene,v);
    }
    return config;
  }
  function derive(scene,value){const result=definitions[scene.module].derive(scene.model,value);function check(x){if(typeof x==='number')assert(Number.isFinite(x),'non-finite model output');else if(x&&typeof x==='object')Object.values(x).forEach(check);}check(result);return result;}
  function bind(s,data){return s.replace(/\{\{([^{}]+)\}\}/g,(_,key)=>fmt(data[key])).replace(/=≈ /g,'≈ ');}
  function render(scene,value,index){const def=definitions[scene.module],d=derive(scene,value),step=scene.steps[index];assert(step,'invalid step');
    if(step.showVisual===false)return {svg:'',body:bind(step.body,d),formula:bind(step.formula,d),question:bind(step.question,d),collisions:[],labelEvidence:[],notice:'',data:d};
    const p=M.createPlot({...scene.view,width:680,height:450});
    /* draw 只负责把模型画到画布上，并回报只有自己才知道的诊断（如"交点在视窗外"）；render 不认识图层名或模块语义。 */
    const drawn=def.draw(p,scene.model,d,step.layers)||{};
    /* 可选对象标识在刻度之前放置，保证必要身份优先于普通刻度；几何上不可见的对象不留悬空标签，记为诊断。 */
    const skipped=[];
    if(step.annotations)for(const a of step.annotations){
      const anchor=def.anchor(scene.model,d,a.objectId,scene.view);
      if(!anchor||!anchor.visible){skipped.push({id:a.objectId,text:a.text,importance:a.importance||'supporting',anchor:null,status:'omitted',reason:'annotated object not visible in current view'});continue;}
      p.label(anchor.point,a.text,{id:a.objectId,importance:a.importance||'supporting'});
    }
    p.axes({step:scene.view.tick,xLabel:scene.view.axisX,yLabel:scene.view.axisY});
    return {svg:p.svg(),body:bind(step.body,d),formula:bind(step.formula,d),question:bind(step.question,d),collisions:p.collisions,labelEvidence:[...skipped,...p.labelEvidence],notice:typeof drawn.notice==='string'?drawn.notice:'',data:d};}
  return {version,definitions,validate,derive,render,formatEquation};
});
