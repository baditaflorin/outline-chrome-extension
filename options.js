document.addEventListener("DOMContentLoaded", () => {
    // Load saved settings
    chrome.storage.sync.get(["outlineUrl", "apiToken"], (result) => {
        if (result.outlineUrl) {
            document.getElementById("outlineUrl").value = result.outlineUrl;
        }
        if (result.apiToken) {
            document.getElementById("apiToken").value = result.apiToken;
        }
    });

    // Save settings on form submit
    document.getElementById("settings-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const outlineUrl = document.getElementById("outlineUrl").value.trim();
        const apiToken = document.getElementById("apiToken").value.trim();

        if (!outlineUrl || !apiToken) {
            alert("Both the Outline API URL and API token are required.");
            return;
        }

        chrome.storage.sync.set({ outlineUrl, apiToken }, () => {
            alert("Settings saved!");
        });
    });
});
