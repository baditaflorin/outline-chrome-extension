// background.js
import { CONTEXT_MENU_ID } from './config.js';
import { setupNotificationClickListener } from './notificationManager.js';
import { sendSelectionToOutline } from './clipper.js';

setupNotificationClickListener();

chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed, creating context menu item.");
    chrome.contextMenus.create(
        {
            id: CONTEXT_MENU_ID,
            title: "Send to Outline",
            contexts: ["selection"],
        },
        () => {
            if (chrome.runtime.lastError) {
                console.log("Error creating context menu:", chrome.runtime.lastError);
            } else {
                console.log("Context menu created successfully.");
            }
        }
    );
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) {
        console.log("Invalid context menu selection.");
        return;
    }
    // Delegate the core logic to the clipper module.
    sendSelectionToOutline(tab, info);
});
