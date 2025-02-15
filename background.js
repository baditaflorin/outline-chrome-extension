// background.js
import { CONTEXT_MENU_ID, NOTIFICATION_ICON } from './config.js';
import { debugLog, getLocalStorage, setLocalStorage, getSettings, executeScriptOnTab, createMetaTable } from './utils.js';
import { OutlineAPI } from './outlineAPI.js';
import { showProgressOverlay, showSuccessOverlay, showErrorOverlay } from './overlays.js';

const notificationUrlMap = {};

// Listener for notification clicks.
chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationUrlMap[notificationId]) {
        chrome.tabs.create({ url: notificationUrlMap[notificationId] });
        delete notificationUrlMap[notificationId];
        chrome.notifications.clear(notificationId);
    }
});

chrome.runtime.onInstalled.addListener(() => {
    debugLog("Extension installed, creating context menu item.");
    chrome.contextMenus.create(
        {
            id: CONTEXT_MENU_ID,
            title: "Send to Outline",
            contexts: ["selection"]
        },
        () => {
            if (chrome.runtime.lastError) {
                debugLog("Error creating context menu:", chrome.runtime.lastError);
            } else {
                debugLog("Context menu created successfully.");
            }
        }
    );
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) {
        debugLog("Invalid context menu selection.");
        return;
    }
    debugLog("Plain text selected:", info.selectionText);

    // Show the progress overlay in the active tab.
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showProgressOverlay
    });

    try {
        const { outlineUrl, apiToken } = await getSettings();
        if (!outlineUrl || !apiToken) {
            throw new Error("Outline URL or API token not set. Please configure them in the options page.");
        }
        debugLog("Using Outline URL:", outlineUrl);
        debugLog("Using API token:", apiToken);

        // Get (or create) the collection.
        const collectionName = "Chrome Clippings";
        let collectionId;
        const localCollection = await getLocalStorage("collectionId");
        if (localCollection.collectionId) {
            collectionId = localCollection.collectionId;
            debugLog("Found existing collectionId:", collectionId);
        } else {
            collectionId = await OutlineAPI.createCollection(outlineUrl, apiToken, collectionName);
            await setLocalStorage({ collectionId });
            debugLog("Created and saved new collectionId:", collectionId);
        }

        // Retrieve additional metadata from the page.
        let metaData = await executeScriptOnTab(tab.id, {
            func: () => {
                const metaAuthor = document.querySelector('meta[name="author"]')?.content || "(Not specified)";
                const metaPublished = document.querySelector('meta[property="article:published_time"]')?.content || "(Not specified)";
                return { metaAuthor, metaPublished };
            }
        });
        if (!metaData) {
            metaData = { metaAuthor: "(Not specified)", metaPublished: "(Not specified)" };
        }
        debugLog("Meta data retrieved:", metaData);

        // Convert HTML selection to Markdown.
        let markdownContent = "";
        if (tab && tab.id) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["./lib/turndown.js"]
            }).catch(err => debugLog("Error injecting Turndown library:", err));
            markdownContent = await executeScriptOnTab(tab.id, {
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
            if (!markdownContent) {
                debugLog("Turndown conversion returned empty; falling back to plain text.");
                markdownContent = info.selectionText;
            }
        }
        debugLog("Markdown content retrieved:", markdownContent);

        // Build document title.
        const pageTitle = (tab && tab.title) ? tab.title.trim() : "";
        const selectionSnippet = info.selectionText.split(" ").slice(0, 10).join(" ");
        let docTitle = pageTitle && selectionSnippet
            ? `${pageTitle} - ${selectionSnippet}`
            : pageTitle || selectionSnippet || "New Document";
        if (docTitle.length > 100) {
            docTitle = docTitle.substring(0, 100);
        }
        debugLog("Final document title:", docTitle);

        // Prepare metadata table.
        const createdDate = new Date().toISOString().split("T")[0];
        const clippedDate = new Date().toISOString();
        const metaTable = createMetaTable({
            pageTitle,
            tabUrl: tab && tab.url ? tab.url : "",
            metaAuthor: metaData.metaAuthor,
            metaPublished: metaData.metaPublished,
            createdDate,
            clippedDate
        });
        const finalText = metaTable + "\n\n" + markdownContent;

        // --- Domain Folder Logic ---
        let parentDocumentId = "";
        if (tab && tab.url) {
            const rawDomain = new URL(tab.url).hostname;
            const domain = rawDomain.replace(/^www\./, '');

            let domainFoldersData = await getLocalStorage("domainFolders");
            let domainFolders = domainFoldersData.domainFolders || {};

            if (domainFolders[domain]) {
                const existingFolderId = domainFolders[domain];
                let folderDoc = await OutlineAPI.getDocument(outlineUrl, apiToken, existingFolderId);
                debugLog(`Full folder object for ${domain}:`, folderDoc);
                if (!folderDoc || folderDoc.deletedAt || folderDoc.archivedAt) {
                    debugLog(`Folder for ${domain} is either missing, deleted, or archived. Recreating...`);
                    const newFolder = await OutlineAPI.createDocument({
                        outlineUrl,
                        apiToken,
                        title: domain,
                        text: `Folder for clippings from ${domain}`,
                        collectionId,
                        publish: true,
                        parentDocumentId: ""
                    });
                    parentDocumentId = newFolder.id;
                    domainFolders[domain] = parentDocumentId;
                    await setLocalStorage({ domainFolders });
                    debugLog(`Recreated folder for ${domain} with ID: ${parentDocumentId}`);
                } else {
                    parentDocumentId = existingFolderId;
                    debugLog(`Found existing folder for ${domain}: ${parentDocumentId}`);
                }
            } else {
                const folderDoc = await OutlineAPI.createDocument({
                    outlineUrl,
                    apiToken,
                    title: domain,
                    text: `Folder for clippings from ${domain}`,
                    collectionId,
                    publish: true,
                    parentDocumentId: ""
                });
                parentDocumentId = folderDoc.id;
                domainFolders[domain] = parentDocumentId;
                await setLocalStorage({ domainFolders });
                debugLog(`Created and saved folder for ${domain} with ID: ${parentDocumentId}`);
            }
        }

        // Create the clipping document.
        const documentData = await OutlineAPI.createDocument({
            outlineUrl,
            apiToken,
            title: docTitle,
            text: finalText,
            collectionId,
            publish: true,
            parentDocumentId
        });
        debugLog("Document created successfully:", documentData);

        const docUrl = documentData.url || `${outlineUrl.replace(/\/+$/, '')}/doc/${documentData.id}`;

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showSuccessOverlay
        });

        // Show a clickable notification.
        chrome.notifications.create('', {
            type: "basic",
            iconUrl: NOTIFICATION_ICON,
            title: "Document Created",
            message: `Document "${documentData.title}" created successfully in Outline. Click here to open it.`
        }, (notificationId) => {
            if (docUrl) {
                notificationUrlMap[notificationId] = docUrl;
            }
        });
    } catch (error) {
        debugLog("Error processing the context menu action:", error);
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showErrorOverlay,
            args: [error.message]
        });
        chrome.notifications.create('', {
            type: "basic",
            iconUrl: NOTIFICATION_ICON,
            title: "Error",
            message: error.message
        });
    }
});
