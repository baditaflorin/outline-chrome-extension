// background.js
import { CONTEXT_MENU_ID } from './config.js';
import { debugLog, getLocalStorage, setLocalStorage, getSettings, createMetaTable } from './utils.js';
import { OutlineAPI } from './outlineAPI.js';
import { showProgressOverlay, showSuccessOverlay, showErrorOverlay } from './overlays.js';
import { getOrCreateDomainFolder } from './domainFolderManager.js';
import { convertSelectionToMarkdown } from './selectionConverter.js';
import { createNotification, setupNotificationClickListener } from './notificationManager.js';

setupNotificationClickListener();

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

    // Show the progress overlay.
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

        // Get or create the collection.
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

        // Retrieve additional metadata.
        let metaData = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const metaAuthor = document.querySelector('meta[name="author"]')?.content || "(Not specified)";
                const metaPublished = document.querySelector('meta[property="article:published_time"]')?.content || "(Not specified)";
                return { metaAuthor, metaPublished };
            }
        }).then(results => results[0].result)
            .catch(() => ({ metaAuthor: "(Not specified)", metaPublished: "(Not specified)" }));
        debugLog("Meta data retrieved:", metaData);

        // Convert selection to Markdown.
        const markdownContent = await convertSelectionToMarkdown(tab.id, info.selectionText);
        debugLog("Markdown content retrieved:", markdownContent);

        // Build document title.
        const pageTitle = tab?.title?.trim() || "";
        const selectionSnippet = info.selectionText.split(" ").slice(0, 10).join(" ");
        let docTitle = pageTitle && selectionSnippet ? `${pageTitle} - ${selectionSnippet}` : (pageTitle || selectionSnippet || "New Document");
        if (docTitle.length > 100) {
            docTitle = docTitle.substring(0, 100);
        }
        debugLog("Final document title:", docTitle);

        // Prepare metadata table.
        const createdDate = new Date().toISOString().split("T")[0];
        const clippedDate = new Date().toISOString();
        const metaTable = createMetaTable({
            pageTitle,
            tabUrl: tab?.url || "",
            metaAuthor: metaData.metaAuthor,
            metaPublished: metaData.metaPublished,
            createdDate,
            clippedDate
        });
        const finalText = metaTable + "\n\n" + markdownContent;

        // Domain folder logic.
        const parentDocumentId = await getOrCreateDomainFolder(outlineUrl, apiToken, collectionId, tab);

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

        // Show notification.
        createNotification("Document Created", `Document "${documentData.title}" created successfully in Outline. Click here to open it.`, docUrl);
    } catch (error) {
        debugLog("Error processing the context menu action:", error);
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showErrorOverlay,
            args: [error.message]
        });
        createNotification("Error", error.message);
    }
});
