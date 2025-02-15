// overlays.js

export function showProgressOverlay() {
    // Inject minimal global animation keyframes once.
    function ensureOverlayStyles() {
        if (document.getElementById('outline-overlay-styles')) return;
        const style = document.createElement('style');
        style.id = 'outline-overlay-styles';
        style.textContent = `
      /* Spinner rotation */
      @keyframes outlineSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      /* Subtle pulse effect */
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      /* PopIn: scale and fade in */
      @keyframes popIn {
        0% { transform: scale(0); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
      /* Carve out animation for extracted content */
      @keyframes carveOut {
        0% { transform: translateY(0); opacity: 1; }
        100% { transform: translateY(-10px); opacity: 0; }
      }
      /* Shake animation for error feedback */
      @keyframes shake {
        0% { transform: translateX(0); }
        25% { transform: translateX(-4px); }
        50% { transform: translateX(4px); }
        75% { transform: translateX(-4px); }
        100% { transform: translateX(0); }
      }
    `;
        document.head.appendChild(style);
    }

    // Get the bounding rectangle of the current text selection.
    function getSelectionRect() {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            return selection.getRangeAt(0).getBoundingClientRect();
        }
        return null;
    }

    // Animate extracted selected content with a "carve out" effect.
    function animateExtractedSelection() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        const range = selection.getRangeAt(0);
        // Extract content from the document.
        const extractedFragment = range.extractContents();
        // Wrap it in a container.
        const container = document.createElement('span');
        container.appendChild(extractedFragment);
        container.style.display = 'inline-block';
        container.style.animation = 'carveOut 0.5s forwards';
        return { container, range };
    }

    ensureOverlayStyles();

    // If there is a selection, extract and animate it.
    const selRect = getSelectionRect();
    let extractedData = null;
    if (selRect) {
        extractedData = animateExtractedSelection();
    }

    // Prevent duplicate overlays.
    if (document.getElementById('outline-progress-overlay')) return;

    // Create the overlay container.
    const overlay = document.createElement('div');
    overlay.id = 'outline-progress-overlay';
    overlay.style.position = 'fixed';
    if (selRect) {
        const padding = 20;
        overlay.style.top = (selRect.top - padding) + "px";
        overlay.style.left = (selRect.left - padding) + "px";
        overlay.style.width = (selRect.width + padding * 2) + "px";
        overlay.style.height = (selRect.height + padding * 2) + "px";
    } else {
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
    }
    // Use a nearly transparent grey background.
    overlay.style.background = "rgba(250,250,250,0)";
    overlay.style.zIndex = "999999";
    overlay.style.overflow = "hidden";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    // Create a refined minimal spinner.
    const spinner = document.createElement('div');
    spinner.style.border = '6px solid rgba(128,128,128,0)';
    spinner.style.borderTop = '6px solid #555';
    spinner.style.borderRadius = '50%';
    spinner.style.width = '60px';
    spinner.style.height = '60px';
    spinner.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
    spinner.style.animation = 'outlineSpin 1.5s linear infinite, pulse 1.5s ease-in-out infinite';
    overlay.appendChild(spinner);

    // A minimal note.
    const note = document.createElement('div');
    note.innerText = "Processing...";
    note.style.background = "rgba(255,255,255,0.95)";
    note.style.padding = "10px 20px";
    note.style.borderRadius = "6px";
    note.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
    note.style.fontSize = "18px";
    note.style.color = "#333";
    note.style.fontFamily = "-apple-system, BlinkMacSystemFont, sans-serif";
    note.style.position = "absolute";
    note.style.top = "calc(50% - 20px)";
    note.style.left = "calc(50% - 80px)";
    note.style.transition = "all 0.5s ease-out";
    note.style.animation = "popIn 0.4s ease-out forwards";
    overlay.appendChild(note);

    // Append extracted content if available.
    if (extractedData) {
        overlay.appendChild(extractedData.container);
    }

    document.body.appendChild(overlay);

    // Restore extracted content after the carve-out animation.
    if (extractedData) {
        setTimeout(() => {
            extractedData.range.insertNode(extractedData.container.firstChild);
        }, 500);
    }

    // Remove the overlay after the animation completes.
    setTimeout(() => {
        overlay.remove();
    }, 2500);
}

export function showSuccessOverlay() {
    const overlay = document.getElementById('outline-progress-overlay');
    if (overlay) {
        overlay.innerHTML = '';

        // A minimal check mark to indicate success.
        const checkMark = document.createElement('div');
        checkMark.textContent = '✓';
        checkMark.style.fontSize = '70px';
        checkMark.style.color = '#555';
        checkMark.style.animation = 'popIn 0.4s ease-out forwards';
        overlay.appendChild(checkMark);

        const message = document.createElement('div');
        message.textContent = 'Your document is processed!';
        message.style.color = '#333';
        message.style.fontSize = '20px';
        message.style.marginTop = '10px';
        message.style.fontFamily = "-apple-system, BlinkMacSystemFont, sans-serif";
        message.style.background = "rgba(255, 255, 255, 0.95)";
        message.style.padding = "8px 16px";
        message.style.borderRadius = "6px";
        message.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
        overlay.appendChild(message);

        // Fade out the overlay by scaling it down.
        setTimeout(() => {
            overlay.style.transition = 'transform 0.5s ease-in-out';
            overlay.style.transform = 'scale(0)';
            setTimeout(() => { overlay.remove(); }, 500);
        }, 2500);
    }
}

export function showErrorOverlay(errorMessage) {
    const overlay = document.getElementById('outline-progress-overlay');
    if (overlay) {
        overlay.innerHTML = '';

        // A minimal error icon.
        const errorIcon = document.createElement('div');
        errorIcon.textContent = '✕';
        errorIcon.style.fontSize = '70px';
        errorIcon.style.color = '#555';
        errorIcon.style.animation = 'popIn 0.4s ease-out forwards, shake 0.4s ease-in-out';
        overlay.appendChild(errorIcon);

        const message = document.createElement('div');
        message.textContent = errorMessage || 'Oh no! Something went wrong.';
        message.style.color = '#333';
        message.style.fontSize = '20px';
        message.style.marginTop = '10px';
        message.style.fontFamily = "-apple-system, BlinkMacSystemFont, sans-serif";
        overlay.appendChild(message);

        setTimeout(() => {
            overlay.style.transition = 'transform 0.5s ease-in-out';
            overlay.style.transform = 'scale(0)';
            setTimeout(() => { overlay.remove(); }, 500);
        }, 2500);
    }
}
