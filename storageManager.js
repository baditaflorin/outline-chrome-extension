// storageManager.js
// Encapsulates Chrome storage access, centralizing the logic for getting and setting data.
// Change 4: This module removes duplication in storage calls and allows for easier future changes.

/**
 * Retrieves a value from Chrome storage (sync by default).
 *
 * @param {string|string[]} key - The key or array of keys to retrieve.
 * @param {boolean} [useSync=true] - Whether to use chrome.storage.sync (or local if false).
 * @returns {Promise<Object>} - A promise that resolves with the stored values.
 */
export function get(key, useSync = true) {
    return new Promise((resolve, reject) => {
        const storage = useSync ? chrome.storage.sync : chrome.storage.local;
        storage.get(key, (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Saves items to Chrome storage (sync by default).
 *
 * @param {Object} items - The items to save.
 * @param {boolean} [useSync=true] - Whether to use chrome.storage.sync (or local if false).
 * @returns {Promise<void>}
 */
export function set(items, useSync = true) {
    return new Promise((resolve, reject) => {
        const storage = useSync ? chrome.storage.sync : chrome.storage.local;
        storage.set(items, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

/**
 * Retrieves the Outline settings from storage.
 *
 * @returns {Promise<Object>} - A promise that resolves with outlineUrl, apiToken, etc.
 */
export async function getSettings() {
    try {
        // Here we use sync storage for user settings.
        const result = await get(["outlineUrl", "apiToken"], true);
        return result;
    } catch (error) {
        console.error("Error retrieving settings:", error);
        throw error;
    }
}
