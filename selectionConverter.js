// selectionConverter.js
import { executeScriptOnTab, debugLog } from './utils.js';
import { asyncWrapper } from './asyncWrapper.js';

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
        // Wrap the script injection for Turndown with asyncWrapper.
        const loadTurndownScript = asyncWrapper(async () => {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ["./lib/turndown.js"]
            });
        }, null);
        await loadTurndownScript();

        // Wrap the conversion function with asyncWrapper for uniform error handling.
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
