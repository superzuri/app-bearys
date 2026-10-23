const CACHE_NAME="bearys-offline-v1";
const OFFLINE_URL=new URL("./offline.html",self.registration.scope).href;

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache=>cache.add(OFFLINE_URL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith("bearys-offline-")&&name!==CACHE_NAME).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET"||request.mode!=="navigate")return;
  const requestUrl=new URL(request.url);
  if(requestUrl.origin!==self.location.origin)return;
  event.respondWith((async()=>{
    try{
      return await fetch(request);
    }catch(error){
      return await caches.match(OFFLINE_URL)||new Response(
        "Sin conexión. Reconecta tu dispositivo para abrir Beary's.",
        {status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}
      );
    }
  })());
});
