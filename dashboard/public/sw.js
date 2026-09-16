// AttendStack Chat Service Worker - Production Grade Background Notifications
const CACHE_NAME = 'attendstack-chat-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming Web Push events (if backend WebPush or FCM is utilized)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'AttendStack Message', body: event.data.text() };
    }
  }

  const title = data.title || 'New Message on AttendStack';
  const options = {
    body: data.body || 'You have received a new message.',
    icon: data.icon || '/favicon.png',
    badge: '/favicon.png',
    tag: data.tag || (data.conversationId ? `chat_${data.conversationId}` : 'chat_notification'),
    renotify: true,
    silent: true,
    data: {
      url: data.url || (data.conversationId ? `/chat?convId=${data.conversationId}` : '/chat'),
      conversationId: data.conversationId,
    },
    actions: [
      {
        action: 'open_chat',
        title: 'Open Chat',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle clicking on the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/chat';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
