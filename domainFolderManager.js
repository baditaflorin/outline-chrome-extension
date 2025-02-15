// domainFolderManager.js
import { getLocalStorage, setLocalStorage, debugLog } from './utils.js';
import { OutlineAPI } from './outlineAPI.js';
import { asyncWrapper } from './asyncWrapper.js';

/**
 * Helper function to create a domain folder.
 *
 * @param {OutlineAPI} outlineApi - An instance of the OutlineAPI.
 * @param {string} domain - The domain name to use as the folder title.
 * @param {string} collectionId - The collection ID to use.
 * @param {object} tab - The current tab object.
 * @returns {Promise<string>} The ID of the created folder.
 */
async function createDomainFolder(outlineApi, domain, collectionId, tab) {
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
    debugLog(`Created folder for ${domain} with ID: ${folderDoc.id}`);
    return folderDoc.id;
}

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
    const outlineApi = new OutlineAPI(outlineUrl, apiToken);

    if (tab && tab.url) {
        const rawDomain = new URL(tab.url).hostname;
        const domain = rawDomain.replace(/^www\./, '');
        let domainFoldersData = await getLocalStorage("domainFolders");
        let domainFolders = domainFoldersData.domainFolders || {};

        if (domainFolders[domain]) {
            const existingFolderId = domainFolders[domain];
            const safeGetDocument = asyncWrapper(async () => {
                return await outlineApi.getDocument(existingFolderId);
            }, tab);

            let folderDoc = await safeGetDocument();
            debugLog(`Full folder object for ${domain}:`, folderDoc);
            if (!folderDoc || folderDoc.deletedAt || folderDoc.archivedAt) {
                debugLog(`Folder for ${domain} is invalid. Recreating...`);
                parentDocumentId = await createDomainFolder(outlineApi, domain, collectionId, tab);
                domainFolders[domain] = parentDocumentId;
                await setLocalStorage({ domainFolders });
            } else {
                parentDocumentId = existingFolderId;
                debugLog(`Found valid folder for ${domain}: ${parentDocumentId}`);
            }
        } else {
            parentDocumentId = await createDomainFolder(outlineApi, domain, collectionId, tab);
            domainFolders[domain] = parentDocumentId;
            await setLocalStorage({ domainFolders });
            debugLog(`Created and saved folder for ${domain} with ID: ${parentDocumentId}`);
        }
    }
    return parentDocumentId;
}
