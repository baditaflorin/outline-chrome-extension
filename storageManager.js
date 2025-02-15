// storageManager.js
// Enhanced Storage Manager with in-memory caching

import {getLocalStorage} from "./utils.js";

const cache = {};
let outlineApiInstance = null;

/**
 * Retrieves a value from Chrome storage (sync by default) with caching.
 *
 * @param {string|string[]} key - The key or array of keys to retrieve.
 * @param {boolean} [useSync=true] - Whether to use chrome.storage.sync (or local if false).
 * @returns {Promise<Object>} - A promise that resolves with the stored values.
 */
export function get(key, useSync = true) {
    return new Promise((resolve, reject) => {
        if (typeof key === 'string' && cache.hasOwnProperty(key)) {
            resolve({ [key]: cache[key] });
            return;
        }
        const storage = useSync ? chrome.storage.sync : chrome.storage.local;
        storage.get(key, (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                if (typeof key === 'string') {
                    cache[key] = result[key];
                } else {
                    key.forEach(k => {
                        cache[k] = result[k];
                    });
                }
                resolve(result);
            }
        });
    });
}

/**
 * Saves items to Chrome storage (sync by default) and updates cache.
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
                Object.assign(cache, items);
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
        const syncSettings = await get(["outlineUrl", "apiToken"], true);
        const localSettings = await getLocalStorage("collectionId");
        return { ...syncSettings, ...localSettings };
    } catch (error) {
        console.error("Error retrieving settings:", error);
        throw error;
    }
}


/**
 * **New Helper Function**
 * Creates and returns a cached instance of OutlineAPI after retrieving settings.
 *
 * @returns {Promise<OutlineAPI>}
 */
import { OutlineAPI } from './outlineAPI.js';
export async function getOutlineAPI() {
    if (outlineApiInstance) {
        return outlineApiInstance;
    }
    const { outlineUrl, apiToken } = await getSettings();
    if (!outlineUrl || !apiToken) {
        throw new Error("Outline URL or API token is not set. Please configure them in the options page.");
    }
    outlineApiInstance = new OutlineAPI(outlineUrl, apiToken);
    return outlineApiInstance;
}
