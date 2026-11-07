// Decrypts the private edition on request. Files live encrypted in blobs/; the key (non-extractable AES-GCM) was saved
// to IndexedDB by the unlock page. Requests under app/ are answered from the decrypted files; without a key they go back
// to the unlock page.
const DB='hynish-private',STORE='k';
const idb=()=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const getKey=async()=>{const db=await idb();return new Promise(ok=>{const q=db.transaction(STORE).objectStore(STORE).get('key');q.onsuccess=()=>ok(q.result||null);q.onerror=()=>ok(null)})};
const open=async(key,buf)=>{const b=new Uint8Array(buf);return crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(0,12)},key,b.slice(12))};
let manifest=null,manifestKey=null;
const getManifest=async key=>{
  if(manifest&&manifestKey===key)return manifest;
  const r=await fetch(new URL('manifest.bin',self.registration.scope),{cache:'no-store'});
  manifest=JSON.parse(new TextDecoder().decode(await open(key,await r.arrayBuffer())));manifestKey=key;return manifest;
};
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{if(e.data==='locked'){manifest=null;manifestKey=null}});
self.addEventListener('fetch',e=>{
  const app=new URL('app/',self.registration.scope);
  if(e.request.url.startsWith(app.href))e.respondWith(serve(new URL(e.request.url),app,e.request));
});
async function serve(url,app,request){
  const key=await getKey();
  if(!key)return request.mode==='navigate'?Response.redirect(self.registration.scope,302):new Response('Locked',{status:403});
  let rel=decodeURIComponent(url.pathname.slice(app.pathname.length));
  if(rel===''||rel.endsWith('/'))rel+='index.html';
  let m;
  try{m=await getManifest(key)}catch(err){return new Response('Could not unlock: the password may have changed. Go back and unlock again.',{status:403})}
  const entry=m[rel];
  if(!entry)return new Response('Not found in the private edition: '+rel,{status:404,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  const r=await fetch(new URL('blobs/'+entry[0]+'.bin',self.registration.scope));
  if(!r.ok)return new Response('Encrypted file missing',{status:502});
  return new Response(await open(key,await r.arrayBuffer()),{headers:{'Content-Type':entry[1],'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
}
