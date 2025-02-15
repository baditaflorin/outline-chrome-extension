// overlays.js
export function showProgressOverlay() {
    if (document.getElementById('outline-progress-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'outline-progress-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '999999';

    const spinner = document.createElement('div');
    spinner.style.border = '16px solid #f3f3f3';
    spinner.style.borderTop = '16px solid #3498db';
    spinner.style.borderRadius = '50%';
    spinner.style.width = '80px';
    spinner.style.height = '80px';
    spinner.classList.add("outline-spinner");
    overlay.appendChild(spinner);

    const style = document.createElement('style');
    style.textContent = `
    @keyframes outline-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes color-change {
      0% { border-top-color: #3498db; }
      50% { border-top-color: #e74c3c; }
      100% { border-top-color: #3498db; }
    }
    .outline-spinner {
      animation: outline-spin 2s linear infinite, color-change 2s linear infinite;
    }
  `;
    overlay.appendChild(style);

    const text = document.createElement('div');
    text.id = 'outline-progress-text';
    text.textContent = 'Sending to Outline...';
    text.style.color = '#fff';
    text.style.fontSize = '20px';
    text.style.marginTop = '20px';
    overlay.appendChild(text);

    document.body.appendChild(overlay);
}

export function showSuccessOverlay() {
    const overlay = document.getElementById('outline-progress-overlay');
    if (overlay) {
        overlay.innerHTML = '';
        const checkmark = document.createElement('div');
        checkmark.textContent = '✔';
        checkmark.style.fontSize = '64px';
        checkmark.style.color = '#2ecc71';
        checkmark.style.opacity = '0';
        checkmark.style.transition = 'opacity 0.5s ease-in-out';
        overlay.appendChild(checkmark);
        setTimeout(() => { checkmark.style.opacity = '1'; }, 100);
        const message = document.createElement('div');
        message.textContent = 'Document created successfully!';
        message.style.color = '#fff';
        message.style.fontSize = '20px';
        message.style.marginTop = '20px';
        message.style.opacity = '0';
        message.style.transition = 'opacity 0.5s ease-in-out';
        overlay.appendChild(message);
        setTimeout(() => { message.style.opacity = '1'; }, 100);
        setTimeout(() => {
            overlay.style.transition = 'opacity 0.5s ease-in-out';
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.remove(); }, 500);
        }, 2000);
    }
}

export function showErrorOverlay(errorMessage) {
    const overlay = document.getElementById('outline-progress-overlay');
    if (overlay) {
        overlay.innerHTML = '';
        const cross = document.createElement('div');
        cross.textContent = '✖';
        cross.style.fontSize = '64px';
        cross.style.color = '#e74c3c';
        cross.style.opacity = '0';
        cross.style.transition = 'opacity 0.5s ease-in-out';
        overlay.appendChild(cross);
        setTimeout(() => { cross.style.opacity = '1'; }, 100);
        const message = document.createElement('div');
        message.textContent = errorMessage || 'An error occurred.';
        message.style.color = '#fff';
        message.style.fontSize = '20px';
        message.style.marginTop = '20px';
        message.style.opacity = '0';
        message.style.transition = 'opacity 0.5s ease-in-out';
        overlay.appendChild(message);
        setTimeout(() => { message.style.opacity = '1'; }, 100);
        setTimeout(() => {
            overlay.style.transition = 'opacity 0.5s ease-in-out';
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.remove(); }, 500);
        }, 2000);
    }
}
