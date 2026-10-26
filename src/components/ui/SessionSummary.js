import Component from '../Component.js';
import { icon } from '../../utils/icons.js';
export default class SessionSummary extends Component {
    static watch = [];
    template() { return `<div class="history-actions"><button class="btn" data-action="export">${icon('download')}Download history</button><button class="btn" data-action="clear">${icon('trash')}Clear history</button></div>`; }
    events() { return [{ type: 'click', selector: '[data-action="export"]', handler: () => this.props.onExport() }, { type: 'click', selector: '[data-action="clear"]', handler: () => this.props.onClear() }]; }
}
