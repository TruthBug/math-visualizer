/* MathViz: dependency-free SVG geometry. All angles/data remain mathematical. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MathViz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const attrs = a => Object.entries(a || {}).map(([k,v]) => ` ${k}="${esc(v)}"`).join('');
  const vector = {
    dot(a,b) { if(a.length!==b.length) throw new Error('Vector dimensions differ'); return a.reduce((s,x,i)=>s+x*b[i],0); },
    cross(a,b) { if(a.length!==3 || b.length!==3) throw new Error('cross requires 3D vectors'); return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; },
    norm(a) { return Math.hypot(...a); }
  };
  function project3(p, {azimuth=Math.PI/4, elevation=Math.PI/6}={}) {
    if(p.length!==3 || !p.every(Number.isFinite)) throw new Error('Expected a finite 3D point');
    const [x,y,z]=p, c=Math.cos(azimuth), s=Math.sin(azimuth), ce=Math.cos(elevation), se=Math.sin(elevation);
    return [c*x-s*y, -se*(s*x+c*y)+ce*z];
  }
  function fraction(n,d=1) {
    if(!Number.isSafeInteger(n)||!Number.isSafeInteger(d)||d===0) throw new Error('fraction requires safe integer numerator and nonzero denominator');
    if(d<0) {n=-n;d=-d;}
    let a=Math.abs(n), b=d;
    while(b) [a,b]=[b,a%b];
    n/=a; d/=a;
    return {n,d,text:d===1?String(n):`${n}/${d}`,value:n/d};
  }
  function approximate(value,digits=3) {
    if(!Number.isFinite(value)) return '未定义';
    if(!Number.isInteger(digits)||digits<0||digits>15) throw new Error('digits must be 0..15');
    return `≈ ${Number(value.toFixed(digits))}`;
  }
  let counter=0;
  function createPlot({width=680,height=470,xMin=-5,xMax=5,yMin=-3,yMax=4,padding=38,title='数学图示'}={}) {
    if(![width,height,xMin,xMax,yMin,yMax,padding].every(Number.isFinite)||width<=2*padding||height<=2*padding||padding<0||xMax<=xMin||yMax<=yMin) throw new Error('Invalid plot bounds');
    const scale=Math.min((width-2*padding)/(xMax-xMin),(height-2*padding)/(yMax-yMin));
    const left=(width-scale*(xMax-xMin))/2, top=(height-scale*(yMax-yMin))/2;
    const right=width-left, bottom=height-top, id=`mv-${++counter}`;
    const items=[], labelItems=[], occupied=[], collisions=[], labelEvidence=[];
    const IMPORTANCE=new Set(['essential','supporting','decorative']);
    const map=p=>[left+(p[0]-xMin)*scale,bottom-(p[1]-yMin)*scale];
    const inside=p=>finite(p)&&p[0]>=xMin&&p[0]<=xMax&&p[1]>=yMin&&p[1]<=yMax;
    function add(tag,a,content='') {items.push(`<${tag}${attrs(a)}>${content}</${tag}>`); return api;}
    function line(a,b,style={}) {if(!finite(a)||!finite(b)) throw new Error('Invalid point');const p=map(a),q=map(b);return add('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:'#315eca','stroke-width':3,...style});}
    /* id 是绘图状态内稳定唯一的对象标识（不得以标签文本充当）；importance 区分必要/辅助/装饰信息。
       两者只进入 labelEvidence 诊断，不下传为 SVG 属性。 */
    function label(p,text,{fontSize=22,dx=12,dy=-12,fixed=false,id=null,importance='supporting',...style}={}) {
      if(!finite(p)) throw new Error('Invalid label point');
      if(!IMPORTANCE.has(importance)) throw new Error('importance must be essential, supporting or decorative');
      if(id!==null&&(typeof id!=='string'||!id.trim())) throw new Error('label id must be a non-empty string');
      if(id!==null&&labelEvidence.some(e=>e.id===id)) throw new Error(`duplicate label id: ${id}`);
      // U+2212 is wider than an ASCII hyphen but narrower than a CJK glyph; keep a conservative estimate.
      const [px,py]=map(p), w=Math.min(width-8,Array.from(String(text)).reduce((s,c)=>s+(c==='−'?0.8:/[\u0000-\u00ff]/.test(c)?0.58:1)*fontSize,0)+6),h=fontSize+6;
      const overlap=r=>occupied.some(o=>r.x<o.x+o.w&&r.x+r.w>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y);
      let rect, resolved=false;
      const candidates=fixed?[[dx,dy-h]]:[[dx,dy-h],[dx,8],[-w-12,dy-h],[-w-12,8],[dx,-2*h-16],[-w/2,2*h]];
      for(const [ox,oy] of candidates) {
        rect={x:Math.max(4,Math.min(width-w-4,px+ox)),y:Math.max(4,Math.min(height-h-4,py+oy)),w,h};
        if(!overlap(rect)){resolved=true;break;}
      }
      if(!resolved) { const reason='No collision-free label position; label omitted'; collisions.push({point:p.slice(),text:String(text),reason}); labelEvidence.push({id,text:String(text),importance,anchor:p.slice(),status:'omitted',reason}); return api; }
      const lx=Math.max(rect.x,Math.min(rect.x+rect.w,px)),ly=Math.max(rect.y,Math.min(rect.y+rect.h,py));
      const leader=Math.hypot(lx-px,ly-py)>24;
      occupied.push({...rect,text:String(text),point:p.slice(),fixed,leader,id,importance});
      labelEvidence.push({id,text:String(text),importance,anchor:p.slice(),status:'rendered',reason:''});
      if(leader) labelItems.push(`<line${attrs({x1:px,y1:py,x2:lx,y2:ly,stroke:'#69788e','stroke-width':1.5,'data-label-leader':String(text)})}/>`);
      labelItems.push(`<text${attrs({x:rect.x+3,y:rect.y+fontSize,'font-size':fontSize,fill:'#18233a','paint-order':'stroke',stroke:'white','stroke-width':4,'stroke-linejoin':'round',...style})}>${esc(text)}</text>`);
      return api;
    }
    function axes({step=1,grid=true,xLabel='x',yLabel='y'}={}) {
      if(!Number.isFinite(step)||step<=0||(xMax-xMin+yMax-yMin)/step>1000) throw new Error('Invalid axis step');
      if(typeof xLabel!=='string'||typeof yLabel!=='string') throw new Error('axis labels must be strings');
      // Coordinate labels are semantic anchors: reserve them before ticks and never relocate them.
      if(inside([0,0])) label([0,0],'O',{fontSize:20,dx:-23,dy:28,fixed:true});
      if(xLabel&&yMin<=0&&yMax>=0) label([xMax,0],xLabel,{dx:-14,dy:-12,fixed:true});
      if(yLabel&&xMin<=0&&xMax>=0) label([0,yMax],yLabel,{dx:12,dy:28,fixed:true});
      const ticks=(min,max)=>{const first=Math.ceil(min/step),last=Math.floor(max/step);if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||last-first>10000)throw new Error('Tick range exceeds numerical precision or density');return Array.from({length:Math.max(0,last-first+1)},(_,i)=>(first+i)*step);};
      for(const x of ticks(xMin,xMax)) {
        if(grid) line([x,yMin],[x,yMax],{stroke:'#dce3ed','stroke-width':1});
        if(Math.abs(x)>1e-9 && yMin<=0&&yMax>=0) label([x,0],String(Number(x.toFixed(8))),{fontSize:20,dx:-6,dy:30,fixed:true,importance:'decorative'});
      }
      for(const y of ticks(yMin,yMax)) {
        if(grid) line([xMin,y],[xMax,y],{stroke:'#dce3ed','stroke-width':1});
        if(Math.abs(y)>1e-9 && xMin<=0&&xMax>=0) label([0,y],String(Number(y.toFixed(8))),{fontSize:20,dx:10,dy:13,fixed:true,importance:'decorative'});
      }
      if(yMin<=0&&yMax>=0) line([xMin,0],[xMax,0],{stroke:'#465168','stroke-width':2});
      if(xMin<=0&&xMax>=0) line([0,yMin],[0,yMax],{stroke:'#465168','stroke-width':2});
      return api;
    }
    function curve(fn,{segments=[[xMin,xMax]],domain=()=>true,samples=400,maxJump=height, ...style}={}) {
      if(!Number.isInteger(samples)||samples<2||samples>100000||!Number.isFinite(maxJump)||maxJump<=0) throw new Error('Invalid sampling settings');
      let d='';
      for(const segment of segments) {
        if(!finite(segment)||segment[0]>=segment[1]) throw new Error('Expected increasing finite segments');
        let prev=null;
        for(let i=0;i<=samples;i++) {
          const x=segment[0]+(segment[1]-segment[0])*i/samples;
          let y=NaN; if(domain(x)) y=fn(x);
          if(!Number.isFinite(y)){prev=null;continue;}
          const q=map([x,y]);
          d+=`${!prev||Math.hypot(q[0]-prev[0],q[1]-prev[1])>maxJump?'M':'L'}${q[0].toFixed(3)},${q[1].toFixed(3)} `;
          prev=q;
        }
      }
      return add('path',{d:d.trim(),fill:'none',stroke:'#315eca','stroke-width':3,...style});
    }
    const api={width,height,scale,map,inside,labels:occupied,collisions,labelEvidence,axes,line,label,curve,
      point(p,{r=5,...style}={}){if(!finite(p))throw new Error('Invalid point'); const q=map(p);return add('circle',{cx:q[0],cy:q[1],r,fill:'#c53d25',...style});},
      circle(p,r,style={}){if(!finite(p)||!Number.isFinite(r)||r<0)throw new Error('Invalid circle');const q=map(p);return add('circle',{cx:q[0],cy:q[1],r:r*scale,fill:'none',stroke:'#315eca','stroke-width':3,...style});},
      polygon(points,style={}){if(points.length<3||!points.every(finite))throw new Error('Invalid polygon');return add('polygon',{points:points.map(p=>map(p).join(',')).join(' '),fill:'#315eca22',stroke:'#315eca','stroke-width':3,...style});},
      arrow(a,b,style={}){return line(a,b,{'marker-end':`url(#${id}-arrow)`,...style});},
      /* labelEvidence 以非显示的 metadata 随 SVG 带出，供只拿到 SVG 字符串的审校路径读取；
         每次调用 svg() 现算现嵌，不累积、不改变学生可见内容。 */
      svg(){return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title"><title id="${id}-title">${esc(title)}</title><defs><clipPath id="${id}-clip"><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}"/></clipPath><marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs><g clip-path="url(#${id}-clip)">${items.join('')}</g><g font-family="system-ui,sans-serif">${labelItems.join('')}</g><metadata data-mathviz-label-evidence="${esc(JSON.stringify(labelEvidence))}"></metadata></svg>`;}
    };
    return api;
  }
  return {createPlot,project3,vector,fraction,approximate,escape:esc};
});
