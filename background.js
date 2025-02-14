/**
 * background.js
 *
 * This service worker handles:
 * - Creating a context menu item.
 * - Handling context menu click events.
 * - Retrieving user settings (Outline URL and API token).
 * - Getting or creating a default collection.
 * - Creating a folder document for a website domain (if needed).
 * - Creating a new clipping document in Outline as a child of the domain folder.
 * - Prepending metadata (including a "Clipped Date" field) to the clipping text.
 */

// Helper: Retrieve user settings from chrome.storage.sync
async function getSettings() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(["outlineUrl", "apiToken"], (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error retrieving settings:", chrome.runtime.lastError);
                return reject(chrome.runtime.lastError);
            }
            console.log("Settings retrieved:", result);
            resolve(result);
        });
    });
}

// On extension installation, create the context menu item
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed, creating context menu item.");
    chrome.contextMenus.create(
        {
            id: "send-to-outline",
            title: "Send to Outline",
            contexts: ["selection"]
        },
        () => {
            if (chrome.runtime.lastError) {
                console.error("Error creating context menu:", chrome.runtime.lastError);
            } else {
                console.log("Context menu created successfully.");
            }
        }
    );
});

// Listen for context menu click events
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log("Context menu clicked. Info:", info);
    if (info.menuItemId === "send-to-outline" && info.selectionText) {
        console.log("Selected text:", info.selectionText);
        try {
            // Retrieve settings (Outline URL and API token)
            const { outlineUrl, apiToken } = await getSettings();
            if (!outlineUrl || !apiToken) {
                throw new Error("Outline URL or API token not set. Please configure them in the options page.");
            }
            console.log("Using Outline URL:", outlineUrl);
            console.log("Using API token:", apiToken);

            // Define the collection name (can be configurable)
            const collectionName = "Chrome Clippings";
            const collectionId = await getOrCreateCollection(outlineUrl, apiToken, collectionName);
            console.log("Using collection ID:", collectionId);

            // Retrieve additional metadata from the page (author and published date)
            let metaData = { metaAuthor: "(Not specified)", metaPublished: "(Not specified)" };
            if (tab && tab.id) {
                try {
                    const [result] = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            const metaAuthor = document.querySelector('meta[name="author"]')?.content || "(Not specified)";
                            const metaPublished = document.querySelector('meta[property="article:published_time"]')?.content || "(Not specified)";
                            return { metaAuthor, metaPublished };
                        }
                    });
                    metaData = result.result;
                } catch (e) {
                    console.error("Error retrieving meta data:", e);
                }
            }
            console.log("Meta data retrieved:", metaData);

            // Build the document title using the webpage title and a snippet from the selection.
            const pageTitle = (tab && tab.title) ? tab.title.trim() : "";
            const selectionSnippet = info.selectionText.split(" ").slice(0, 10).join(" ");
            let docTitle = "";
            if (pageTitle && selectionSnippet) {
                docTitle = `${pageTitle} - ${selectionSnippet}`;
            } else if (pageTitle) {
                docTitle = pageTitle;
            } else if (selectionSnippet) {
                docTitle = selectionSnippet;
            } else {
                docTitle = "New Document";
            }
            // Truncate the title to 100 characters to meet API requirements.
            if (docTitle.length > 100) {
                docTitle = docTitle.substring(0, 100);
            }
            console.log("Final document title:", docTitle);

            // Prepare metadata table as Markdown.
            const createdDate = new Date().toISOString().split("T")[0];
            const clippedDate = new Date().toISOString();
            const metaTable = `
| Field        | Value                                             |
|--------------|---------------------------------------------------|
| Title        | ${pageTitle || "(Not specified)"}                 |
| Source       | ${tab && tab.url ? tab.url : "(Not specified)"}     |
| Author       | ${metaData.metaAuthor}                            |
| Published    | ${metaData.metaPublished}                         |
| Created      | ${createdDate}                                    |
| Clipped Date | ${clippedDate}                                    |
`;
            // Combine the meta table with the original selected text.
            const finalText = metaTable + "\n\n" + info.selectionText;

            // --- Domain Folder Logic ---
            // Extract domain from the tab's URL.
            let parentDocumentId = "";
            if (tab && tab.url) {
                const domain = new URL(tab.url).hostname;
                parentDocumentId = await getOrCreateDomainFolder(outlineUrl, apiToken, collectionId, domain);
                console.log(`Using domain folder "${domain}" with ID:`, parentDocumentId);
            }

            // Create the clip document as a child of the domain folder.
            const documentData = await createDocument({
                title: docTitle,
                text: finalText,
                collectionId,
                publish: true,
                outlineUrl,
                apiToken,
                parentDocumentId // This will nest the clip under the domain folder.
            });
            console.log("Document (clip) created successfully:", documentData);

            // Notify the user that the document was created
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "Document Created",
                message: `Document "${documentData.title}" created successfully in Outline.`
            });
        } catch (error) {
            console.error("Error processing the context menu action:", error);
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "Error",
                message: error.message
            });
        }
    } else {
        console.warn("Context menu clicked without valid selection or incorrect menu ID.");
    }
});

// Helper: Get (or create) the default collection in Outline
async function getOrCreateCollection(outlineUrl, apiToken, collectionName) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("collectionId", async (result) => {
            if (chrome.runtime.lastError) {
                console.error("Local storage error:", chrome.runtime.lastError);
                return reject(chrome.runtime.lastError);
            }
            if (result.collectionId) {
                console.log("Found existing collectionId in local storage:", result.collectionId);
                resolve(result.collectionId);
            } else {
                console.log("No existing collection found. Creating new collection:", collectionName);
                try {
                    const endpoint = `${outlineUrl}/collections.create`;
                    console.log("Sending POST request to:", endpoint);
                    const response = await fetch(endpoint, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${apiToken}`
                        },
                        body: JSON.stringify({
                            name: collectionName,
                            description: "",
                            permission: "read",
                            color: "#123123",
                            private: false
                        })
                    });
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error(`Collection creation failed with status: ${response.status}`);
                        console.error("Error response body:", errorText);
                        throw new Error(`Collection creation failed with status: ${response.status} - ${errorText}`);
                    }
                    const data = await response.json();
                    console.log("Collection creation response:", data);
                    const collectionId = data.data.id;
                    chrome.storage.local.set({ collectionId }, () => {
                        if (chrome.runtime.lastError) {
                            console.error("Error saving collectionId:", chrome.runtime.lastError);
                        } else {
                            console.log("Collection ID saved:", collectionId);
                        }
                    });
                    resolve(collectionId);
                } catch (error) {
                    console.error("Error during collection creation:", error);
                    reject(error);
                }
            }
        });
    });
}

// Helper: Get or create a folder document for a domain.
// This function uses chrome.storage.local to cache folder IDs by domain.
async function getOrCreateDomainFolder(outlineUrl, apiToken, collectionId, domain) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("domainFolders", async (result) => {
            let domainFolders = result.domainFolders || {};
            if (domainFolders[domain]) {
                console.log(`Found existing folder for ${domain}: ${domainFolders[domain]}`);
                resolve(domainFolders[domain]);
            } else {
                console.log(`No folder for ${domain} found. Creating new folder document.`);
                try {
                    // Create a folder document (at collection root, so no parentDocumentId)
                    const folderDoc = await createDocument({
                        title: domain,
                        text: `Folder for clippings from ${domain}`,
                        collectionId,
                        publish: true,
                        outlineUrl,
                        apiToken,
                        parentDocumentId: "" // Root-level folder document.
                    });
                    // Save the folder document ID in local storage.
                    domainFolders[domain] = folderDoc.id;
                    chrome.storage.local.set({ domainFolders }, () => {
                        if (chrome.runtime.lastError) {
                            console.error("Error saving domainFolders:", chrome.runtime.lastError);
                        } else {
                            console.log(`Saved folder for ${domain} with ID: ${folderDoc.id}`);
                        }
                    });
                    resolve(folderDoc.id);
                } catch (err) {
                    console.error(`Error creating folder for domain ${domain}:`, err);
                    reject(err);
                }
            }
        });
    });
}

// Helper: Create a new document in Outline.
// Accepts an optional parentDocumentId to nest the document.
async function createDocument({ title, text, collectionId, publish = true, outlineUrl, apiToken, parentDocumentId = "" }) {
    const payload = { title, text, collectionId, publish };
    if (parentDocumentId && parentDocumentId.trim() !== "") {
        payload.parentDocumentId = parentDocumentId;
    }
    console.log("Sending request to create document with payload:", payload);

    const endpoint = `${outlineUrl}/documents.create`;
    console.log("Sending POST request to:", endpoint);

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiToken}`
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Document creation failed with status: ${response.status}, error: ${errorText}`);
        throw new Error(`Document creation failed with status: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    console.log("Document creation response:", data);
    return data.data;
}
