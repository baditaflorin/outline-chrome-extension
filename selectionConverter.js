// selectionConverter.js
import { executeScriptOnTab, debugLog } from './utils.js';

export async function convertSelectionToMarkdown(tabId, defaultText) {
    let markdownContent = "";
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["./lib/turndown.js"]
        });
        markdownContent = await executeScriptOnTab(tabId, {
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
    } catch (error) {
        debugLog("Error converting selection to markdown:", error);
    }
    return markdownContent || defaultText;
}
