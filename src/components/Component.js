import Store from '../store/Store.js';

export default class Component {
    constructor(props = {}) {
        this.props = props;
        this.state = this.initialState();
        this.element = null;
        this.boundEvents = [];
        if (props.store instanceof Store) {
            this._unsubscribeStore = props.store.events.subscribe('stateChange', (_state, key) => {
                if (!this.constructor.watch || this.constructor.watch.includes(key)) this.update();
            });
        }
    }
    initialState() { return {}; }
    template() { return ''; }
    onMount() {}
    onUnmount() {}
    setState(patch) { this.state = { ...this.state, ...patch }; this.update(); }
    createDOM() {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = this.template().trim();
        return wrapper.firstElementChild;
    }
    render() { this.element = this.createDOM(); this.bindEvents(); return this.element; }
    update() {
        if (!this.element) return;
        // Keep drafts and keyboard focus when an unrelated live update renders a panel.
        const saved = [...this.element.querySelectorAll('[data-preserve]')].map(input => ({ name: input.getAttribute('data-preserve'), value: input.value, start: input.selectionStart, end: input.selectionEnd, focused: input === document.activeElement }));
        const scrollPositions = [...this.element.querySelectorAll('[data-scroll]')].map(node => ({ name: node.dataset.scroll, top: node.scrollTop }));
        const scroll = this.element.querySelector('.chat-list');
        const atBottom = scroll && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40;
        const newElement = this.createDOM();
        this.element.replaceWith(newElement);
        this.element = newElement;
        this.bindEvents();
        for (const item of saved) {
            const input = [...this.element.querySelectorAll('[data-preserve]')].find(node => node.getAttribute('data-preserve') === item.name);
            if (!input) continue;
            input.value = item.value;
            if (item.focused) {
                input.focus({ preventScroll: true });
                if (typeof item.start === 'number') input.setSelectionRange(item.start, item.end);
            }
        }
        for (const item of scrollPositions) this.element.querySelectorAll('[data-scroll]').forEach(node => { if (node.dataset.scroll === item.name) node.scrollTop = item.top; });
        const nextScroll = this.element.querySelector('.chat-list');
        if (nextScroll) nextScroll.scrollTop = atBottom ? nextScroll.scrollHeight : scroll?.scrollTop || 0;
    }
    events() { return []; }
    bindEvents() {
        this.boundEvents.forEach(({ target, type, listener }) => target.removeEventListener(type, listener));
        this.boundEvents = [];
        for (const { type, selector, handler } of this.events()) {
            const targets = selector ? this.element.querySelectorAll(selector) : [this.element];
            for (const target of targets) {
                const listener = handler.bind(this);
                target.addEventListener(type, listener);
                this.boundEvents.push({ target, type, listener });
            }
        }
    }
    mount(container) { container.appendChild(this.render()); this.onMount(); }
    unmount() {
        this.onUnmount();
        this._unsubscribeStore?.();
        this.boundEvents.forEach(({ target, type, listener }) => target.removeEventListener(type, listener));
        this.element?.remove();
    }
}
