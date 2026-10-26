import PubSub from './PubSub.js';
export default class Store {
    constructor({ initialState = {} } = {}) {
        this.events = new PubSub();
        this.state = new Proxy(initialState, {
            set: (state, key, value) => {
                Reflect.set(state, key, value);
                this.events.publish('stateChange', this.state, key);
                return true;
            }
        });
    }
}
