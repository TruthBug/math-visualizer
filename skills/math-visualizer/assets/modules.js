/* Trusted, reusable mathematical models. Lesson JSON never contains executable code. */
(function(root,factory){
  const api=factory(typeof module==='object'?require('./mathviz.js'):root.MathViz);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.MathModules=api;
})(globalThis,function(M){
  'use strict';
  const version='2.7.0', blue='#315eca', orange='#b65320';
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
  /* 受限数学表达式（function-graph 用）：JSON 里可以写 x^3-3*x+a 这类式子，但仍不含可执行代码。
     自写递归下降解析为闭包树，不用 eval/new Function；只认白名单的数字、变量、常数、运算符与函数。
     报错信息写成可以照改的中文，便于生成配置的模型自行修正。 */
  const EXPR_FUNCS={sqrt:[1,Math.sqrt],cbrt:[1,Math.cbrt],abs:[1,Math.abs],exp:[1,Math.exp],ln:[1,Math.log],lg:[1,Math.log10],
    sin:[1,Math.sin],cos:[1,Math.cos],tan:[1,Math.tan],log:[2,(b,x)=>Math.log(x)/Math.log(b)]};
  const EXPR_CONSTS={pi:Math.PI,e:Math.E};
  function compileExpr(source,vars,name){
    if(typeof source==='number'){number(source,name);return Object.assign(()=>source,{uses:new Set()});}
    assert(typeof source==='string',`${name}: 需要数字或表达式字符串`);
    const src=source.replace(/−/g,'-').replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/π/g,'pi').replace(/²/g,'^2').replace(/³/g,'^3');
    assert(src.trim().length>0&&src.length<=200,`${name}: 表达式不能为空，且不超过 200 个字符`);
    const fail=m=>{throw new Error(`${name}: ${m}（表达式：${source}）`);};
    const tokens=[],re=/\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z]+)|([-+*/^(),]))/y;
    for(re.lastIndex=0;re.lastIndex<src.length;){
      if(/^\s*$/.test(src.slice(re.lastIndex)))break;
      const at=re.lastIndex,t=re.exec(src);
      if(!t){const bad=src.slice(at).trim()[0];fail(`无法识别的字符 '${bad}'；只能用数字、${vars.join('、')}、+ - * / ^、括号和白名单函数`);}
      tokens.push(t[1]!==undefined?{type:'num',v:t[1]}:t[2]!==undefined?{type:'name',v:t[2]}:{type:'op',v:t[3]});
    }
    let pos=0,depth=0;const uses=new Set(),peek=()=>tokens[pos],next=()=>tokens[pos++];
    const expect=v=>{const t=next();if(!t||t.v!==v)fail(`缺少 '${v}'`);};
    function sum(){if(++depth>40)fail('括号嵌套过深');let f=product();
      while(peek()&&(peek().v==='+'||peek().v==='-')){const op=next().v,a=f,b=product();f=op==='+'?s=>a(s)+b(s):s=>a(s)-b(s);}
      depth--;return f;}
    function product(){let f=unary();
      for(;;){const t=peek();
        if(t&&(t.v==='*'||t.v==='/')){next();const a=f,b=unary();f=t.v==='*'?s=>a(s)*b(s):s=>a(s)/b(s);}
        else if(t&&(t.type!=='op'||t.v==='('))fail(`'${t.v}' 前缺少乘号：乘法必须写 *，例如 2x 写成 2*x，x(x+1) 写成 x*(x+1)`);
        else return f;}}
    /* 一元负号比乘方松：-x^2 = -(x^2)；乘方右结合：2^3^2 = 2^(3^2)。 */
    function unary(){const t=peek();if(t&&(t.v==='-'||t.v==='+')){next();const a=unary();return t.v==='-'?s=>-a(s):a;}return power();}
    function power(){const base=primary();if(peek()&&peek().v==='^'){next();const ex=unary();return s=>Math.pow(base(s),ex(s));}return base;}
    function primary(){const t=next();if(!t)fail('表达式不完整');
      if(t.type==='num'){const v=Number(t.v);return ()=>v;}
      if(t.type==='name'){
        if(Object.hasOwn(EXPR_FUNCS,t.v)){const [arity,fn]=EXPR_FUNCS[t.v];
          if(!peek()||peek().v!=='(')fail(`函数 ${t.v} 后面要接括号，例如 ${t.v}(x)`);next();
          const args=[sum()];while(peek()&&peek().v===','){next();args.push(sum());}expect(')');
          if(args.length!==arity)fail(`${t.v} 需要 ${arity} 个参数${t.v==='log'?'：log(底数, 真数)，自然对数用 ln，常用对数用 lg':''}`);
          const [a,b]=args;return arity===1?s=>fn(a(s)):s=>fn(a(s),b(s));}
        if(vars.includes(t.v)){uses.add(t.v);const key=t.v;return s=>s[key];}
        if(Object.hasOwn(EXPR_CONSTS,t.v)){const v=EXPR_CONSTS[t.v];return ()=>v;}
        fail(`未知名称 '${t.v}'。可用变量：${vars.join('、')||'无'}；常数：pi、e；函数：${Object.keys(EXPR_FUNCS).join('、')}。相邻字母相乘要写 *，如 a*x`);}
      if(t.v==='('){const f=sum();expect(')');return f;}
      fail(`'${t.v}' 出现的位置不对`);}
    const f=sum();if(pos<tokens.length)fail(`多余的 '${tokens[pos].v}'`);
    return Object.assign(f,{uses});
  }
  /* function-graph：模型声明对象列表，步骤的 layers 直接写对象 id。图层、动态字段、拖动能力都由
     模型推出（schema），因此一份模块覆盖含参函数、分段函数、切线、交点计数等常见函数题。 */
  const TONES={main:blue,accent:orange,relation:'#23796d',aux:'#7e3daf',muted:'#64748b'};
  const FG_KEYS={curve:['expr','domain','label','labelAt','tone','dash'],piecewise:['pieces','label','labelAt','tone','dash'],
    hline:['y','label','tone','dash'],vline:['x','label','tone','dash'],point:['on','x','label','tone','optional'],tangent:['of','at','label','tone','dash','optional'],
    intersections:['of','tone'],keypoint:['on','x','y','kind','label','tone','open','optional']};
  const FG_TONE={curve:'main',piecewise:'main',hline:'accent',vline:'muted',point:'accent',tangent:'relation',intersections:'accent',keypoint:'relation'};
  const fgCache=new WeakMap();
  /* 数值求导与求根的结果去掉浮点尾巴：只在 1e-9 相对误差内才吸附到 6 位小数，不把真实无理数改成有限小数。 */
  const tidy=v=>{const r=Number(v.toFixed(6));return Math.abs(v-r)<=1e-9*Math.max(1,Math.abs(v))?r:v;};
  const close=(u,v)=>Math.abs(u-v)<=1e-6*Math.max(1,Math.abs(v));
  function fgCompile(m){
    keys(m,['param','objects','checks'],'model');
    const P=m.param;
    assert(typeof P==='string'&&/^[A-Za-z]{1,3}$/.test(P)&&P!=='x'&&!Object.hasOwn(EXPR_FUNCS,P)&&!Object.hasOwn(EXPR_CONSTS,P),
      'model.param: 参数名用 1–3 个英文字母，且不能是 x、e、pi 或函数名');
    assert(Array.isArray(m.objects)&&m.objects.length>0&&m.objects.length<=24,'model.objects: 需要 1–24 个对象');
    const byId=new Map();
    for(const o of m.objects){
      assert(o&&typeof o==='object'&&Object.hasOwn(FG_KEYS,o.type),`model.objects[].type 只能是 ${Object.keys(FG_KEYS).join('、')}`);
      assert(typeof o.id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(o.id),`对象 id '${o.id}'：用英文字母开头，只含字母、数字、_ 或 -`);
      assert(!byId.has(o.id)&&o.id!==P,`对象 id '${o.id}' 重复或与参数名相同`);
      keys(o,['id','type',...FG_KEYS[o.type]],`对象 ${o.id}`);
      if(o.label!==undefined)text(o.label,`对象 ${o.id}.label`);
      if(o.labelAt!==undefined)number(o.labelAt,`对象 ${o.id}.labelAt`);
      if(o.tone!==undefined)assert(Object.hasOwn(TONES,o.tone),`对象 ${o.id}.tone 只能是 ${Object.keys(TONES).join('、')}`);
      for(const k of ['dash','open','optional'])if(o[k]!==undefined)assert(typeof o[k]==='boolean',`对象 ${o.id}.${k} 必须是 true/false`);
      byId.set(o.id,o);
    }
    const C={param:P,objects:[],byId:new Map()},xa=['x',P],pa=[P];
    const ref=(o,k,types)=>{const t=byId.get(o[k]);assert(t&&types.includes(t.type),`对象 ${o.id}.${k} 要引用一个 ${types.join('/')} 对象的 id（现在是 '${o[k]}'）`);return t.id;};
    const interval=(lo,hi,name)=>{number(lo,`${name} 左端`);number(hi,`${name} 右端`);assert(lo<hi,`${name}：左端必须小于右端`);};
    for(const o of m.objects){
      const c={o,id:o.id,type:o.type,color:TONES[o.tone||FG_TONE[o.type]]},noX=(v,k)=>{const f=compileExpr(v,pa,`对象 ${o.id}.${k}`);return f;};
      if(o.type==='curve'){
        c.f=compileExpr(o.expr,xa,`对象 ${o.id}.expr`);
        assert(Array.isArray(o.domain)&&o.domain.length>0&&o.domain.length<=8,`对象 ${o.id}.domain：写 1–8 个区间，如 [[-3,3]]；有渐近线时拆开，如 [[-4,-0.01],[0.01,4]]`);
        o.domain.forEach((s,i)=>{assert(Array.isArray(s)&&s.length===2,`对象 ${o.id}.domain[${i}] 要写成 [左端, 右端]`);interval(s[0],s[1],`对象 ${o.id}.domain[${i}]`);if(i)assert(s[0]>=o.domain[i-1][1],`对象 ${o.id}.domain 的区间要从左到右排列且不重叠`);});
        c.segments=o.domain.map(s=>s.slice());
        c.at=(x,a)=>c.segments.some(([lo,hi])=>x>=lo&&x<=hi)?c.f({x,[P]:a}):NaN;
      }else if(o.type==='piecewise'){
        assert(Array.isArray(o.pieces)&&o.pieces.length>0&&o.pieces.length<=8,`对象 ${o.id}.pieces：写 1–8 段`);
        c.pieces=o.pieces.map((q,i)=>{const name=`对象 ${o.id}.pieces[${i}]`;keys(q,['expr','from','to','left','right'],name);interval(q.from,q.to,name);
          for(const k of ['left','right'])assert(q[k]===undefined||['closed','open','none'].includes(q[k]),`${name}.${k} 只能是 closed（实心）、open（空心）或 none（不画端点）`);
          if(i){const prev=o.pieces[i-1];assert(q.from>=prev.to,`对象 ${o.id}.pieces 要从左到右排列且不重叠`);
            assert(!(q.from===prev.to&&q.left==='closed'&&prev.right==='closed'),`${name}：分界点 x=${q.from} 两侧不能都取实心，函数在一点只能有一个值`);}
          return {f:compileExpr(q.expr,xa,`${name}.expr`),from:q.from,to:q.to,left:q.left||'none',right:q.right||'none'};});
        c.segments=c.pieces.map(q=>[q.from,q.to]);
        c.at=(x,a)=>{for(const q of c.pieces)if((x>q.from||(x===q.from&&q.left!=='open'))&&(x<q.to||(x===q.to&&q.right!=='open')))return q.f({x,[P]:a});return NaN;};
      }else if(o.type==='hline'){c.y=noX(o.y,'y');c.at=(x,a)=>c.y({[P]:a});}
      else if(o.type==='vline')c.x=noX(o.x,'x');
      else if(o.type==='point'){c.on=ref(o,'on',['curve','piecewise']);c.x=noX(o.x,'x');}
      else if(o.type==='tangent'){c.on=ref(o,'of',['curve','piecewise']);c.x=noX(o.at,'at');}
      else if(o.type==='keypoint'){c.on=ref(o,'on',['curve','piecewise']);c.x=noX(o.x,'x');c.y=noX(o.y,'y');
        assert(o.kind===undefined||['max','min','zero','point'].includes(o.kind),`对象 ${o.id}.kind 只能是 max（极大值）、min（极小值）、zero（零点）或 point`);c.kind=o.kind||'point';}
      else if(o.type==='intersections'){
        assert(Array.isArray(o.of)&&o.of.length===2&&o.of[0]!==o.of[1],`对象 ${o.id}.of：写两个不同对象的 id，如 ["f","level"]`);
        const pair=o.of.map((id,i)=>ref({id:o.id,v:id},'v',['curve','piecewise','hline','vline']));
        const types=pair.map(id=>byId.get(id).type);
        assert(types.some(t=>t==='curve'||t==='piecewise'),`对象 ${o.id}.of：至少一个是 curve 或 piecewise（交点只在它们的定义区间内搜索）`);
        assert(!types.includes('vline')||types.includes('vline')&&types.filter(t=>t==='vline').length===1,`对象 ${o.id}.of：不能是两条竖线`);
        c.of=pair;
      }
      C.objects.push(c);C.byId.set(c.id,c);
    }
    /* optional 对象在部分参数下不存在（如只在 a>0 时才有的最高点）：此时不画，字段也不进正文可绑定列表，
       只允许它自己的标签引用，避免正文出现悬空数值。 */
    const fields=[P];
    for(const c of C.objects){const own=[];
      if(c.type==='point'||c.type==='keypoint')own.push(`${c.id}.x`,`${c.id}.y`);
      if(c.type==='tangent')own.push(`${c.id}.slope`,`${c.id}.x`,`${c.id}.y`);
      if(c.type==='intersections')own.push(`${c.id}.count`);
      c.optional=c.o.optional===true;c.fields=own;if(!c.optional)fields.push(...own);
    }
    for(const c of C.objects)if(c.o.label)for(const match of c.o.label.matchAll(/\{\{([^{}]+)\}\}/g))assert(fields.includes(match[1])||c.fields.includes(match[1]),`对象 ${c.id}.label 引用了不存在的字段 {{${match[1]}}}；可用：${fields.join('、')}`);
    /* 拖动：y=参数 的水平线竖直拖；x=参数 的竖线或动点水平拖。拖动点即参数值，不做反解。 */
    const bare=v=>typeof v==='string'&&v.trim()===P;
    const hDrag=m.objects.find(o=>o.type==='hline'&&bare(o.y)),xDrag=m.objects.find(o=>(o.type==='vline'||o.type==='point')&&bare(o.x));
    C.schema={parameter:P,fields,layers:C.objects.map(c=>c.id),objects:[],objectLayer:{},
      drag:hDrag?{axis:'y',fromPoint:(model,pt)=>pt.y}:xDrag?{axis:'x',fromPoint:(model,pt)=>pt.x}:undefined};
    return C;
  }
  /* 缓存以模型内容为准：同一对象被原地修改后重新编译，不沿用旧闭包。 */
  const fgGet=m=>{const key=JSON.stringify(m);let hit=fgCache.get(m);if(!hit||hit.key!==key){hit={key,C:fgCompile(m)};fgCache.set(m,hit);}return hit.C;};
  /* 交点：在两对象共同的定义区间上采样（密度随区间宽度增加），变号处二分；二分收敛后两侧差值都要趋于 0，
     只有一侧接近 0 的是跳跃，舍去。同号的局部极小处先细分找相距很近的两个根，找不到再用黄金分割判断相切（重根）。
     容差按候选点处两函数值的量级取，不按整段最大值放大。这是数值计算，精确边界仍由代数推导给出。 */
  function fgRoots(g,segments){
    const roots=[],gv=x=>g(x)[0],tolAt=x=>{const v=g(x)[1];return 1e-9*Math.max(1,Number.isFinite(v)?v:0);};
    const bisect=(a,b,ga)=>{
      for(let k=0;k<200&&b-a>1e-15*Math.max(1,Math.abs(a));k++){const mid=(a+b)/2,gm=gv(mid);if(!Number.isFinite(gm))return null;if(gm===0)return mid;if(ga*gm<0)b=mid;else{a=mid;ga=gm;}}
      return Math.abs(gv(a))<=tolAt(a)&&Math.abs(gv(b))<=tolAt(b)?(a+b)/2:null;};
    const scan=(lo,hi,n)=>{const xs=[],gs=[];for(let i=0;i<=n;i++){const x=i===n?hi:lo+(hi-lo)*i/n;xs.push(x);gs.push(gv(x));}
      const found=[];for(let i=0;i<n;i++)if(Number.isFinite(gs[i])&&Number.isFinite(gs[i+1])&&gs[i]*gs[i+1]<0){const r=bisect(xs[i],xs[i+1],gs[i]);if(r!==null)found.push(r);}
      return {xs,gs,found};};
    for(const [lo,hi] of segments){
      const {xs,gs,found}=scan(lo,hi,Math.min(20000,Math.max(2000,Math.ceil((hi-lo)*500))));roots.push(...found);
      for(let i=0;i<xs.length;i++){const g0=gs[i];
        /* 孤立的零点才算根；连续一段恰为 0（两者在一段上重合，或数值下溢成 0）不按单个交点计。 */
        if(g0===0){if((i===0||gs[i-1]!==0)&&(i===xs.length-1||gs[i+1]!==0))roots.push(xs[i]);continue;}
        if(i>0&&i<xs.length-1&&[gs[i-1],g0,gs[i+1]].every(Number.isFinite)&&gs[i-1]*g0>0&&g0*gs[i+1]>0&&Math.abs(g0)<=Math.abs(gs[i-1])&&Math.abs(g0)<=Math.abs(gs[i+1])){
          const fine=scan(xs[i-1],xs[i+1],200);if(fine.found.length){roots.push(...fine.found);continue;}
          let a=xs[i-1],b=xs[i+1];const k=(Math.sqrt(5)-1)/2;let c=b-k*(b-a),d=a+k*(b-a),fc=Math.abs(gv(c)),fd=Math.abs(gv(d));
          for(let it=0;it<120&&b-a>1e-15*Math.max(1,Math.abs(a));it++){if(fc<fd){b=d;d=c;fd=fc;c=b-k*(b-a);fc=Math.abs(gv(c));}else{a=c;c=d;fc=fd;d=a+k*(b-a);fd=Math.abs(gv(d));}}
          /* 相切按相对量判定：极小值要比相邻采样点的差值小 7 个数量级以上。曲线贴着直线渐近时，相邻点的差值同样很小，不会被误判为切点。 */
          const r=(a+b)/2;if(Math.abs(gv(r))<=1e-7*Math.max(Math.abs(gs[i-1]),Math.abs(gs[i+1])))roots.push(r);}
      }
    }
    roots.sort((u,v)=>u-v);
    return roots.filter((r,i)=>i===0||r-roots[i-1]>1e-7*Math.max(1,Math.abs(r))).map(tidy);
  }
  const fgOverlap=(A,B)=>{if(!A)return B;if(!B)return A;const out=[];for(const [a0,a1] of A)for(const [b0,b1] of B){const lo=Math.max(a0,b0),hi=Math.min(a1,b1);if(lo<hi)out.push([lo,hi]);}return out;};
  function fgDerive(m,a){
    const C=fgGet(m),P=C.param,d={[P]:a,geo:Object.create(null)},F=id=>C.byId.get(id).at,num=v=>fmt(v);
    const onCurve=(c,x)=>{const y=F(c.on)(x,a);assert(Number.isFinite(y),`对象 ${c.id}：${P}=${num(a)} 时 x=${num(x)}，${c.on} 在这里没有定义；调整滑块范围或 x 的写法`);return y;};
    for(const c of C.objects){
      if(c.optional){const x=c.x({[P]:a}),f=F(c.on),h=1e-4*Math.max(1,Math.abs(x)),probe=c.type==='tangent'?[-2,-1,0,1,2].map(k=>f(x+k*h,a)):[f(x,a)];
        if(!Number.isFinite(x)||!probe.every(Number.isFinite))continue;}
      if(c.type==='point'){const x=c.x({[P]:a}),y=onCurve(c,x);d[`${c.id}.x`]=x;d[`${c.id}.y`]=y;d.geo[c.id]=[x,y];}
      else if(c.type==='vline'){const x=c.x({[P]:a});assert(Number.isFinite(x),`对象 ${c.id}：${P}=${num(a)} 时竖线位置没有定义`);d.geo[c.id]=x;}
      else if(c.type==='hline'){const y=c.y({[P]:a});assert(Number.isFinite(y),`对象 ${c.id}：${P}=${num(a)} 时水平线位置没有定义`);d.geo[c.id]=y;}
      else if(c.type==='tangent'){const x=c.x({[P]:a}),y=onCurve(c,x),f=F(c.on),h=1e-4*Math.max(1,Math.abs(x));
        /* 五点中心差分；两侧任一点无定义就拒绝（端点处没有切线可画）。 */
        const v=[-2,-1,1,2].map(k=>f(x+k*h,a));assert(v.every(Number.isFinite),`对象 ${c.id}：x=${num(x)} 处两侧都要有定义才能画切线`);
        const slope=tidy((v[0]-8*v[1]+8*v[2]-v[3])/(12*h));d[`${c.id}.slope`]=slope;d[`${c.id}.x`]=x;d[`${c.id}.y`]=y;d.geo[c.id]={x,y,slope};}
      else if(c.type==='keypoint'){const x=c.x({[P]:a}),y=c.y({[P]:a});assert(Number.isFinite(x)&&Number.isFinite(y),`关键点 ${c.id}：坐标没有定义`);
        const fy=onCurve(c,x);
        assert(close(fy,y),`关键点 ${c.id} 不在 ${c.on} 上：${c.on}(${num(x)})=${num(fy)}，但写的是 y=${num(y)}。无理数请写精确式，如 sqrt(3)/3，不要写近似小数`);
        if(c.kind==='zero')assert(Math.abs(y)<=1e-9,`关键点 ${c.id} 标为零点，但 y=${num(y)} 不是 0`);
        if(c.kind==='max'||c.kind==='min'){const h=1e-4*Math.max(1,Math.abs(x)),sides=[F(c.on)(x-h,a),F(c.on)(x+h,a)].filter(Number.isFinite),slack=1e-9*Math.max(1,Math.abs(fy));
          assert(sides.length>0&&sides.every(s=>c.kind==='max'?s<=fy+slack:s>=fy-slack),`关键点 ${c.id} 标为${c.kind==='max'?'极大值':'极小值'}，但 x=${num(x)} 附近有${c.kind==='max'?'更大':'更小'}的函数值；请核对极值点`);}
        d[`${c.id}.x`]=x;d[`${c.id}.y`]=y;d.geo[c.id]=[x,y];}
      else if(c.type==='intersections'){const [A,B]=c.of.map(id=>C.byId.get(id));let points;
        if(A.type==='vline'||B.type==='vline'){const [v,f]=A.type==='vline'?[A,B]:[B,A],x=v.x({[P]:a}),y=f.at(x,a);points=Number.isFinite(y)?[[x,y]]:[];}
        else{const curve=[A,B].find(t=>t.type!=='hline');
          points=fgRoots(x=>{const u=A.at(x,a),w=B.at(x,a);return [u-w,Math.abs(u)+Math.abs(w)];},fgOverlap(A.segments,B.segments)).map(x=>[x,curve.at(x,a)]);}
        d[`${c.id}.count`]=points.length;d.geo[c.id]=points;}
    }
    return d;
  }
  /* 供 --inspect 使用：交点只在 domain 内搜索，曲线有渐近线时 domain 截得太窄会少算交点。
     用不受 domain 限制的原始表达式扫描 domain 两侧（各 20 倍宽度），发现域外交点就提醒。只检查 curve 与 hline。 */
  function fgInspect(m,a){
    const C=fgGet(m),P=C.param,out=[],raw=c=>c.type==='curve'?x=>c.f({x,[P]:a}):c.type==='hline'?()=>c.y({[P]:a}):null;
    for(const c of C.objects){if(c.type!=='intersections')continue;
      const [A,B]=c.of.map(id=>C.byId.get(id)),fa=raw(A),fb=raw(B);if(!fa||!fb)continue;
      const segs=fgOverlap(A.segments,B.segments);if(!segs||!segs.length)continue;
      const lo=segs[0][0],hi=segs[segs.length-1][1],w=hi-lo,g=x=>{const u=fa(x),v=fb(x);return [u-v,Math.abs(u)+Math.abs(v)];};
      const outside=[...fgRoots(g,[[lo-20*w,lo]]).filter(x=>x<lo-1e-9*Math.max(1,Math.abs(lo))),...fgRoots(g,[[hi,hi+20*w]]).filter(x=>x>hi+1e-9*Math.max(1,Math.abs(hi)))];
      if(outside.length)out.push(`交点对象 ${c.id}：${P}=${fmt(a)} 时，domain 之外还有 ${outside.length} 个交点（如 x≈${Number(outside[0].toPrecision(4))}），${c.id}.count 会少算。把曲线的 domain 放宽到包含它，或缩小滑块范围。`);
    }
    return out;
  }
  function fgValidate(m){
    fgCache.delete(m);const C=fgGet(m);
    /* checks：作者对关键参数下的结论做断言（如交点个数），构建时实际计算核对，抄错临界值会被拦下。 */
    if(m.checks===undefined)return;
    assert(Array.isArray(m.checks)&&m.checks.length<=16,'model.checks 最多 16 条');
    for(const [i,ck] of m.checks.entries()){keys(ck,['at','expect'],`checks[${i}]`);
      const at=compileExpr(ck.at,[],`checks[${i}].at`)({});number(at,`checks[${i}].at`);
      keys(ck.expect,C.schema.fields,`checks[${i}].expect`);assert(Object.keys(ck.expect).length>0,`checks[${i}].expect 不能为空`);
      const d=fgDerive(m,at);
      for(const [k,v] of Object.entries(ck.expect)){const want=compileExpr(v,[],`checks[${i}].expect.${k}`)({}),got=d[k];
        assert(k.endsWith('.count')?got===want:close(got,want),`checks[${i}]：${C.param}=${fmt(at)} 时 ${k} 实际是 ${fmt(got)}，与写的 ${fmt(want)} 不符；请重新核对这一结论`);}
    }
  }
  const definitions={
    'quadratic-level':{
      version:'1.1.0',parameter:'k',fields:['k','count','critical','vertexX','vertexY'],
      layers:['curve','level','intersections'],
      objects:[],
      /* 拖动能力声明（P1-7，control.type='drag' 时必填）：player 提供指针捕获/键盘等价/焦点保持，
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
    },
    'function-graph':{
      version:'1.0.0',parameter:'model.param',fields:[],layers:[],objects:[],
      objectTypes:Object.keys(FG_KEYS),
      schema:m=>fgGet(m).schema,
      validate:fgValidate,
      derive:fgDerive,
      inspect:fgInspect,
      draw(p,m,d,layers,view){
        const C=fgGet(m),a=d[C.param],{xMin:xLo,xMax:xHi,yMin:yLo,yMax:yHi}=view;
        const span=xHi-xLo,clip=segs=>fgOverlap(segs,[[xLo,xHi]]),style=c=>({stroke:c.color,...(c.o.dash?{'stroke-dasharray':'8 6'}:{})});
        const labels=[],hidden=[];
        const labelAt=(c,pt,importance)=>{if(!c.o.label)return;const t=bind(c.o.label,d);
          if(pt&&pt.every(Number.isFinite)&&p.inside(pt))labels.push({pt,t,id:c.id,importance,color:c.color});
          else p.labelEvidence.push({id:c.id,text:t,importance,anchor:null,status:'omitted',reason:'labelled object not visible in current view'});};
        /* 曲线标签默认放在右侧可见处：从 85% 宽度向左找第一个在视窗内的点。 */
        const curveAnchor=c=>{const xs=c.o.labelAt!==undefined?[c.o.labelAt]:Array.from({length:60},(_,i)=>xHi-span*(0.15+0.012*i));
          for(const x of xs){const y=c.at(x,a);if(Number.isFinite(y)&&p.inside([x,y]))return [x,y];}return null;};
        for(const c of C.objects){if(!layers.includes(c.id))continue;const g=d.geo[c.id];
          if(c.optional&&g===undefined){if(c.o.label)p.labelEvidence.push({id:c.id,text:c.o.label,importance:'essential',anchor:null,status:'omitted',reason:'optional object does not exist at this parameter value'});continue;}
          if(c.type==='curve'){const segs=clip(c.segments);if(segs.length)p.curve(x=>c.at(x,a),{segments:segs,...style(c)});labelAt(c,curveAnchor(c),'supporting');}
          else if(c.type==='piecewise'){
            for(const q of c.pieces){const segs=clip([[q.from,q.to]]);if(segs.length)p.curve(x=>q.f({x,[C.param]:a}),{segments:segs,...style(c)});}
            for(const q of c.pieces)for(const [x,side] of [[q.from,q.left],[q.to,q.right]]){if(side==='none')continue;const y=q.f({x,[C.param]:a});
              if(Number.isFinite(y)&&p.inside([x,y]))p.point([x,y],side==='closed'?{fill:c.color,r:5}:{fill:'#ffffff',stroke:c.color,'stroke-width':2.5,r:5});}
            labelAt(c,curveAnchor(c),'supporting');}
          else if(c.type==='hline'){p.line([xLo-span,g],[xHi+span,g],style(c));labelAt(c,[xHi-span*0.14,g],'supporting');}
          else if(c.type==='vline'){p.line([g,yLo-span],[g,yHi+span],{...style(c),'stroke-dasharray':c.o.dash===false?undefined:'8 6'});labelAt(c,[g,yHi-(yHi-yLo)*0.08],'supporting');}
          else if(c.type==='tangent'){const n=Math.hypot(1,g.slope),u=[1/n,g.slope/n],L=4*span;
            p.line([g.x-L*u[0],g.y-L*u[1]],[g.x+L*u[0],g.y+L*u[1]],style(c));p.point([g.x,g.y],{fill:c.color,r:4});
            const t=span*0.18,ahead=[g.x+t*u[0],g.y+t*u[1]],behind=[g.x-t*u[0],g.y-t*u[1]];labelAt(c,p.inside(ahead)?ahead:behind,'supporting');}
          else if(c.type==='point'){p.point(g,{fill:c.color});labelAt(c,g,'essential');}
          else if(c.type==='keypoint'){p.point(g,c.o.open?{fill:'#ffffff',stroke:c.color,'stroke-width':2.5,r:5}:{fill:c.color});labelAt(c,g,'essential');}
          else if(c.type==='intersections'){for(const q of g)if(p.inside(q))p.point(q,{fill:c.color});hidden.push(...g);}
        }
        /* 必要身份（点、关键点）先占位，曲线和直线名称后放，拥挤时省略的是次要标签。 */
        for(const l of labels.sort((u,v)=>(u.importance==='essential'?0:1)-(v.importance==='essential'?0:1)))p.label(l.pt,l.t,{id:l.id,importance:l.importance,fill:l.color});
        return {notice:layers.some(id=>C.byId.get(id).type==='intersections')?outsideNotice(p,hidden):''};
      }
    }
  };
  /* 模块能力：多数模块是静态声明；声明了 schema(model) 的模块（function-graph）由模型推出
     parameter/fields/layers/objects/drag。validate、player、审校打包都经这里取，不直接读 definitions。 */
  function capabilities(scene){const def=definitions[scene.module];assert(def,`unsupported module: ${scene.module}`);return def.schema?{...def,...def.schema(scene.model)}:def;}
  function validate(config){
    keys(config,['schemaVersion','title','problem','source','teacher','teaching','scenes','equation','prep'],'lesson');assert(config.schemaVersion===1,'schemaVersion must be 1');
    for(const k of ['title','problem','source','teacher'])text(config[k],k);
    if(config.equation!==undefined)formatEquation(config.equation);
    if(config.teaching!==undefined){keys(config.teaching,['purpose','objective','prerequisites','scope'],'teaching');assert(['concept','worked-example','transfer'].includes(config.teaching.purpose),'unsupported teaching purpose');for(const k of ['objective','prerequisites','scope'])text(config.teaching[k],`teaching.${k}`);}
    /* 备课卡（可选，只给老师看）：题眼、启发提问链、预设错误、方法提炼、变式与板书。见 references/lesson-design.md。 */
    if(config.prep!==undefined){const pr=config.prep;keys(pr,['position','examPoints','minutes','breakthrough','thinking','errors','method','variants','board'],'prep');
      text(pr.breakthrough,'prep.breakthrough');for(const k of ['position','examPoints','method','board'])if(pr[k]!==undefined)text(pr[k],`prep.${k}`);
      if(pr.minutes!==undefined)assert(Number.isFinite(pr.minutes)&&pr.minutes>0&&pr.minutes<=90,'prep.minutes must be 1..90');
      const list=(k,fields)=>{if(pr[k]===undefined)return;assert(Array.isArray(pr[k])&&pr[k].length<=8,`prep.${k} must be an array (≤8)`);for(const it of pr[k]){keys(it,fields,`prep.${k}[]`);for(const f of fields)text(it[f],`prep.${k}.${f}`);}};
      list('thinking',['ask','expect']);list('errors',['error','cause','remedy']);list('variants',['problem','change','answer']);}
    assert(Array.isArray(config.scenes)&&config.scenes.length>0&&config.scenes.length<=12,'1..12 scenes required');
    for(const scene of config.scenes){
      keys(scene,['module','model','view','control','steps'],'scene');const base=definitions[scene.module];assert(base,`unsupported module: ${scene.module}`);base.validate(scene.model);const def=capabilities(scene);
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
      /* drag 控件（P1-7）：拖动方向与数学映射由模块声明，player 通用承接；step 仍必填——键盘微调与审校扫参都依赖网格。 */
      if((c.type||'range')==='drag'){
        const cap=def.drag;
        assert(cap&&['x','y'].includes(cap.axis)&&typeof cap.fromPoint==='function',`module ${scene.module} must declare drag:{axis:'x'|'y', fromPoint} for a drag control`);
        assert(cap.explain===undefined||typeof cap.explain==='function','drag.explain must be a function when declared');
        const probe={x:(scene.view.xMin+scene.view.xMax)/2,y:(scene.view.yMin+scene.view.yMax)/2};
        assert(Number.isFinite(cap.fromPoint(scene.model,probe)),'drag.fromPoint must return a finite parameter value');
      }
      assert(Array.isArray(scene.steps)&&scene.steps.length>0&&scene.steps.length<=20,'1..20 steps required');
      for(const step of scene.steps){keys(step,['title','body','formula','question','layers','interactive','showVisual','tab','annotations'],'step');for(const k of ['title','body','question'])text(step[k],`step.${k}`);assert(typeof step.formula==='string','formula must be text');assert(typeof step.interactive==='boolean','interactive must be boolean');
        if(step.tab!==undefined)text(step.tab,'step.tab');
        if(step.showVisual!==undefined)assert(typeof step.showVisual==='boolean','showVisual must be boolean');
        if(step.showVisual===false)assert(!step.interactive&&step.layers.length===0,'hidden visual must have no layers or interaction');
        assert(Array.isArray(step.layers),'layers must be an array');for(const l of step.layers)assert(def.layers.includes(l),`unsupported layer: ${l}（可用：${def.layers.join('、')}）`);
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
      /* 由模型推出能力的模块（function-graph）由作者写表达式，无定义的参数值更难预料：构建时再按 step 网格逐点
         试算（最多 2000 点），让“滑块某处图形没有定义”在构建时就报出来；网格之间的值由播放器兜底。 */
      if(base.schema){const n=Math.round((c.max-c.min)/c.step);if(n<=2000)for(let i=1;i<n;i++)derive(scene,Number((c.min+i*c.step).toPrecision(12)));}
    }
    return config;
  }
  function derive(scene,value){const result=definitions[scene.module].derive(scene.model,value);function check(x){if(typeof x==='number')assert(Number.isFinite(x),'non-finite model output');else if(x&&typeof x==='object')Object.values(x).forEach(check);}check(result);return result;}
  function bind(s,data){return s.replace(/\{\{([^{}]+)\}\}/g,(_,key)=>fmt(data[key])).replace(/=≈ /g,'≈ ');}
  function render(scene,value,index){const def=definitions[scene.module],d=derive(scene,value),step=scene.steps[index];assert(step,'invalid step');
    if(step.showVisual===false)return {svg:'',body:bind(step.body,d),formula:bind(step.formula,d),question:bind(step.question,d),collisions:[],labelEvidence:[],notice:'',data:d};
    const p=M.createPlot({...scene.view,width:680,height:450});
    /* draw 只负责把模型画到画布上，并回报只有自己才知道的诊断（如"交点在视窗外"）；render 不认识图层名或模块语义。 */
    const drawn=def.draw(p,scene.model,d,step.layers,scene.view)||{};
    /* 可选对象标识在刻度之前放置，保证必要身份优先于普通刻度；几何上不可见的对象不留悬空标签，记为诊断。 */
    const skipped=[];
    if(step.annotations)for(const a of step.annotations){
      const anchor=def.anchor(scene.model,d,a.objectId,scene.view);
      if(!anchor||!anchor.visible){skipped.push({id:a.objectId,text:a.text,importance:a.importance||'supporting',anchor:null,status:'omitted',reason:'annotated object not visible in current view'});continue;}
      p.label(anchor.point,a.text,{id:a.objectId,importance:a.importance||'supporting'});
    }
    p.axes({step:scene.view.tick,xLabel:scene.view.axisX,yLabel:scene.view.axisY});
    return {svg:p.svg(),body:bind(step.body,d),formula:bind(step.formula,d),question:bind(step.question,d),collisions:p.collisions,labelEvidence:[...skipped,...p.labelEvidence],notice:typeof drawn.notice==='string'?drawn.notice:'',data:d};}
  return {version,definitions,capabilities,validate,derive,render,formatEquation,compileExpr};
});
