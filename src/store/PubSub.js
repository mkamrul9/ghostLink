export default class PubSub {
    constructor() {
        this.events = {};
    }

    // Components will 'subscribe' to state changes
    subscribe(event, callback) {
        if (!this.events.hasOwnProperty(event)) {
            this.events[event] = [];
        }
        const list = this.events[event];
        list.push(callback);
        // Return an unsubscribe function so callers can remove the listener
        return () => {
            const idx = list.indexOf(callback);
            if (idx !== -1) list.splice(idx, 1);
        };
    }

    // The Store will 'publish' when the Proxy detects a change
    publish(event, ...args) {
        if (!this.events.hasOwnProperty(event)) {
            return [];
        }
        return this.events[event].map(callback => callback(...args));
    }
}
