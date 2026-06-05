import Component from '../Component.js';
import { handleDroppedItems } from '../../helpers/FileSystemHelper.js';

export default class DropZone extends Component {
    initialState() {
        return { isDragging: false };
    }

    template() {
        const dragClass = this.state.isDragging ? 'drop-zone active-drag' : 'drop-zone';

        return `
            <div class="${dragClass}">
                <div class="drop-zone__inner">
                    <h2>Drag & Drop Files or Folders Here</h2>
                    <p>GhostLink will automatically parse your folder structure.</p>
                    <div class="drop-zone__cta">
                        <span class="tag">Encrypted</span>
                        <span class="tag">Chunked</span>
                        <span class="tag">P2P</span>
                    </div>
                </div>
      </div>
    `;
    }

    events() {
        return [
            { type: 'dragover', handler: this.onDragOver },
            { type: 'dragleave', handler: this.onDragLeave },
            { type: 'drop', handler: this.onDrop }
        ];
    }

    onDragOver(e) {
        e.preventDefault(); // Required to allow dropping
        if (!this.state.isDragging) {
            this.setState({ isDragging: true });
        }
    }

    onDragLeave(e) {
        e.preventDefault();
        this.setState({ isDragging: false });
    }

    async onDrop(e) {
        e.preventDefault();
        this.setState({ isDragging: false });

        console.log('Parsing dropped items...');

        // 1. Extract files recursively using our helper
        const extractedFiles = await handleDroppedItems(e.dataTransfer);

        console.log(`Successfully parsed ${extractedFiles.length} files.`);

        // 2. Update the Global Store (Phase 2 integration)
        // Assuming this.props.store was passed in, we append the new files
        const currentFiles = this.props.store.state.files || [];
        this.props.store.state.files = [...currentFiles, ...extractedFiles];

        // If the P2P pipeline is ready, stream the dropped files to the other peer
        try {
            if (typeof window !== 'undefined' && typeof window.sendFiles === 'function' && extractedFiles.length > 0) {
                console.log(`Sending ${extractedFiles.length} file(s) to peer...`);
                window.sendFiles(extractedFiles).catch(err => console.error('sendFiles error:', err));
            } else if (typeof window !== 'undefined' && typeof window.testChunker === 'function' && extractedFiles.length > 0) {
                // Fallback: run chunker test if P2P not yet ready
                window.testChunker(extractedFiles[0]).catch(err => console.error('testChunker error:', err));
            }
        } catch (err) {
            console.error('Error sending files:', err);
        }
    }
}

