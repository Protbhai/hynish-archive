// Schematic 3D view of Plot GH-08A drawn from the approved site plan. No libraries; works offline.
(()=>{'use strict';
const PHASE=[[/Pre-RERA/,'#7f9c98'],[/Phase 1/,'#8f86b8'],[/Phase 2/,'#5b84a8'],[/Phase 3/,'#b8735a']];
const colorOf=t=>(PHASE.find(([r])=>r.test(t.phase))||[0,'#999'])[1];
const FLOOR=3,STILT=3.5;
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l)};
function shade(hex,k){const n=parseInt(hex.slice(1),16),c=[n>>16,n>>8&255,n&255].map(v=>Math.round(Math.min(255,v*k)));return `rgb(${c})`}
function corners(r,rot,c){const [x,y,w,h]=r,pts=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];if(!rot)return pts;const a=rot*Math.PI/180,s=Math.sin(a),co=Math.cos(a);return pts.map(([px,py])=>[c[0]+(px-c[0])*co-(py-c[1])*s,c[1]+(px-c[0])*s+(py-c[1])*co])}
function mount(el,S,onSelect){
 const cv=document.createElement('canvas');cv.className='model-canvas';cv.setAttribute('role','img');cv.setAttribute('aria-label','Schematic 3D model of Panchsheel Hynish towers. Drag to rotate, scroll or pinch to zoom, click a tower for details.');el.appendChild(cv);
 const ctx=cv.getContext('2d'),[PW,PH]=S.plot.size,target=[PW/2,20,PH/2];
 const cam={yaw:-0.75,pitch:0.55,dist:235};let sel=null,hover=null,drawn=[],W=0,H=0;
 const light=norm([-0.4,0.9,-0.3]);
 // Build solids: each part is an extruded rectangle.
 const solids=[];
 S.towers.forEach(t=>t.parts.forEach(p=>solids.push({id:t.id,base:corners(p,t.rot,t.c),h:STILT+t.floors*FLOOR,floors:t.floors,col:colorOf(t)})));
 (S.commercial||[]).forEach(p=>solids.push({id:'Commercial',base:corners(p),h:8,floors:2,col:'#a7a29a'}));
 function view(){const cp=Math.cos(cam.pitch),eye=[target[0]+cam.dist*cp*Math.sin(cam.yaw),target[1]+cam.dist*Math.sin(cam.pitch),target[2]+cam.dist*cp*Math.cos(cam.yaw)];
  const f=norm(sub(target,eye)),r=norm(cross(f,[0,1,0])),u=cross(r,f);return {eye,f,r,u,fp:Math.min(W,H)*1.15}}
 function proj(v,p){const d=sub(p,v.eye),z=dot(d,v.f);return z<1?null:[W/2+dot(d,v.r)*v.fp/z,H/2-dot(d,v.u)*v.fp/z,z]}
 function flat(v,rect,y,fill,stroke){const q=corners(rect).map(([x,z])=>proj(v,[x,y,z]));if(q.some(p=>!p))return;ctx.beginPath();q.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}}
 function draw(){
  const v=view();ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.clearRect(0,0,W,H);
  const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#e9eef0');sky.addColorStop(1,'#f6f5ef');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  ctx.lineWidth=1;flat(v,[-14,-14,PW+28,PH+28],-0.2,'#dfe3d6');flat(v,[0,0,PW,PH],0,'#eef0e6','#9aa79a');
  if(S.loop)flat(v,S.loop,0.05,'#d3d5d0');if(S.green)flat(v,S.green,0.1,'#b9cfa4');
  const faces=[];
  for(const s of solids){const top=s.base.map(([x,z])=>[x,s.h,z]),bot=s.base.map(([x,z])=>[x,0,z]);
   faces.push({s,pts:top,n:[0,1,0],top:true});
   for(let i=0;i<4;i++){const j=(i+1)%4,a=bot[i],b=bot[j],n=norm(cross(sub(b,a),[0,1,0]));faces.push({s,pts:[a,b,top[j],top[i]],n})}}
  const vis=[];for(const f of faces){if(!f.top&&dot(f.n,sub(f.pts[0],v.eye))>0)continue;const q=f.pts.map(p=>proj(v,p));if(q.some(p=>!p))continue;f.q=q;f.z=q.reduce((a,p)=>a+p[2],0)/q.length;vis.push(f)}
  vis.sort((a,b)=>b.z-a.z);drawn=vis;
  for(const f of vis){const on=f.s.id===sel,hv=f.s.id===hover,k=f.top?1.08:0.62+0.42*Math.max(0,dot(f.n,light));
   ctx.beginPath();f.q.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();
   ctx.fillStyle=on?shade('#e0b04f',k):shade(f.s.col,hv?k*1.12:k);ctx.fill();ctx.strokeStyle='rgba(30,45,50,.35)';ctx.stroke();
   if(!f.top&&f.q[0][2]<520){ctx.strokeStyle='rgba(255,255,255,.28)';ctx.beginPath();const [a,b,c,d]=f.pts;
    for(let i=1;i<=f.s.floors;i++){const y=STILT+i*FLOOR;if(y>=f.s.h)break;const p=proj(v,[a[0],y,a[2]]),q=proj(v,[b[0],y,b[2]]);if(p&&q){ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1])}}ctx.stroke()}}
  ctx.font='600 12px Segoe UI,Arial,sans-serif';ctx.textAlign='center';
  for(const t of S.towers){const pts=t.parts.flatMap(p=>corners(p,t.rot,t.c)),cx=pts.reduce((a,p)=>a+p[0],0)/pts.length,cz=pts.reduce((a,p)=>a+p[1],0)/pts.length;
   const p=proj(v,[cx,STILT+t.floors*FLOOR+4,cz]);if(!p)continue;ctx.fillStyle=t.id===sel?'#7a4f00':'#142d37';ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=3;ctx.strokeText(t.id,p[0],p[1]);ctx.fillText(t.id,p[0],p[1]);ctx.lineWidth=1}
  ctx.font='11px Segoe UI,Arial,sans-serif';ctx.fillStyle='#55666a';for(const e of S.entries||[]){const p=proj(v,[e.at[0],1,e.at[1]]);if(p)ctx.fillText(e.label,p[0],p[1]+14)}
  // Compass: north from the plan's arrow, projected onto the ground.
  const a=(S.plot.northDeg||0)*Math.PI/180,o=proj(v,target.map((x,i)=>i===1?0:x)),n=proj(v,[target[0]+60*Math.sin(a),0,target[2]-60*Math.cos(a)]);
  if(o&&n){let dx=n[0]-o[0],dy=n[1]-o[1];const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l;const X=W-38,Y=40;ctx.beginPath();ctx.arc(X,Y,22,0,7);ctx.fillStyle='rgba(255,255,255,.85)';ctx.fill();ctx.strokeStyle='#9aa79a';ctx.stroke();
   ctx.beginPath();ctx.moveTo(X+dx*17,Y+dy*17);ctx.lineTo(X-dy*6,Y+dx*6);ctx.lineTo(X+dy*6,Y-dx*6);ctx.closePath();ctx.fillStyle='#b8735a';ctx.fill();ctx.fillStyle='#142d37';ctx.font='700 10px Segoe UI,Arial';ctx.fillText('N',X-dx*13,Y-dy*13+4)}
 }
 function size(){const r=el.getBoundingClientRect();W=Math.max(280,r.width);H=Math.round(Math.min(560,Math.max(320,W*0.6)));cv.width=W*devicePixelRatio;cv.height=H*devicePixelRatio;cv.style.height=H+'px';draw()}
 function pick(x,y){for(let i=drawn.length-1;i>=0;i--){const q=drawn[i].q;let inside=false;for(let a=0,b=q.length-1;a<q.length;b=a++){if((q[a][1]>y)!==(q[b][1]>y)&&x<(q[b][0]-q[a][0])*(y-q[a][1])/(q[b][1]-q[a][1])+q[a][0])inside=!inside}if(inside)return drawn[i].s.id}return null}
 const ptrs=new Map();let moved=0,pinch=0;
 cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,[e.clientX,e.clientY]);moved=0;if(ptrs.size===2){const [p,q]=[...ptrs.values()];pinch=Math.hypot(p[0]-q[0],p[1]-q[1])}});
 cv.addEventListener('pointermove',e=>{const r=cv.getBoundingClientRect();if(!ptrs.has(e.pointerId)){const h=pick(e.clientX-r.left,e.clientY-r.top);if(h!==hover){hover=h;cv.style.cursor=h?'pointer':'grab';draw()}return}
  const [px,py]=ptrs.get(e.pointerId),dx=e.clientX-px,dy=e.clientY-py;ptrs.set(e.pointerId,[e.clientX,e.clientY]);moved+=Math.abs(dx)+Math.abs(dy);
  if(ptrs.size===2){const [p,q]=[...ptrs.values()],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(pinch){cam.dist=Math.min(700,Math.max(90,cam.dist*pinch/d))}pinch=d}
  else{cam.yaw-=dx*0.008;cam.pitch=Math.min(1.5,Math.max(0.12,cam.pitch+dy*0.006))}draw()});
 const up=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=0;if(moved<6&&e.type==='pointerup'){const r=cv.getBoundingClientRect(),id=pick(e.clientX-r.left,e.clientY-r.top);if(id&&id!=='Commercial')select(id)}};
 cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
 cv.addEventListener('wheel',e=>{e.preventDefault();cam.dist=Math.min(700,Math.max(90,cam.dist*(e.deltaY>0?1.1:0.9)));draw()},{passive:false});
 function select(id){sel=id;draw();onSelect&&onSelect(id)}
 new ResizeObserver(size).observe(el);size();
 return {select,reset(){Object.assign(cam,{yaw:-0.75,pitch:0.55,dist:235});draw()},top(){Object.assign(cam,{pitch:1.5,dist:300});draw()},
  turn(d){cam.yaw+=d;draw()}}
}
window.HynishModel={mount,colorOf};
})();
