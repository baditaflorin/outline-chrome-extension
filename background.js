(() => {
    // Import the Turndown library (for MV3, this is injected as a web-accessible resource)
    importScripts('./lib/turndown.js');

    /**
     * Helper: Fetch with timeout.
     * Rejects if the request does not complete within the specified time.
     */
    async function fetchWithTimeout(url, options = {}, timeout = 8000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Request timed out'));
            }, timeout);
            fetch(url, options)
                .then(response => {
                    clearTimeout(timer);
                    resolve(response);
                })
                .catch(err => {
                    clearTimeout(timer);
                    reject(err);
                });
        });
    }

    /**
     * Helper: Wrap chrome.storage.local.get in a Promise.
     */
    function getLocalStorage(key) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(key, (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result);
                }
            });
        });
    }

    /**
     * Helper: Wrap chrome.storage.local.set in a Promise.
     */
    function setLocalStorage(items) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(items, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Helper: Retrieve user settings from chrome.storage.sync.
     */
    async function getSettings() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get(["outlineUrl", "apiToken"], (result) => {
                if (chrome.runtime.lastError) {
                    console.error("Error retrieving settings:", chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    console.log("Settings retrieved:", result);
                    resolve(result);
                }
            });
        });
    }

    /**
     * Helper: Create a notification.
     */
    function notifyUser(title, message, iconUrl = "icon.png") {
        chrome.notifications.create({
            type: "basic",
            iconUrl,
            title,
            message
        });
    }

    // On extension installation, create the context menu item.
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

    // Listen for context menu click events.
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        console.log("Context menu clicked. Info:", info);
        if (info.menuItemId !== "send-to-outline" || !info.selectionText) {
            console.warn("Invalid context menu selection.");
            return;
        }
        console.log("Plain text selected:", info.selectionText);
        try {
            // Retrieve settings (Outline URL and API token)
            const { outlineUrl, apiToken } = await getSettings();
            if (!outlineUrl || !apiToken) {
                throw new Error("Outline URL or API token not set. Please configure them in the options page.");
            }
            console.log("Using Outline URL:", outlineUrl);
            console.log("Using API token:", apiToken);

            // Get (or create) the collection.
            const collectionName = "Chrome Clippings";
            const collectionId = await getOrCreateCollection(outlineUrl, apiToken, collectionName);
            console.log("Using collection ID:", collectionId);

            // Retrieve additional metadata from the page.
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

            // Retrieve and convert the HTML of the current selection to Markdown.
            let markdownContent = "";
            if (tab && tab.id) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ["lib/turndown.js"]
                    });
                } catch (e) {
                    console.warn("Error injecting Turndown library:", e);
                }
                try {
                    const [result] = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
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
                    markdownContent = result.result;
                } catch (e) {
                    console.error("Error converting selection to Markdown:", e);
                    markdownContent = info.selectionText; // Fallback to plain text.
                }
            }
            console.log("Markdown content retrieved:", markdownContent);

            // Build document title using the page title and a snippet of the selection.
            const pageTitle = (tab && tab.title) ? tab.title.trim() : "";
            const selectionSnippet = info.selectionText.split(" ").slice(0, 10).join(" ");
            let docTitle = pageTitle && selectionSnippet ? `${pageTitle} - ${selectionSnippet}` : pageTitle || selectionSnippet || "New Document";
            if (docTitle.length > 100) {
                docTitle = docTitle.substring(0, 100);
            }
            console.log("Final document title:", docTitle);

            // Prepare metadata table as Markdown.
            const createdDate = new Date().toISOString().split("T")[0];
            const clippedDate = new Date().toISOString();
            const metaTable = `
| Field        | Value                                          |
|--------------|------------------------------------------------|
| Title        | ${pageTitle || "(Not specified)"}              |
| Source       | ${tab && tab.url ? tab.url : "(Not specified)"}  |
| Author       | ${metaData.metaAuthor}                         |
| Published    | ${metaData.metaPublished}                      |
| Created      | ${createdDate}                                 |
| Clipped Date | ${clippedDate}                                 |
`;

            const finalText = metaTable + "\n\n" + markdownContent;

            // --- Domain Folder Logic ---
            let parentDocumentId = "";
            if (tab && tab.url) {
                const domain = new URL(tab.url).hostname;
                parentDocumentId = await getOrCreateDomainFolder(outlineUrl, apiToken, collectionId, domain);
                console.log(`Using domain folder "${domain}" with ID:`, parentDocumentId);
            }

            // Create the clipping document as a child of the domain folder.
            const documentData = await createDocument({
                title: docTitle,
                text: finalText,
                collectionId,
                publish: true,
                outlineUrl,
                apiToken,
                parentDocumentId
            });
            console.log("Document created successfully:", documentData);

            // Notify the user that the document was created.
            notifyUser("Document Created", `Document "${documentData.title}" created successfully in Outline.`);
        } catch (error) {
            console.error("Error processing the context menu action:", error);
            notifyUser("Error", error.message);
        }
    });

    /**
     * Helper: Get (or create) the default collection in Outline.
     */
    async function getOrCreateCollection(outlineUrl, apiToken, collectionName) {
        try {
            const result = await getLocalStorage("collectionId");
            if (result.collectionId) {
                console.log("Found existing collectionId:", result.collectionId);
                return result.collectionId;
            }
            console.log("No existing collection found. Creating new collection:", collectionName);
            const endpoint = `${outlineUrl}/collections.create`;
            console.log("Sending POST request to:", endpoint);
            const response = await fetchWithTimeout(endpoint, {
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
                let errorMsg = `Collection creation failed (Status: ${response.status})`;
                if (response.status === 401) {
                    errorMsg += " - Unauthorized: Please check your API token.";
                } else if (response.status === 404) {
                    errorMsg += " - Endpoint not found: Please verify your Outline URL.";
                }
                errorMsg += ` - ${errorText}`;
                throw new Error(errorMsg);
            }
            const data = await response.json();
            const collectionId = data.data.id;
            await setLocalStorage({ collectionId });
            console.log("Collection ID saved:", collectionId);
            return collectionId;
        } catch (error) {
            console.error("Error during collection creation:", error);
            throw error;
        }
    }

    /**
     * Helper: Get or create a folder document for a domain.
     */
    async function getOrCreateDomainFolder(outlineUrl, apiToken, collectionId, domain) {
        try {
            const result = await getLocalStorage("domainFolders");
            let domainFolders = result.domainFolders || {};
            if (domainFolders[domain]) {
                console.log(`Found existing folder for ${domain}: ${domainFolders[domain]}`);
                return domainFolders[domain];
            }
            console.log(`No folder for ${domain} found. Creating new folder document.`);
            const folderDoc = await createDocument({
                title: domain,
                text: `Folder for clippings from ${domain}`,
                collectionId,
                publish: true,
                outlineUrl,
                apiToken,
                parentDocumentId: ""
            });
            domainFolders[domain] = folderDoc.id;
            await setLocalStorage({ domainFolders });
            console.log(`Saved folder for ${domain} with ID: ${folderDoc.id}`);
            return folderDoc.id;
        } catch (err) {
            console.error(`Error creating folder for domain ${domain}:`, err);
            throw err;
        }
    }

    /**
     * Helper: Create a new document in Outline.
     * Accepts an optional parentDocumentId to nest the document.
     */
    async function createDocument({ title, text, collectionId, publish = true, outlineUrl, apiToken, parentDocumentId = "" }) {
        const payload = { title, text, collectionId, publish };
        if (parentDocumentId && parentDocumentId.trim() !== "") {
            payload.parentDocumentId = parentDocumentId;
        }
        console.log("Sending request to create document with payload:", payload);
        const endpoint = `${outlineUrl}/documents.create`;
        const response = await fetchWithTimeout(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiToken}`
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            let errorMsg = `Document creation failed (Status: ${response.status})`;
            if (response.status === 401) {
                errorMsg += " - Unauthorized: Please check your API token.";
            } else if (response.status === 404) {
                errorMsg += " - Endpoint not found: Please verify your Outline URL.";
            }
            errorMsg += ` - ${errorText}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }
        const data = await response.json();
        console.log("Document creation response:", data);
        return data.data;
    }
})();
