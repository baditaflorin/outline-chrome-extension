// outlineAPI.js
// Refactored into a class-based API for improved DRY and encapsulation.
// Change 2: Now you create an instance with outlineUrl and apiToken.

import { FETCH_TIMEOUT, MAX_RETRIES, INITIAL_BACKOFF, OutlineApiError } from './config.js';
import { retryFetch, parseApiError, debugLog, createApiHeaders } from './utils.js';

/**
 * Class representing the Outline API.
 */
export class OutlineAPI {
    /**
     * Creates an instance of OutlineAPI.
     * @param {string} outlineUrl - The base URL for the Outline API.
     * @param {string} apiToken - The API token for authorization.
     */
    constructor(outlineUrl, apiToken) {
        // Normalize the base URL by removing trailing slashes.
        this.baseUrl = outlineUrl.replace(/\/+$/, '');
        this.apiToken = apiToken;
        this.headers = createApiHeaders(apiToken);
    }

    /**
     * Creates a new collection.
     * @param {string} collectionName - The name of the collection.
     * @returns {Promise<string>} - The ID of the created collection.
     */
    async createCollection(collectionName) {
        const endpoint = `${this.baseUrl}/api/collections.create`;
        debugLog("Sending POST request to:", endpoint);
        const response = await retryFetch(endpoint, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({
                name: collectionName,
                description: "",
                permission: "read",
                color: "#123123",
                private: false,
            }),
        });
        if (!response.ok) {
            const errorMsg = await parseApiError(response, "Collection creation failed");
            throw new OutlineApiError(errorMsg, response.status);
        }
        const data = await response.json();
        return data.data.id;
    }

    /**
     * Creates a new document.
     * @param {Object} options - Document options.
     * @param {string} options.title - The document title.
     * @param {string} options.text - The document content.
     * @param {string} options.collectionId - The collection ID.
     * @param {boolean} [options.publish=true] - Whether to publish the document.
     * @param {string} [options.parentDocumentId=""] - Optional parent document ID.
     * @returns {Promise<Object>} - The created document data.
     */
    async createDocument({ title, text, collectionId, publish = true, parentDocumentId = "" }) {
        const endpoint = `${this.baseUrl}/api/documents.create`;
        const payload = { title, text, collectionId, publish };
        if (parentDocumentId && parentDocumentId.trim() !== "") {
            payload.parentDocumentId = parentDocumentId;
        }
        debugLog("Sending request to create document with payload:", payload);
        const response = await retryFetch(endpoint, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorMsg = await parseApiError(response, "Document creation failed");
            throw new OutlineApiError(errorMsg, response.status);
        }
        const data = await response.json();
        return data.data;
    }

    /**
     * Retrieves document details.
     * @param {string} documentId - The document ID.
     * @returns {Promise<Object|null>} - The document data or null if not found.
     */
    async getDocument(documentId) {
        const endpoint = `${this.baseUrl}/api/documents.info`;
        const response = await retryFetch(endpoint, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ id: documentId }),
        });
        if (!response.ok) {
            return null;
        }
        const data = await response.json();
        return data.data;
    }
}
