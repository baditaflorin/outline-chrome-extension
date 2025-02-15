// options.js
import { getSettings, set as saveToStorage } from './storageManager.js';

document.addEventListener("DOMContentLoaded", () => {
    class OptionsController {
        constructor() {
            // Cache DOM elements.
            this.outlineUrlInput = document.getElementById("outlineUrl");
            this.apiTokenInput = document.getElementById("apiToken");
            this.toggleBtn = document.getElementById("toggleToken");
            this.connectionStatusDiv = document.getElementById("connectionStatus");
            this.settingsForm = document.getElementById("settings-form");

            // Bind event handlers.
            this.toggleTokenVisibility = this.toggleTokenVisibility.bind(this);
            this.saveSettings = this.saveSettings.bind(this);
            this.checkConnection = this.checkConnection.bind(this);

            // Attach listeners.
            this.toggleBtn.addEventListener("click", this.toggleTokenVisibility);
            this.settingsForm.addEventListener("submit", this.saveSettings);
            document.getElementById("checkConnection").addEventListener("click", this.checkConnection);

            // Initialize settings.
            this.loadSettings();
        }

        /**
         * Masks a token, leaving the last 5 characters visible.
         * @param {string} token - The API token.
         * @returns {string} The masked token.
         */
        maskToken(token) {
            return token.length > 5 ? "*".repeat(token.length - 5) + token.slice(-5) : token;
        }

        loadSettings() {
            getSettings()
                .then((result) => {
                    if (result.outlineUrl) {
                        this.outlineUrlInput.value = result.outlineUrl;
                    }
                    if (result.apiToken) {
                        this.apiTokenInput.dataset.fullToken = result.apiToken;
                        this.apiTokenInput.value = this.maskToken(result.apiToken);
                        this.apiTokenInput.readOnly = true;
                        this.toggleBtn.textContent = "Show";
                    }
                })
                .catch((err) => {
                    console.error("Error loading settings:", err);
                });
        }

        toggleTokenVisibility() {
            if (this.toggleBtn.textContent === "Show") {
                this.apiTokenInput.value = this.apiTokenInput.dataset.fullToken;
                this.apiTokenInput.readOnly = false;
                this.toggleBtn.textContent = "Hide";
            } else {
                const token = this.apiTokenInput.value;
                this.apiTokenInput.dataset.fullToken = token;
                this.apiTokenInput.value = this.maskToken(token);
                this.apiTokenInput.readOnly = true;
                this.toggleBtn.textContent = "Show";
            }
        }

        saveSettings(e) {
            e.preventDefault();
            let outlineUrl = this.outlineUrlInput.value.trim();
            const apiToken = this.apiTokenInput.readOnly
                ? this.apiTokenInput.dataset.fullToken
                : this.apiTokenInput.value.trim();
            if (!outlineUrl || !apiToken) {
                alert("Both the Outline API Base URL and API token are required.");
                return;
            }
            if (!/^https?:\/\//.test(outlineUrl)) {
                alert("Please enter a valid URL (must start with http:// or https://).");
                return;
            }
            outlineUrl = outlineUrl.replace(/\/+$/, '');
            saveToStorage({ outlineUrl, apiToken }, true)
                .then(() => alert("Settings saved!"))
                .catch((err) => {
                    console.error("Error saving settings:", err);
                    alert("Error saving settings.");
                });
        }

        async checkConnection() {
            this.connectionStatusDiv.textContent = "Checking connection...";
            const baseUrl = this.outlineUrlInput.value.trim().replace(/\/+$/, '');
            const token = this.apiTokenInput.readOnly
                ? this.apiTokenInput.dataset.fullToken
                : this.apiTokenInput.value.trim();
            if (!baseUrl || !token) {
                this.connectionStatusDiv.textContent = "Please provide both the API Base URL and token.";
                return;
            }
            const testEndpoint = `${baseUrl}/api/auth.info`;
            try {
                const response = await fetch(testEndpoint, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                if (response.ok) {
                    this.connectionStatusDiv.textContent = "Connection successful!";
                } else {
                    this.connectionStatusDiv.textContent = `Connection failed: ${response.status} ${response.statusText}`;
                }
            } catch (err) {
                this.connectionStatusDiv.textContent = `Connection error: ${err.message}`;
            }
        }
    }

    // Initialize the OptionsController.
    new OptionsController();
});
