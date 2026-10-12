// Kleine service worker voor de lopers-app: enkel om meldingen te tonen ("bijna aan de beurt").
// Bewust zonder cache en met een eigen, smalle scope (./loper-melding/), zodat hij de service worker van index.html niet vervangt.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Tik op de melding: de open lopers-app naar voren halen, of hem opnieuw openen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '../loper.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes('loper.html'));
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })
  );
});
