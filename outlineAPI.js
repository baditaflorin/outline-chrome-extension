// outlineAPI.js
import { FETCH_TIMEOUT, MAX_RETRIES, INITIAL_BACKOFF } from './config.js';
import { retryFetch, parseApiError, debugLog } from './utils.js';
import { OutlineApiError } from './config.js';

function normalizeUrl(outlineUrl) {
    return outlineUrl.replace(/\/+$/, '');
}

export const OutlineAPI = {
    async createCollection(outlineUrl, apiToken, collectionName) {
        const base = normalizeUrl(outlineUrl);
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
        const base = normalizeUrl(outlineUrl);
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

    async getDocument(outlineUrl, apiToken, documentId) {
        const base = normalizeUrl(outlineUrl);
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
