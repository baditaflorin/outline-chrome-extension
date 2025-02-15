// notificationManager.js
import { NOTIFICATION_ICON } from './config.js';
import { debugLog } from './utils.js';

const notificationUrlMap = {};

export function createNotification(title, message, docUrl) {
    chrome.notifications.create('', {
        type: "basic",
        iconUrl: NOTIFICATION_ICON,
        title,
        message
    }, (notificationId) => {
        if (docUrl) {
            notificationUrlMap[notificationId] = docUrl;
        }
    });
}

export function setupNotificationClickListener() {
    chrome.notifications.onClicked.addListener((notificationId) => {
        if (notificationUrlMap[notificationId]) {
            chrome.tabs.create({ url: notificationUrlMap[notificationId] });
            delete notificationUrlMap[notificationId];
            chrome.notifications.clear(notificationId);
        }
    });
}
