// clipper.js
// This module encapsulates the core logic for sending selected text to Outline.

import { debugLog, executeScriptOnTab, createMetaTable, safeExecuteScriptOnTab } from './utils.js';
import { convertSelectionToMarkdown } from './selectionConverter.js';
import { createNotification } from './notificationManager.js';
import { getOrCreateDomainFolder } from './domainFolderManager.js';
import { getSettings } from './storageManager.js'; // still used for collectionId if available
import { getOutlineAPI } from './storageManager.js'; // NEW: centralized API instantiation
import { showProgressOverlay, showSuccessOverlay } from './overlays.js';
import { handleError } from './errorHandler.js';
import { asyncWrapper } from './asyncWrapper.js';

export async function sendSelectionToOutline(tab, info) {
    // Use safe script execution for overlays.
    await safeExecuteScriptOnTab(tab.id, { func: showProgressOverlay });

    try {
        // Retrieve settings and API instance.
        const settings = await getSettings();
        const { collectionId: savedCollectionId } = settings;
        // Centralized OutlineAPI creation (Change 1)
        const outlineApi = await getOutlineAPI();

        // Log the settings.
        debugLog("Using Outline API:", outlineApi);

        // Retrieve or create collection.
        const collectionName = "Chrome Clippings";
        let collectionId = savedCollectionId;
        if (collectionId) {
            debugLog("Found existing collectionId:", collectionId);
        } else {
            collectionId = await outlineApi.createCollection(collectionName);
            await chrome.storage.local.set({ collectionId });
            debugLog("Created and saved new collectionId:", collectionId);
        }

        // Retrieve additional metadata from the page.
        const metaData = await safeExecuteScriptOnTab(tab.id, {
            func: () => {
                const metaAuthor = document.querySelector('meta[name="author"]')?.content || "(Not specified)";
                const metaPublished = document.querySelector('meta[property="article:published_time"]')?.content || "(Not specified)";
                return { metaAuthor, metaPublished };
            }
        }).then((results) => results[0].result)
            .catch(() => ({ metaAuthor: "(Not specified)", metaPublished: "(Not specified)" }));
        debugLog("Meta data retrieved:", metaData);

        const safeConvertSelectionToMarkdown = asyncWrapper(convertSelectionToMarkdown, tab);
        const markdownContent = await safeConvertSelectionToMarkdown(tab.id, info.selectionText);
        debugLog("Markdown content retrieved:", markdownContent);

        const pageTitle = tab?.title?.trim() || "";
        const selectionSnippet = info.selectionText.split(" ").slice(0, 10).join(" ");
        let docTitle = pageTitle && selectionSnippet ? `${pageTitle} - ${selectionSnippet}` : (pageTitle || selectionSnippet || "New Document");
        if (docTitle.length > 100) {
            docTitle = docTitle.substring(0, 100);
        }
        debugLog("Final document title:", docTitle);

        const createdDate = new Date().toISOString().split("T")[0];
        const clippedDate = new Date().toISOString();
        const metaTable = createMetaTable({
            pageTitle,
            tabUrl: tab?.url || "",
            metaAuthor: metaData.metaAuthor,
            metaPublished: metaData.metaPublished,
            createdDate,
            clippedDate,
        });
        const finalText = metaTable + "\n\n" + markdownContent;

        // Domain folder logic.
        const parentDocumentId = await getOrCreateDomainFolder(outlineApi.baseUrl, outlineApi.apiToken, collectionId, tab);

        // Create the clipping document.
        const documentData = await outlineApi.createDocument({
            title: docTitle,
            text: finalText,
            collectionId,
            publish: true,
            parentDocumentId,
        });
        debugLog("Document created successfully:", documentData);

        const docUrl = documentData.url || `${outlineApi.baseUrl}/doc/${documentData.id}`;

        // Use safe script execution to show success overlay.
        await safeExecuteScriptOnTab(tab.id, { func: showSuccessOverlay });

        // Show notification.
        createNotification(
            "Document Created",
            `Document "${documentData.title}" created successfully in Outline. Click here to open it.`,
            docUrl
        );
    } catch (error) {
        debugLog("Error processing the context menu action:", error);
        handleError(tab, error);
    }
}
