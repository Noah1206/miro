/* MIRO service worker — Web Push 수신 및 탭 열기. */
self.addEventListener('push', (event) => {
  let data = { title: 'MIRO', body: '', url: '/', tag: 'miro' }
  try { data = { ...data, ...event.data.json() } } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag,
    renotify: true,
    data: { url: data.url },
    icon: '/icon-192.png',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const existing = list.find((c) => 'focus' in c)
    if (existing) { existing.navigate(url); return existing.focus() }
    return self.clients.openWindow(url)
  }))
})
