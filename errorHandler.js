// errorHandler.js
// This module centralizes error handling logic.
import { showErrorOverlay } from './overlays.js';
import { createNotification } from './notificationManager.js';
import { debugLog } from './utils.js';
import { safeExecuteScriptOnTab } from './utils.js'; // NEW: use safeExecuteScriptOnTab

/**
 * Handles errors by showing an error overlay and creating a notification.
 *
 * @param {object} tab - The current tab object.
 * @param {Error} error - The error object.
 */
export function handleError(tab, error) {
    debugLog("Handling error:", error);
    safeExecuteScriptOnTab(tab.id, {
        func: showErrorOverlay,
        args: [error.message],
    });
    createNotification("Error", error.message);
}
