// config.js
export const CONTEXT_MENU_ID = "send-to-outline";
export const NOTIFICATION_ICON = "icon.png";
export const FETCH_TIMEOUT = 8000;
export const DEBUG_MODE = true; // Set to false in production.
export const MAX_RETRIES = 3;
export const INITIAL_BACKOFF = 500; // in milliseconds

export class OutlineApiError extends Error {
    constructor(message, status) {
        super(message);
        this.name = "OutlineApiError";
        this.status = status;
    }
}
