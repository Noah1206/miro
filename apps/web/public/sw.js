/* MIRO: cache only a public offline screen. Never cache chats, authentication, APIs or audio. */
const OFFLINE_CACHE = 'miro-offline-v1'
const OFFLINE_PAGE = '/offline.html'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add(OFFLINE_PAGE)))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('miro-offline-') && key !== OFFLINE_CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]))
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(OFFLINE_CACHE)
    return await cache.match(OFFLINE_PAGE) ?? new Response('인터넷 연결을 확인한 뒤 다시 열어 주세요.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }))
})

/* Web Push 수신 및 탭 열기. */
self.addEventListener('push', (event) => {
  let data = { title: 'MIRO', body: '', url: '/', tag: 'miro' }
  try { data = { ...data, ...event.data.json() } } catch {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: data.tag,
    renotify: true,
    data: { url: data.url },
    icon: '/icon-192.png?v=4',
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
