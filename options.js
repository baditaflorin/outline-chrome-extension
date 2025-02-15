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
            // Store the full token in a data attribute.
            apiTokenInput.dataset.fullToken = result.apiToken;
            // Display a masked version: show only the last 5 characters.
            const token = result.apiToken;
            const masked = token.length > 5 ? "*".repeat(token.length - 5) + token.slice(-5) : token;
            apiTokenInput.value = masked;
            // Make the field read-only so that the user cannot edit the masked value accidentally.
            apiTokenInput.readOnly = true;
            toggleBtn.textContent = "Show";
        }
    });

    // Toggle token reveal/hide functionality.
    toggleBtn.addEventListener("click", () => {
        if (toggleBtn.textContent === "Show") {
            // Reveal the full token.
            apiTokenInput.value = apiTokenInput.dataset.fullToken;
            apiTokenInput.readOnly = false;
            toggleBtn.textContent = "Hide";
        } else {
            // Hide (mask) the token again, showing only the last 5 characters.
            const token = apiTokenInput.value;
            // Update the stored full token in case the user edited it.
            apiTokenInput.dataset.fullToken = token;
            const masked = token.length > 5 ? "*".repeat(token.length - 5) + token.slice(-5) : token;
            apiTokenInput.value = masked;
            apiTokenInput.readOnly = true;
            toggleBtn.textContent = "Show";
        }
    });

    // Save settings on form submission.
    document.getElementById("settings-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const outlineUrl = outlineUrlInput.value.trim();
        // When saving, use the full token (from the data attribute) if the field is still masked.
        const apiToken = apiTokenInput.readOnly ? apiTokenInput.dataset.fullToken : apiTokenInput.value.trim();
        if (!outlineUrl || !apiToken) {
            alert("Both the Outline API Base URL and API token are required.");
            return;
        }
        chrome.storage.sync.set({ outlineUrl, apiToken }, () => {
            alert("Settings saved!");
        });
    });

    // Check connection button functionality.
    document.getElementById("checkConnection").addEventListener("click", async () => {
        connectionStatusDiv.textContent = "Checking connection...";
        const baseUrl = outlineUrlInput.value.trim().replace(/\/+$/, '');
        // Use the full token from the data attribute if the field is read-only.
        const token = apiTokenInput.readOnly ? apiTokenInput.dataset.fullToken : apiTokenInput.value.trim();
        if (!baseUrl || !token) {
            connectionStatusDiv.textContent = "Please provide both the API Base URL and token.";
            return;
        }
        // Use the correct endpoint for retrieving authentication details.
        const testEndpoint = `${baseUrl}/api/auth.info`;
        try {
            const response = await fetch(testEndpoint, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                connectionStatusDiv.textContent = "Connection successful!";
            } else {
                connectionStatusDiv.textContent = `Connection failed: ${response.status} ${response.statusText}`;
            }
        } catch (err) {
            connectionStatusDiv.textContent = `Connection error: ${err.message}`;
        }
    });
});
