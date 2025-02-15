// errorHandler.js
// This module centralizes error handling logic.
// Change 3: It reduces duplication by handling overlays and notifications in one place.

import { showErrorOverlay } from './overlays.js';
import { createNotification } from './notificationManager.js';
import { debugLog } from './utils.js';

/**
 * Handles errors by showing an error overlay and creating a notification.
 *
 * @param {object} tab - The current tab object.
 * @param {Error} error - The error object.
 */
export function handleError(tab, error) {
    debugLog("Handling error:", error);
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showErrorOverlay,
        args: [error.message],
    });
    createNotification("Error", error.message);
}
