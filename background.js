// background.js
import { CONTEXT_MENU_ID } from './config.js';
import { setupNotificationClickListener } from './notificationManager.js';
import { sendSelectionToOutline } from './clipper.js';
import { asyncWrapper } from './asyncWrapper.js';
import { Logger } from './logger.js';

setupNotificationClickListener();

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

// Wrap the context menu click handler in an inline function that uses asyncWrapper.
// This ensures that any errors in our asynchronous logic are caught and handled.
chrome.contextMenus.onClicked.addListener((info, tab) => {
    // We wrap an async function so that errors are caught.
    asyncWrapper(async () => {
        if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) {
            Logger.debug("Invalid context menu selection.");
            return;
        }
        // Execute the core logic for sending the selection.
        await sendSelectionToOutline(tab, info);
    }, tab)(); // Immediately invoke the wrapped function.
});
