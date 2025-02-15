// utils.js
import { FETCH_TIMEOUT, DEBUG_MODE, MAX_RETRIES, INITIAL_BACKOFF } from './config.js';

export function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}

export async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("Request timed out"));
        }, timeout);
        fetch(url, options)
            .then(response => {
                clearTimeout(timer);
                resolve(response);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

export async function retryFetch(url, options = {}, maxRetries = MAX_RETRIES, backoff = INITIAL_BACKOFF) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchWithTimeout(url, options);
        } catch (error) {
            debugLog(`Attempt ${attempt + 1} failed: ${error.message}`);
            if (attempt === maxRetries) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, attempt)));
        }
    }
}

export async function parseApiError(response, defaultErrorText) {
    let errorMsg = `Error (Status: ${response.status})`;
    try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const errorData = await response.json();
            errorMsg += ` - ${JSON.stringify(errorData)}`;
        } else {
            const errorText = await response.text();
            errorMsg += ` - ${errorText || defaultErrorText}`;
        }
    } catch (e) {
        errorMsg += ` - ${defaultErrorText}`;
    }
    return errorMsg;
}

export function getLocalStorage(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, (result) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(result);
            }
        });
    });
}

export function setLocalStorage(items) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(items, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve();
            }
        });
    });
}

export function getSettings() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(["outlineUrl", "apiToken"], (result) => {
            if (chrome.runtime.lastError) {
                debugLog("Error retrieving settings:", chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                debugLog("Settings retrieved:", result);
                resolve(result);
            }
        });
    });
}

export async function executeScriptOnTab(tabId, details) {
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            ...details
        });
        return result.result;
    } catch (error) {
        debugLog("Error executing script on tab:", details, "Error:", error);
        throw new Error(`Script execution failed: ${error.message}`);
    }
}


export function createMetaTable({ pageTitle, tabUrl, metaAuthor, metaPublished, createdDate, clippedDate }) {
    return `
| Field        | Value                                          |
|--------------|------------------------------------------------|
| Title        | ${pageTitle || "(Not specified)"}              |
| Source       | ${tabUrl || "(Not specified)"}                 |
| Author       | ${metaAuthor || "(Not specified)"}             |
| Published    | ${metaPublished || "(Not specified)"}          |
| Created      | ${createdDate}                                 |
| Clipped Date | ${clippedDate}                                 |
`;
}

/**
 * Creates common API headers for Outline API requests.
 * @param {string} apiToken - The API token for authorization.
 * @returns {Object} - Headers object.
 */
export function createApiHeaders(apiToken) {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`
    };
}