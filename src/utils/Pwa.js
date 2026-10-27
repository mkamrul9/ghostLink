export default class Pwa {
    constructor(onChange) {
        this.onChange=onChange;
        this.display=matchMedia('(display-mode: standalone)');
        this.display.addEventListener('change',()=>this.publish());
        window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();this.prompt=event;this.publish();});
        window.addEventListener('appinstalled',()=>{this.wasInstalled=true;this.prompt=null;this.publish();});
        navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(this.reloading)location.reload();});
    }
    get installed(){return this.wasInstalled || this.display.matches || navigator.standalone===true;}
    publish(){this.onChange({installed:this.installed,installAvailable:Boolean(this.prompt),updateAvailable:Boolean(this.registration?.waiting)});}
    watch(registration){
        this.registration=registration;this.publish();
        registration?.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')this.publish();});});
    }
    async install(){
        if(!this.prompt)return false;
        const prompt=this.prompt;this.prompt=null;this.publish();
        await prompt.prompt();await prompt.userChoice;this.publish();return true;
    }
    applyUpdate(){if(!this.registration?.waiting)return false;this.reloading=true;this.registration.waiting.postMessage({type:'MYSTIC_UPDATE'});return true;}
}
