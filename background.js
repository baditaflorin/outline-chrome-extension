// background.js
import { CONTEXT_MENU_ID } from './config.js';
import { setupNotificationClickListener } from './notificationManager.js';
import { sendSelectionToOutline } from './clipper.js';
import { asyncWrapper } from './asyncWrapper.js';
import { Logger } from './logger.js';

setupNotificationClickListener();

// Create the context menu on installation.
chrome.runtime.onInstalled.addListener(() => {
    Logger.info("Extension installed, creating context menu item.");
    chrome.contextMenus.create(
        {
            id: CONTEXT_MENU_ID,
            title: "Send to Outline",
            contexts: ["selection"],
        },
        () => {
            if (chrome.runtime.lastError) {
                Logger.error("Error creating context menu:", chrome.runtime.lastError);
            } else {
                Logger.info("Context menu created successfully.");
            }
        }
    );
});

// **New:** Extracted context menu click handler for clarity.
async function handleContextMenuClick(info, tab) {
    if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) {
        Logger.debug("Invalid context menu selection.");
        return;
    }
    await sendSelectionToOutline(tab, info);
}

// Wrap and add the context menu click listener using asyncWrapper.
chrome.contextMenus.onClicked.addListener((info, tab) => {
    asyncWrapper(handleContextMenuClick, tab)(info, tab);
});
