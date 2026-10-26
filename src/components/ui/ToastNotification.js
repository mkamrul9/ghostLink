export default class ToastNotification {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        this.container.setAttribute('role', 'status');
        this.container.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.container);
    }
    show(message, type = 'info', duration = 4500) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${['info', 'success', 'error', 'warning'].includes(type) ? type : 'info'}`;
        toast.textContent = message;
        this.container.appendChild(toast);
        toast.classList.add('toast-visible');
        while (this.container.children.length > 4) this.container.firstChild.remove();
        setTimeout(() => toast.remove(), duration);
    }
    confirm(message) {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'toast-dialog';
            dialog.setAttribute('aria-label', 'Confirm action');
            const text = document.createElement('p');
            text.textContent = message;
            const actions = document.createElement('div');
            actions.className = 'toast-dialog-actions';
            for (const [label, value] of [['Cancel', false], ['Confirm', true]]) {
                const button = document.createElement('button');
                button.className = `btn ${value ? 'btn-primary' : ''}`;
                button.textContent = label;
                button.onclick = () => { dialog.close(); dialog.remove(); resolve(value); };
                actions.appendChild(button);
            }
            dialog.append(text, actions);
            dialog.oncancel = () => { dialog.remove(); resolve(false); };
            document.body.appendChild(dialog);
            dialog.showModal();
        });
    }
}
