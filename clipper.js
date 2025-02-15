// clipper.js
// This module encapsulates the core logic for sending selected text to Outline.
// It extracts the business logic from background.js to adhere to the Single Responsibility Principle.

import { debugLog, executeScriptOnTab, createMetaTable } from './utils.js';
import { convertSelectionToMarkdown } from './selectionConverter.js';
import { createNotification } from './notificationManager.js';
import { getOrCreateDomainFolder } from './domainFolderManager.js';
import { getSettings } from './storageManager.js'; // Using StorageManager from Change 4
import { OutlineAPI } from './outlineAPI.js';
import { showProgressOverlay, showSuccessOverlay } from './overlays.js';
import { handleError } from './errorHandler.js'; // Centralized error handling

/**
 * Sends the currently selected text to Outline.
 *
 * @param {object} tab - The current tab object.
 * @param {object} info - Context menu info (including selectionText).
 */
export async function sendSelectionToOutline(tab, info) {
    // Show the progress overlay.
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showProgressOverlay,
    });

    try {
        // Retrieve settings (uses StorageManager for storage abstraction).
        const { outlineUrl, apiToken, collectionId: savedCollectionId } = await getSettings();
        if (!outlineUrl || !apiToken) {
            throw new Error("Outline URL or API token not set. Please configure them in the options page.");
        }
        debugLog("Using Outline URL:", outlineUrl);
        debugLog("Using API token:", apiToken);

        // Create an instance of the OutlineAPI (Change 2).
        const outlineApi = new OutlineAPI(outlineUrl, apiToken);

        // Retrieve or create collection.
        const collectionName = "Chrome Clippings";
        let collectionId = savedCollectionId;
        if (collectionId) {
            debugLog("Found existing collectionId:", collectionId);
        } else {
            collectionId = await outlineApi.createCollection(collectionName);
            // Save the new collectionId using StorageManager (Change 4).
            await chrome.storage.local.set({ collectionId });
            debugLog("Created and saved new collectionId:", collectionId);
        }

        // Retrieve additional metadata from the page.
        const metaData = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const metaAuthor = document.querySelector('meta[name="author"]')?.content || "(Not specified)";
                const metaPublished = document.querySelector('meta[property="article:published_time"]')?.content || "(Not specified)";
                return { metaAuthor, metaPublished };
            },
        }).then((results) => results[0].result)
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
            clippedDate,
        });
        const finalText = metaTable + "\n\n" + markdownContent;

        // Domain folder logic.
        const parentDocumentId = await getOrCreateDomainFolder(outlineUrl, apiToken, collectionId, tab);

        // Create the clipping document.
        const documentData = await outlineApi.createDocument({
            title: docTitle,
            text: finalText,
            collectionId,
            publish: true,
            parentDocumentId,
        });
        debugLog("Document created successfully:", documentData);

        const docUrl = documentData.url || `${outlineUrl.replace(/\/+$/, '')}/doc/${documentData.id}`;

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: showSuccessOverlay,
        });

        // Show notification.
        createNotification(
            "Document Created",
            `Document "${documentData.title}" created successfully in Outline. Click here to open it.`,
            docUrl
        );
    } catch (error) {
        debugLog("Error processing the context menu action:", error);
        // Delegate error handling to our centralized error handler (Change 3).
        handleError(tab, error);
    }
}
