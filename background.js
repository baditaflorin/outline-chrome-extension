(() => {
    // --- Constants ---
    const CONTEXT_MENU_ID = "send-to-outline";
    const NOTIFICATION_ICON = "icon.png";
    const FETCH_TIMEOUT = 8000;
    const DEBUG_MODE = true; // Set to false in production.
    const MAX_RETRIES = 3;
    const INITIAL_BACKOFF = 500; // in milliseconds

    // --- Custom Error Classes ---

    /**
     * Custom error class for Outline API errors.
     * @extends Error
     */
    class OutlineApiError extends Error {
        /**
         * Creates an instance of OutlineApiError.
         * @param {string} message - The error message.
         * @param {number} status - HTTP status code.
         */
        constructor(message, status) {
            super(message);
            this.name = "OutlineApiError";
            this.status = status;
        }
    }

    // --- Logging Helper ---

    /**
     * Logs debug messages when DEBUG_MODE is enabled.
     * @param {...any} args - Arguments to log.
     */
    function debugLog(...args) {
        if (DEBUG_MODE) {
            console.log(...args);
        }
    }

    // --- Helper Functions ---

    /**
     * Fetch with timeout.
     * Rejects if the request does not complete within the specified time.
     * @param {string} url - The URL to fetch.
     * @param {object} [options={}] - Fetch options.
     * @param {number} [timeout=FETCH_TIMEOUT] - Timeout in milliseconds.
     * @returns {Promise<Response>}
     */
    async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error("Request timed out"));
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
     * Retry fetch with exponential backoff.
     * Retries the fetch up to maxRetries times if a transient error occurs.
     * @param {string} url - The URL to fetch.
     * @param {object} [options={}] - Fetch options.
     * @param {number} [maxRetries=MAX_RETRIES] - Maximum number of retries.
     * @param {number} [backoff=INITIAL_BACKOFF] - Initial backoff delay in ms.
     * @returns {Promise<Response>}
     */
    async function retryFetch(url, options = {}, maxRetries = MAX_RETRIES, backoff = INITIAL_BACKOFF) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fetchWithTimeout(url, options);
            } catch (error) {
                debugLog(`Attempt ${attempt + 1} failed: ${error.message}`);
                if (attempt === maxRetries) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, attempt)));
            }
        }
    }

    /**
     * Parse API error response to produce a standardized error message.
     * @param {Response} response - The fetch Response object.
     * @param {string} defaultErrorText - Default error text.
     * @returns {Promise<string>} Parsed error message.
     */
    async function parseApiError(response, defaultErrorText) {
        let errorMsg = `Error (Status: ${response.status})`;
        try {
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const errorData = await response.json();
                errorMsg += ` - ${JSON.stringify(errorData)}`;
            } else {
                const errorText = await response.text();
                errorMsg += ` - ${errorText || defaultErrorText}`;
            }
        } catch (e) {
            errorMsg += ` - ${defaultErrorText}`;
        }
        return errorMsg;
    }

    /**
     * Wrap chrome.storage.local.get in a Promise.
     * @param {string} key - The key to get.
     * @returns {Promise<any>}
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
     * Wrap chrome.storage.local.set in a Promise.
     * @param {object} items - Items to set.
     * @returns {Promise<void>}
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
     * Retrieve user settings from chrome.storage.sync.
     * @returns {Promise<{outlineUrl: string, apiToken: string}>}
     */
    async function getSettings() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get(["outlineUrl", "apiToken"], (result) => {
                if (chrome.runtime.lastError) {
                    debugLog("Error retrieving settings:", chrome.runtime.lastError);
                    reject(chrome.runtime.lastError);
                } else {
                    debugLog("Settings retrieved:", result);
                    resolve(result);
                }
            });
        });
    }

    /**
     * Create a notification.
     * @param {string} title - Notification title.
     * @param {string} message - Notification message.
     * @param {string} [iconUrl=NOTIFICATION_ICON] - Icon URL.
     */
    function notifyUser(title, message, iconUrl = NOTIFICATION_ICON) {
        chrome.notifications.create({
            type: "basic",
            iconUrl,
            title,
            message
        });
    }

    /**
     * Execute a script in the context of the given tab.
     * @param {number} tabId - The ID of the tab.
     * @param {object} details - Details for chrome.scripting.executeScript.
     * @returns {Promise<any>} The result of the executed script.
     */
    async function executeScriptOnTab(tabId, details) {
        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId },
                ...details
            });
            return result.result;
        } catch (error) {
            debugLog("Error executing script on tab:", error);
            return null;
        }
    }

    /**
     * Build the metadata Markdown table.
     * @param {object} params - Parameters for the table.
     * @returns {string} Markdown formatted metadata table.
     */
    function createMetaTable({ pageTitle, tabUrl, metaAuthor, metaPublished, createdDate, clippedDate }) {
        return `
| Field        | Value                                          |
|--------------|------------------------------------------------|
| Title        | ${pageTitle || "(Not specified)"}              |
| Source       | ${tabUrl || "(Not specified)"}                 |
| Author       | ${metaAuthor || "(Not specified)"}             |
| Published    | ${metaPublished || "(Not specified)"}          |
| Created      | ${createdDate}                                 |
| Clipped Date | ${clippedDate}                                 |
`;
    }

    // --- Outline API Communication Layer ---
    const OutlineAPI = {
        /**
         * Create a collection in Outline.
         * @param {string} outlineUrl - The Outline API URL.
         * @param {string} apiToken - The API token.
         * @param {string} collectionName - The name of the collection.
         * @returns {Promise<string>} The collection ID.
         * @throws {OutlineApiError}
         */
        async createCollection(outlineUrl, apiToken, collectionName) {
            const endpoint = `${outlineUrl}/collections.create`;
            debugLog("Sending POST request to:", endpoint);
            const response = await retryFetch(endpoint, {
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
                const errorMsg = await parseApiError(response, "Collection creation failed");
                throw new OutlineApiError(errorMsg, response.status);
            }
            const data = await response.json();
            return data.data.id;
        },

        /**
         * Create a document in Outline.
         * @param {object} params - Parameters for document creation.
         * @param {string} params.outlineUrl - The Outline API URL.
         * @param {string} params.apiToken - The API token.
         * @param {string} params.title - Document title.
         * @param {string} params.text - Document content.
         * @param {string} params.collectionId - The collection ID.
         * @param {boolean} [params.publish=true] - Whether to publish the document.
         * @param {string} [params.parentDocumentId=""] - Optional parent document ID.
         * @returns {Promise<object>} Document data.
         * @throws {OutlineApiError}
         */
        async createDocument({ outlineUrl, apiToken, title, text, collectionId, publish = true, parentDocumentId = "" }) {
            const payload = { title, text, collectionId, publish };
            if (parentDocumentId && parentDocumentId.trim() !== "") {
                payload.parentDocumentId = parentDocumentId;
            }
            debugLog("Sending request to create document with payload:", payload);
            const endpoint = `${outlineUrl}/documents.create`;
            const response = await retryFetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiToken}`
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorMsg = await parseApiError(response, "Document creation failed");
                throw new OutlineApiError(errorMsg, response.status);
            }
            const data = await response.json();
            return data.data;
        }
    };

    // --- Main Logic ---

    // On extension installation, create the context menu item.
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

    // Listen for context menu click events.
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        debugLog("Context menu clicked. Info:", info);
        if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) {
            debugLog("Invalid context menu selection.");
            return;
        }
        debugLog("Plain text selected:", info.selectionText);
        try {
            // Retrieve settings (Outline URL and API token)
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

            // Retrieve and convert the HTML of the current selection to Markdown.
            let markdownContent = "";
            if (tab && tab.id) {
                // Inject Turndown library if needed.
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["lib/turndown.js"]
                }).catch(err => debugLog("Error injecting Turndown library:", err));
                // Convert selection to Markdown.
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

            // Build document title using the page title and a snippet of the selection.
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
                const domain = new URL(tab.url).hostname;
                let domainFoldersData = await getLocalStorage("domainFolders");
                let domainFolders = domainFoldersData.domainFolders || {};
                if (domainFolders[domain]) {
                    parentDocumentId = domainFolders[domain];
                    debugLog(`Found existing folder for ${domain}: ${parentDocumentId}`);
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

            // Create the clipping document as a child of the domain folder.
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

            // Notify the user that the document was created.
            notifyUser("Document Created", `Document "${documentData.title}" created successfully in Outline.`);
        } catch (error) {
            debugLog("Error processing the context menu action:", error);
            notifyUser("Error", error.message);
        }
    });
})();
