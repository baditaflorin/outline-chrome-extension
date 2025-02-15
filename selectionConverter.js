// selectionConverter.js
import { executeScriptOnTab, debugLog } from './utils.js';
import { asyncWrapper } from './asyncWrapper.js';

let turndownLoaded = false;

/**
 * Loads the Turndown script only once per tab.
 *
 * @param {number} tabId - The target tab ID.
 * @returns {Promise<void>}
 */
async function loadTurndownIfNeeded(tabId) {
    if (turndownLoaded) return;
    const safeLoadScript = asyncWrapper(async () => {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["./lib/turndown.js"]
        });
    }, null);
    await safeLoadScript();
    turndownLoaded = true;
}

/**
 * Converts the selected text to Markdown.
 *
 * @param {number} tabId - The tab ID on which to execute the conversion.
 * @param {string} defaultText - Fallback text if conversion fails.
 * @returns {Promise<string>} The Markdown version of the selection or defaultText.
 */
export async function convertSelectionToMarkdown(tabId, defaultText) {
    let markdownContent = "";
    try {
        // Load Turndown script if not already loaded.
        await loadTurndownIfNeeded(tabId);

        const safeConversion = asyncWrapper(async () => {
            return await executeScriptOnTab(tabId, {
                func: () => {
                    const selection = window.getSelection();
                    if (!selection.rangeCount) return "";
                    const container = document.createElement("div");
                    for (let i = 0; i < selection.rangeCount; i++) {
                        container.appendChild(selection.getRangeAt(i).cloneContents());
                    }
                    const html = container.innerHTML;
                    if (typeof window.TurndownService !== "undefined") {
                        const turndownService = new window.TurndownService();
                        return turndownService.turndown(html);
                    }
                    return html;
                }
            });
        }, null);

        markdownContent = await safeConversion();
    } catch (error) {
        debugLog("Error converting selection to markdown:", error);
    }
    return markdownContent || defaultText;
}
