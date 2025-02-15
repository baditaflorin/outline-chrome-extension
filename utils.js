// utils.js
import { FETCH_TIMEOUT, DEBUG_MODE, MAX_RETRIES, INITIAL_BACKOFF } from './config.js';
import { asyncWrapper } from './asyncWrapper.js';

/**
 * Logs debug messages if DEBUG_MODE is enabled.
 * @param  {...any} args - The messages to log.
 */
export function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}

/**
 * Fetches a URL with a timeout.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - Fetch options.
 * @param {number} [timeout=FETCH_TIMEOUT] - Timeout in milliseconds.
 * @returns {Promise<Response>} The fetch response.
 */
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

/**
 * Retries a fetch operation with exponential backoff.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - Fetch options.
 * @param {number} [maxRetries=MAX_RETRIES] - Maximum number of retries.
 * @param {number} [backoff=INITIAL_BACKOFF] - Initial backoff in milliseconds.
 * @returns {Promise<Response>} The fetch response.
 */
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

/**
 * Parses an API error from a fetch response.
 * @param {Response} response - The fetch response.
 * @param {string} defaultErrorText - Default error text.
 * @returns {Promise<string>} The parsed error message.
 */
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

/**
 * Retrieves data from chrome.storage.local.
 * @param {string|string[]} key - The key(s) to retrieve.
 * @returns {Promise<Object>} The retrieved data.
 */
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

/**
 * Saves items to chrome.storage.local.
 * @param {Object} items - The items to save.
 * @returns {Promise<void>}
 */
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


/**
 * Executes a script on a given tab and returns the result.
 * @param {number} tabId - The target tab ID.
 * @param {object} details - Details for chrome.scripting.executeScript.
 * @returns {Promise<*>} The result of the script execution.
 */
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

// Create a safe version of executeScriptOnTab using asyncWrapper.
// This ensures any errors during script execution are handled uniformly.
export const safeExecuteScriptOnTab = asyncWrapper(executeScriptOnTab, null);

/**
 * Creates a Markdown table for metadata.
 * @param {Object} data - Metadata including pageTitle, tabUrl, metaAuthor, metaPublished, createdDate, clippedDate.
 * @returns {string} The Markdown table.
 */
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
 * Creates API headers for Outline API requests.
 * @param {string} apiToken - The API token for authorization.
 * @returns {Object} The headers object.
 */
export function createApiHeaders(apiToken) {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiToken}`
    };
}
