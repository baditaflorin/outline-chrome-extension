// domainFolderManager.js
import { getLocalStorage, setLocalStorage, debugLog } from './utils.js';
import { OutlineAPI } from './outlineAPI.js';
import { asyncWrapper } from './asyncWrapper.js';

/**
 * Retrieves or creates a domain folder in Outline for the current tab.
 *
 * @param {string} outlineUrl - The base URL for the Outline API.
 * @param {string} apiToken - The API token for authorization.
 * @param {string} collectionId - The collection ID to use.
 * @param {object} tab - The current tab object.
 * @returns {Promise<string>} The parent document ID (domain folder ID).
 */
export async function getOrCreateDomainFolder(outlineUrl, apiToken, collectionId, tab) {
    let parentDocumentId = "";
    // Create an instance of OutlineAPI.
    const outlineApi = new OutlineAPI(outlineUrl, apiToken);

    if (tab && tab.url) {
        const rawDomain = new URL(tab.url).hostname;
        const domain = rawDomain.replace(/^www\./, '');
        let domainFoldersData = await getLocalStorage("domainFolders");
        let domainFolders = domainFoldersData.domainFolders || {};

        if (domainFolders[domain]) {
            const existingFolderId = domainFolders[domain];
            // Wrap the getDocument API call with asyncWrapper for uniform error handling.
            const safeGetDocument = asyncWrapper(async () => {
                return await outlineApi.getDocument(existingFolderId);
            }, tab);

            let folderDoc = await safeGetDocument();
            debugLog(`Full folder object for ${domain}:`, folderDoc);
            if (!folderDoc || folderDoc.deletedAt || folderDoc.archivedAt) {
                debugLog(`Folder for ${domain} is either missing, deleted, or archived. Recreating...`);
                // Wrap the createDocument API call.
                const safeCreateDocument = asyncWrapper(async () => {
                    return await outlineApi.createDocument({
                        title: domain,
                        text: `Folder for clippings from ${domain}`,
                        collectionId,
                        publish: true,
                        parentDocumentId: ""
                    });
                }, tab);
                const newFolder = await safeCreateDocument();
                parentDocumentId = newFolder.id;
                domainFolders[domain] = parentDocumentId;
                await setLocalStorage({ domainFolders });
                debugLog(`Recreated folder for ${domain} with ID: ${parentDocumentId}`);
            } else {
                parentDocumentId = existingFolderId;
                debugLog(`Found existing folder for ${domain}: ${parentDocumentId}`);
            }
        } else {
            // Wrap the createDocument call when no folder exists.
            const safeCreateDocument = asyncWrapper(async () => {
                return await outlineApi.createDocument({
                    title: domain,
                    text: `Folder for clippings from ${domain}`,
                    collectionId,
                    publish: true,
                    parentDocumentId: ""
                });
            }, tab);
            const folderDoc = await safeCreateDocument();
            parentDocumentId = folderDoc.id;
            domainFolders[domain] = parentDocumentId;
            await setLocalStorage({ domainFolders });
            debugLog(`Created and saved folder for ${domain} with ID: ${parentDocumentId}`);
        }
    }
    return parentDocumentId;
}
