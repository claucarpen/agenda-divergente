// Service worker de Agenda Divergente (spec 003): solo avisos. Sin caché offline.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let aviso = { titulo: 'Agenda Divergente', cuerpo: 'Hubo un cambio en la semana.', url: '/semana' };
  try { aviso = { ...aviso, ...e.data.json() }; } catch (_) { /* aviso sin datos: el texto por defecto */ }
  e.waitUntil(self.registration.showNotification(aviso.titulo, {
    body: aviso.cuerpo,
    icon: '/iconos/icono-192.png',
    badge: '/iconos/icono-192.png',
    lang: 'es-AR',
    data: { url: aviso.url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/semana', self.location.origin).href;
  e.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of ventanas) {
      if ('focus' in v) { await v.navigate(url); return v.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
