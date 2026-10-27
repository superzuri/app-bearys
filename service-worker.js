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

importScripts("https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCi5qbm0JWJpi6zEnIJPqQIPZQ88_DCE3Q",
  authDomain: "bearys-coffee-shop.firebaseapp.com",
  projectId: "bearys-coffee-shop",
  storageBucket: "bearys-coffee-shop.firebasestorage.app",
  messagingSenderId: "626308162012",
  appId: "1:626308162012:web:a9c08b4d50240e4aed6f19"
});

const messaging=firebase.messaging();

messaging.onBackgroundMessage(payload=>{
  const data=payload&&payload.data?payload.data:{};
  const title=data.title||"¡OMMMMMGGGGGGGGG! 😱";
  const body=data.body||"¡Sorpresa! Ya son la 1:50 p. m.: toca enviar el pan 🍞🚀";
  const targetUrl=new URL(data.url||"./",self.registration.scope).href;
  return self.registration.showNotification(title,{
    body,
    icon:new URL("./bearys-192.png",self.registration.scope).href,
    badge:new URL("./bearys-192.png",self.registration.scope).href,
    tag:data.tag||"bearys-bread-reminder",
    renotify:false,
    data:{url:targetUrl}
  });
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const targetUrl=event.notification.data&&event.notification.data.url
    ?event.notification.data.url
    :self.registration.scope;
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(windowClients=>{
    const existing=windowClients.find(client=>client.url.startsWith(self.registration.scope));
    if(existing){
      if(typeof existing.navigate==="function")existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
