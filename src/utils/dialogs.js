import { escapeHtml } from './format.js';
export function textDialog({ title, label, value = '', hint = '', button = 'Save', allowEmpty = false, validate }) {
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'app-dialog';
        dialog.setAttribute('aria-label', title);
        dialog.innerHTML = `<form class="dialog-form"><h2>${escapeHtml(title)}</h2><label for="dialog-value">${escapeHtml(label)}</label><input id="dialog-value" value="${escapeHtml(value)}" maxlength="1024" ${allowEmpty ? '' : 'required'} autocomplete="off" /><p class="muted">${escapeHtml(hint)}</p><p class="inline-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">${escapeHtml(button)}</button></div></form>`;
        const close = result => { dialog.close(); dialog.remove(); resolve(result); };
        dialog.oncancel = event => { event.preventDefault(); close(null); };
        dialog.querySelector('[data-cancel]').onclick = () => close(null);
        dialog.querySelector('form').onsubmit = event => {
            event.preventDefault();
            const result = dialog.querySelector('input').value.trim();
            try { validate?.(result); close(result); }
            catch (error) { dialog.querySelector('.inline-error').textContent = error.message; }
        };
        document.body.appendChild(dialog); dialog.showModal(); dialog.querySelector('input').select();
    });
}
