import Component from '../Component.js';
import { escapeHtml } from '../../utils/format.js';
import { icon } from '../../utils/icons.js';
export const helpTopics = [
    { question: 'How do I send files?', answer: 'Create a room, share the invite, and wait for the other device to connect. Add files or a folder, select what you want, then choose Send.' },
    { question: 'How do I receive files?', answer: 'Open the invite link, or paste the room code into Join room. Keep this page open. When the sender finishes, open Received files and choose Download.' },
    { question: 'Can I share a room in WhatsApp or another app?', answer: 'Yes. Choose Share room to use your device sharing options, WhatsApp, Telegram, or email. You can also copy the invite link or just the room code. Both people must use the same Mystic website.' },
    { question: 'How do I send or download a folder?', answer: 'Choose Add folder. Its files keep their folder paths when sent. In Received files, use the download icon beside a folder to save it as a ZIP file. Open that ZIP on your device to restore the folders.' },
    { question: 'Can I rename or move files?', answer: 'Use the pencil beside a file to rename it. Select files and choose Move to folder to organize them. This changes your Mystic list; it does not change the original files on your computer.' },
    { question: 'Can I close the page while a file is sending?', answer: 'Keep both pages open until the transfer says Done. If the connection stops, connect again and choose Try again. After refreshing the page, you may need to add the original file again.' },
    { question: 'Why will the other device not connect?', answer: 'Check that both devices are online and using the same website and room code. A room holds two devices. Try another network if it still fails. An invite starting with localhost works only on the same computer.' },
    { question: 'Where are my received files kept?', answer: 'They stay in this browser until you download or delete them. They are not backed up online. Clearing this website data removes those copies. Anyone using this browser profile can open them.' },
    { question: 'How large can my files be?', answer: 'The default limit is 256 MB per file. You can add up to 500 files at a time. Folder downloads are limited to 256 MB in total to help your browser stay responsive.' },
    { question: 'What can Pip do?', answer: 'Pip is a free built-in helper that explains Mystic and finds files you have already added. Try "send report.pdf" or "send all photos". Review the files, then press Send. It cannot search your computer or read file contents.' },
    { question: 'Are files sent to a cloud server?', answer: 'File contents go between the two connected devices through an encrypted connection. The connection service helps the devices find each other. A relay may carry encrypted traffic when a direct connection is not possible.' }
];
export default class HelpPanel extends Component {
    static watch = [];
    initialState() { return { search: '' }; }
    template() {
        const topics = helpTopics.filter(topic => `${topic.question} ${topic.answer}`.toLowerCase().includes(this.state.search.toLowerCase()));
        return `<div class="help-content"><div class="tutorial-cards">${[['send', 'send', 'Send files'], ['receive', 'download', 'Receive files'], ['organize', 'folder', 'Organize folders']].map(([type, name, label]) => `<button class="tutorial-card" data-tour="${type}">${icon(name)}<strong>${label}</strong><span>Show me ${icon('arrow')}</span></button>`).join('')}</div><h2>Common questions</h2><label class="search-field">${icon('search')}<input type="search" aria-label="Search help" data-preserve="help-search" placeholder="Search help" value="${escapeHtml(this.state.search)}" /></label><div class="faq-list">${topics.length ? topics.map(topic => `<details><summary>${escapeHtml(topic.question)}${icon('chevron')}</summary><p>${escapeHtml(topic.answer)}</p></details>`).join('') : '<p class="empty-state">No answers found. Try a different word.</p>'}</div><button class="btn" data-assistant>${icon('assistant')}Ask Pip</button></div>`;
    }
    events() { return [{ type: 'input', selector: 'input', handler: event => this.setState({ search: event.target.value }) }, { type: 'click', selector: '[data-tour]', handler: event => this.props.onTutorial(event.currentTarget.dataset.tour) }, { type: 'click', selector: '[data-assistant]', handler: () => this.props.onAssistant() }]; }
}
