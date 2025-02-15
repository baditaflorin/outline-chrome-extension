// background.js
import { setupNotificationClickListener } from './notificationManager.js';
import { initializeContextMenu } from './contextMenuManager.js';

setupNotificationClickListener();
initializeContextMenu();

// Global error handling for the service worker (background script)
self.addEventListener('error', (event) => {
    console.error('Global error caught in service worker:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});
