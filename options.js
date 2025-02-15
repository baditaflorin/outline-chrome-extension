document.addEventListener("DOMContentLoaded", () => {
    const outlineUrlInput = document.getElementById("outlineUrl");
    const apiTokenInput = document.getElementById("apiToken");
    const toggleBtn = document.getElementById("toggleToken");
    const connectionStatusDiv = document.getElementById("connectionStatus");

    // Load saved settings from storage.
    chrome.storage.sync.get(["outlineUrl", "apiToken"], (result) => {
        if (result.outlineUrl) {
            outlineUrlInput.value = result.outlineUrl;
        }
        if (result.apiToken) {
            apiTokenInput.dataset.fullToken = result.apiToken;
            const token = result.apiToken;
            const masked = token.length > 5 ? "*".repeat(token.length - 5) + token.slice(-5) : token;
            apiTokenInput.value = masked;
            apiTokenInput.readOnly = true;
            toggleBtn.textContent = "Show";
        }
    });

    // Toggle token reveal/hide functionality.
    toggleBtn.addEventListener("click", () => {
        if (toggleBtn.textContent === "Show") {
            apiTokenInput.value = apiTokenInput.dataset.fullToken;
            apiTokenInput.readOnly = false;
            toggleBtn.textContent = "Hide";
        } else {
            const token = apiTokenInput.value;
            apiTokenInput.dataset.fullToken = token;
            const masked = token.length > 5 ? "*".repeat(token.length - 5) + token.slice(-5) : token;
            apiTokenInput.value = masked;
            apiTokenInput.readOnly = true;
            toggleBtn.textContent = "Show";
        }
    });

    // Save settings on form submission with URL validation.
    document.getElementById("settings-form").addEventListener("submit", (e) => {
        e.preventDefault();
        let outlineUrl = outlineUrlInput.value.trim();
        const apiToken = apiTokenInput.readOnly ? apiTokenInput.dataset.fullToken : apiTokenInput.value.trim();
        if (!outlineUrl || !apiToken) {
            alert("Both the Outline API Base URL and API token are required.");
            return;
        }
        // Validate that the URL starts with http:// or https://
        if (!/^https?:\/\//.test(outlineUrl)) {
            alert("Please enter a valid URL (must start with http:// or https://).");
            return;
        }
        // Normalize URL by removing trailing slashes.
        outlineUrl = outlineUrl.replace(/\/+$/, '');
        chrome.storage.sync.set({ outlineUrl, apiToken }, () => {
            alert("Settings saved!");
        });
    });

    // Check connection button functionality.
    document.getElementById("checkConnection").addEventListener("click", async () => {
        connectionStatusDiv.textContent = "Checking connection...";
        const baseUrl = outlineUrlInput.value.trim().replace(/\/+$/, '');
        const token = apiTokenInput.readOnly ? apiTokenInput.dataset.fullToken : apiTokenInput.value.trim();
        if (!baseUrl || !token) {
            connectionStatusDiv.textContent = "Please provide both the API Base URL and token.";
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
                connectionStatusDiv.textContent = "Connection successful!";
            } else {
                connectionStatusDiv.textContent = `Connection failed: ${response.status} ${response.statusText}`;
            }
        } catch (err) {
            connectionStatusDiv.textContent = `Connection error: ${err.message}`;
        }
    });
});
