export default class ToastNotification {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    /**
     * @param {string} message 
     * @param {string} type 'info', 'success', 'error', 'warning'
     * @param {number} duration ms 
     */
    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">${message}</div>
        `;

        this.container.appendChild(toast);

        // Force a reflow for the animation to trigger
        void toast.offsetWidth;

        toast.classList.add('toast-visible');

        setTimeout(() => {
            toast.classList.remove('toast-visible');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300); // Wait for CSS fade out
        }, duration);
    }

    /**
     * Custom styled confirm dialog using Promises
     */
    async confirm(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'toast-overlay';
            
            const dialog = document.createElement('div');
            dialog.className = 'toast-dialog';
            
            dialog.innerHTML = `
                <div class="toast-dialog-message">${message}</div>
                <div class="toast-dialog-actions">
                    <button class="btn btn-small btn-cancel">Cancel</button>
                    <button class="btn btn-small btn-danger btn-confirm">Confirm</button>
                </div>
            `;
            
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            // Animate in
            void overlay.offsetWidth;
            overlay.classList.add('visible');
            dialog.classList.add('visible');
            
            const close = (result) => {
                overlay.classList.remove('visible');
                dialog.classList.remove('visible');
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    resolve(result);
                }, 300);
            };
            
            dialog.querySelector('.btn-cancel').onclick = () => close(false);
            dialog.querySelector('.btn-confirm').onclick = () => close(true);
        });
    }
}
