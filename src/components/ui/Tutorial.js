import { icon } from '../../utils/icons.js';
const tours = {
    messages: [
        {title:'Connect your devices',text:'Create a room and share its invite. Keep Mystic open on each device.',icon:'share',preview:'Share room',target:'room',view:'dashboard'},
        {title:'Open Messages',text:'Choose Messages in the main menu. Notes and links go to everyone connected to this room.',icon:'chat',preview:'Messages',view:'messages'},
        {title:'Send and keep a copy',text:'Write your message and press Send. Delivered confirms arrival at the other app. Search or save room messages on this device when you need them later.',icon:'check',preview:'Delivered',view:'messages'}
    ],
    send: [
        { title: 'Create a room', text: 'Choose Create a room. A room connects your two devices.', icon: 'plus', preview: 'Create a room', target: 'room', view: 'dashboard' },
        { title: 'Invite the other device', text: 'Choose Share room or Copy invite link. Open the invite on the other device and wait for Device connected.', icon: 'share', preview: 'Share room', target: 'room', view: 'dashboard' },
        { title: 'Add your files', text: 'Choose Add files or Add folder. You can also drop files into the box.', icon: 'folder', preview: 'Add files     Add folder', target: 'add', view: 'dashboard' },
        { title: 'Choose and send', text: 'Tick the files you want to share, then press Send. Keep both pages open until the transfer finishes.', icon: 'send', preview: 'Send selected files', target: 'files', view: 'dashboard' },
        { title: 'Download on the other device', text: 'On the receiving device, open Received files. Download individual files or download a whole folder together.', icon: 'download', preview: 'Received files', target: 'received', view: 'vault' }
    ],
    receive: [
        { title: 'Open the invite', text: 'Open the link you were sent. You can also paste the room code into Join room on the same Mystic website.', icon: 'link', preview: 'Room code or invite link', target: 'room', view: 'dashboard' },
        { title: 'Wait for the sender', text: 'Keep this page open. The sender chooses the files and presses Send. You can check progress in Transfers.', icon: 'transfer', preview: 'Transfers', view: 'transfers' },
        { title: 'Download your files', text: 'Open Received files and choose Download. A folder download saves a ZIP file that keeps the folders together.', icon: 'download', preview: 'Download selected', target: 'received', view: 'vault' }
    ],
    organize: [
        { title: 'Add files and folders', text: 'Choose Add files or Add folder. Folders appear as groups that you can open and close.', icon: 'folder', preview: 'Project / photos / picture.jpg', target: 'add', view: 'dashboard' },
        { title: 'Select, rename, or move', text: 'Tick files or a whole folder. Choose Move to folder to group them, or use the pencil to rename a file.', icon: 'edit', preview: 'Move to folder', target: 'files', view: 'dashboard' },
        { title: 'Keep folders when downloading', text: 'On the receiving device, use the download icon beside a folder. Open the downloaded ZIP to get the same folder layout.', icon: 'download', preview: 'Download folder', target: 'received', view: 'vault' }
    ]
};
export default function showTutorial(type, onShow) {
    const steps = tours[type] || tours.send;
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog tutorial-dialog';
    dialog.setAttribute('aria-label', 'Mystic tutorial');
    let index = 0;
    const close = () => { dialog.close(); dialog.remove(); };
    function render() {
        const step = steps[index];
        dialog.innerHTML = `<div class="tutorial-top"><span>Step ${index + 1} of ${steps.length}</span><button class="icon-button" aria-label="Close tutorial" data-close>${icon('close')}</button></div><div class="tutorial-progress">${steps.map((_, position) => `<span class="${position <= index ? 'is-filled' : ''}"></span>`).join('')}</div><div class="tutorial-preview">${icon(step.icon)}<span>${step.preview}</span></div><h2>${step.title}</h2><p>${step.text}</p><button class="text-button" data-show>Show this in the app ${icon('arrow')}</button><div class="dialog-actions"><button class="btn" data-back ${index ? '' : 'disabled'}>${icon('back')}Back</button><button class="btn btn-primary" data-next>${index === steps.length - 1 ? 'Done' : 'Next'}${icon(index === steps.length - 1 ? 'check' : 'arrow')}</button></div>`;
        dialog.querySelector('[data-close]').onclick = close;
        dialog.querySelector('[data-back]').onclick = () => { index--; render(); };
        dialog.querySelector('[data-next]').onclick = () => { if (index === steps.length - 1) close(); else { index++; render(); } };
        dialog.querySelector('[data-show]').onclick = () => { close(); onShow(step.view, step.target); };
    }
    dialog.oncancel = event => { event.preventDefault(); close(); };
    render(); document.body.appendChild(dialog); dialog.showModal();
}
