// domainFolderManager.js
import { getLocalStorage, setLocalStorage, debugLog } from './utils.js';
import { OutlineAPI } from './outlineAPI.js';

export async function getOrCreateDomainFolder(outlineUrl, apiToken, collectionId, tab) {
    let parentDocumentId = "";
    // Create an instance of OutlineAPI
    const outlineApi = new OutlineAPI(outlineUrl, apiToken);

    if (tab && tab.url) {
        const rawDomain = new URL(tab.url).hostname;
        const domain = rawDomain.replace(/^www\./, '');
        let domainFoldersData = await getLocalStorage("domainFolders");
        let domainFolders = domainFoldersData.domainFolders || {};

        if (domainFolders[domain]) {
            const existingFolderId = domainFolders[domain];
            // Use the instance method instead of a static method.
            let folderDoc = await outlineApi.getDocument(existingFolderId);
            debugLog(`Full folder object for ${domain}:`, folderDoc);
            if (!folderDoc || folderDoc.deletedAt || folderDoc.archivedAt) {
                debugLog(`Folder for ${domain} is either missing, deleted, or archived. Recreating...`);
                const newFolder = await outlineApi.createDocument({
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
            const folderDoc = await outlineApi.createDocument({
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
    return parentDocumentId;
}
