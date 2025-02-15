(() => {
    // --- Constants ---
    const CONTEXT_MENU_ID = "send-to-outline";
    const NOTIFICATION_ICON = "icon.png";
    const FETCH_TIMEOUT = 8000;
    const DEBUG_MODE = true; // Set to false in production.
    const MAX_RETRIES = 3;
    const INITIAL_BACKOFF = 500; // in milliseconds

    // --- Global Map for Notification URLs ---
    const notificationUrlMap = {};

    // --- Custom Error Classes ---
    class OutlineApiError extends Error {
        constructor(message, status) {
            super(message);
            this.name = "OutlineApiError";
            this.status = status;
        }
    }

    // --- Logging Helper ---
    function debugLog(...args) {
        if (DEBUG_MODE) {
            console.log(...args);
        }
    }

    // --- Helper Functions ---
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
     * notifyUser now accepts a clickUrl.
     * If provided, the notification is saved in a map for the onClicked listener.
     */
    function notifyUser(title, message, iconUrl = NOTIFICATION_ICON, clickUrl) {
        chrome.notifications.create('', {
            type: "basic",
            iconUrl,
            title,
            message
        }, (notificationId) => {
            if (clickUrl) {
                notificationUrlMap[notificationId] = clickUrl;
            }
        });
    }

    // Listener for notification clicks.
    chrome.notifications.onClicked.addListener((notificationId) => {
        if (notificationUrlMap[notificationId]) {
            chrome.tabs.create({ url: notificationUrlMap[notificationId] });
            delete notificationUrlMap[notificationId];
            chrome.notifications.clear(notificationId);
        }
    });

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
    // We assume that the stored outlineUrl is the base URL (e.g. "https://0memory.com")
    // and we append "/api" for all API calls.
    const OutlineAPI = {
        async createCollection(outlineUrl, apiToken, collectionName) {
            const base = outlineUrl.replace(/\/+$/, ''); // remove trailing slash
            const endpoint = `${base}/api/collections.create`;
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

        async createDocument({ outlineUrl, apiToken, title, text, collectionId, publish = true, parentDocumentId = "" }) {
            const base = outlineUrl.replace(/\/+$/, '');
            const endpoint = `${base}/api/documents.create`;
            const payload = { title, text, collectionId, publish };
            if (parentDocumentId && parentDocumentId.trim() !== "") {
                payload.parentDocumentId = parentDocumentId;
            }
            debugLog("Sending request to create document with payload:", payload);
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
        },

        // New helper to check if a document (folder) exists.
        async getDocument(outlineUrl, apiToken, documentId) {
            const base = outlineUrl.replace(/\/+$/, '');
            const endpoint = `${base}/api/documents.info`;
            const response = await retryFetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiToken}`
                },
                body: JSON.stringify({ id: documentId })
            });
            if (!response.ok) {
                return null;
            }
            const data = await response.json();
            return data.data;
        }
    };

    // --- Progress Overlay Injection Functions ---
    function showProgressOverlay() {
        if (document.getElementById('outline-progress-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'outline-progress-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '999999';

        const spinner = document.createElement('div');
        spinner.style.border = '16px solid #f3f3f3';
        spinner.style.borderTop = '16px solid #3498db';
        spinner.style.borderRadius = '50%';
        spinner.style.width = '80px';
        spinner.style.height = '80px';
        // Add a CSS class so we can animate both rotation and color change
        spinner.classList.add("outline-spinner");
        overlay.appendChild(spinner);

        const style = document.createElement('style');
        style.textContent = `
      @keyframes outline-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
      }
      @keyframes color-change {
          0% { border-top-color: #3498db; }
          50% { border-top-color: #e74c3c; }
          100% { border-top-color: #3498db; }
      }
      .outline-spinner {
          animation: outline-spin 2s linear infinite, color-change 2s linear infinite;
      }
    `;
        overlay.appendChild(style);

        const text = document.createElement('div');
        text.id = 'outline-progress-text';
        text.textContent = 'Sending to Outline...';
        text.style.color = '#fff';
        text.style.fontSize = '20px';
        text.style.marginTop = '20px';
        overlay.appendChild(text);

        document.body.appendChild(overlay);
    }

    function showSuccessOverlay() {
        const overlay = document.getElementById('outline-progress-overlay');
        if (overlay) {
            overlay.innerHTML = '';
            const checkmark = document.createElement('div');
            checkmark.textContent = '✔';
            checkmark.style.fontSize = '64px';
            checkmark.style.color = '#2ecc71';
            checkmark.style.opacity = '0';
            checkmark.style.transition = 'opacity 0.5s ease-in-out';
            overlay.appendChild(checkmark);
            setTimeout(() => { checkmark.style.opacity = '1'; }, 100);
            const message = document.createElement('div');
            message.textContent = 'Document created successfully!';
            message.style.color = '#fff';
            message.style.fontSize = '20px';
            message.style.marginTop = '20px';
            message.style.opacity = '0';
            message.style.transition = 'opacity 0.5s ease-in-out';
            overlay.appendChild(message);
            setTimeout(() => { message.style.opacity = '1'; }, 100);
            setTimeout(() => {
                overlay.style.transition = 'opacity 0.5s ease-in-out';
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.remove(); }, 500);
            }, 2000);
        }
    }

    function showErrorOverlay(errorMessage) {
        const overlay = document.getElementById('outline-progress-overlay');
        if (overlay) {
            overlay.innerHTML = '';
            const cross = document.createElement('div');
            cross.textContent = '✖';
            cross.style.fontSize = '64px';
            cross.style.color = '#e74c3c';
            cross.style.opacity = '0';
            cross.style.transition = 'opacity 0.5s ease-in-out';
            overlay.appendChild(cross);
            setTimeout(() => { cross.style.opacity = '1'; }, 100);
            const message = document.createElement('div');
            message.textContent = errorMessage || 'An error occurred.';
            message.style.color = '#fff';
            message.style.fontSize = '20px';
            message.style.marginTop = '20px';
            message.style.opacity = '0';
            message.style.transition = 'opacity 0.5s ease-in-out';
            overlay.appendChild(message);
            setTimeout(() => { message.style.opacity = '1'; }, 100);
            setTimeout(() => {
                overlay.style.transition = 'opacity 0.5s ease-in-out';
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.remove(); }, 500);
            }, 2000);
        }
    }

    // --- Main Logic ---
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
                    files: ["lib/turndown.js"]
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
                // Get domain and strip any "www." prefix.
                const rawDomain = new URL(tab.url).hostname;
                const domain = rawDomain.replace(/^www\./, '');

                let domainFoldersData = await getLocalStorage("domainFolders");
                let domainFolders = domainFoldersData.domainFolders || {};

                if (domainFolders[domain]) {
                    const existingFolderId = domainFolders[domain];
                    // Check if the folder still exists on the server.
                    let folderDoc = await OutlineAPI.getDocument(outlineUrl, apiToken, existingFolderId);
                    // Log full content of the folderDoc for debugging.
                    debugLog(`Full folder object for ${domain}:`, folderDoc);
                    // Check both for deletion and archival.
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
                    // No folder exists—create one.
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

            // Generate a URL for the document.
            const docUrl = documentData.url || `${outlineUrl.replace(/\/+$/, '')}/doc/${documentData.id}`;

            // Update the overlay to show success.
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: showSuccessOverlay
            });

            // Show a clickable notification.
            notifyUser(
                "Document Created",
                `Document "${documentData.title}" created successfully in Outline. Click here to open it.`,
                NOTIFICATION_ICON,
                docUrl
            );
        } catch (error) {
            debugLog("Error processing the context menu action:", error);
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: showErrorOverlay,
                args: [error.message]
            });
            notifyUser("Error", error.message);
        }
    });
})();
