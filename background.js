// Helper to get settings from chrome.storage.sync
async function getSettings() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(["outlineUrl", "apiToken"], (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result);
        });
    });
}

// Create context menu item when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "send-to-outline",
        title: "Send to Outline",
        contexts: ["selection"]
    });
});

// Listen for context menu click events
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "send-to-outline" && info.selectionText) {
        try {
            const { outlineUrl, apiToken } = await getSettings();
            if (!outlineUrl || !apiToken) {
                throw new Error("Outline URL or API token not set. Please configure them in the extension options.");
            }

            // Set the base URL using user input
            const OUTLINE_BASE_URL = outlineUrl;

            // Get or create the default collection (hard-coded name; can be made configurable)
            const collectionId = await getOrCreateCollection(OUTLINE_BASE_URL, apiToken, "Chrome Clippings");

            // Use the selected text as the document body.
            const title = info.selectionText.split("\n")[0].trim();
            const text = info.selectionText;

            // Create a new document in the collection
            const documentData = await createDocument({
                title,
                text,
                collectionId,
                publish: true,
                OUTLINE_BASE_URL,
                apiToken
            });

            // Show a notification to the user
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "Document Created",
                message: `Document "${documentData.title}" was created in Outline.`
            });
        } catch (error) {
            console.error("Error sending to Outline:", error);
            chrome.notifications.create({
                type: "basic",
                iconUrl: "icon.png",
                title: "Error",
                message: error.message
            });
        }
    }
});

// Helper: Get (or create) the default collection
async function getOrCreateCollection(OUTLINE_BASE_URL, apiToken, collectionName) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get("collectionId", async (result) => {
            if (result.collectionId) {
                resolve(result.collectionId);
            } else {
                try {
                    const response = await fetch(`${OUTLINE_BASE_URL}/collections.create`, {
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
                        throw new Error(`Collection creation failed: ${response.status}`);
                    }

                    const data = await response.json();
                    const collectionId = data.data.id;

                    // Save the collection ID for later use
                    chrome.storage.local.set({ collectionId });
                    resolve(collectionId);
                } catch (error) {
                    reject(error);
                }
            }
        });
    });
}

// Helper: Create a document in Outline
async function createDocument({ title, text, collectionId, publish = true, OUTLINE_BASE_URL, apiToken }) {
    const response = await fetch(`${OUTLINE_BASE_URL}/documents.create`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiToken}`
        },
        body: JSON.stringify({
            title,
            text,
            collectionId,
            publish
        })
    });

    if (!response.ok) {
        throw new Error(`Document creation failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
}
