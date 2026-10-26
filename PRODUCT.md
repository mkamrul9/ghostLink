# Mystic product direction

Mystic's focus is private, resumable folder handoffs: send the whole folder, preserve its layout, and verify that each completed file arrived intact.

The first audience is people moving projects, photo folders and work between their own devices or a small trusted group. They can share a room through an existing messenger instead of asking everyone to adopt a new social network.

## Reasons to choose it

- No account or phone number to exchange. Open an invite on the receiving devices.
- Send a folder without preparing an archive. Paths and explicit empty folders survive; recipients can save a ZIP or native folders where supported.
- Resume committed data after a disconnect or refresh using the same browser profiles and original file. Re-sending a saved identical file checks it without transmitting the payload again.
- Every new-protocol completed file has a matching full-file SHA-256 and a downloadable receipt. This verifies bytes, not sender identity.
- File contents are never stored by Mystic's server. Users control local copies, optional passphrase protection and encrypted portable backups.
- Six-device rooms by default, with explicit recipient checkboxes. New arrivals are not automatically selected. Messages go to the whole connected room.
- Native disk writers and browser-owned download streams avoid whole-file memory buffers on supported browsers.

## Honest comparison

File sharing itself is established. WhatsApp supports documents up to 2 GB ([official messaging page](https://www.whatsapp.com/messaging?lang=en)); Telegram supports 2 GB for free users and 4 GB with Premium ([official Premium FAQ](https://telegram.org/faq_premium)). They also have mature messaging and asynchronous delivery, which Mystic deliberately does not provide with an off-server file model.

Direct browser sharing is also established: [PairDrop](https://github.com/schlagmichdoch/PairDrop) and [FilePizza](https://github.com/kern/filepizza) already provide it. We should not claim to have invented it, offer unlimited transfers on every device, or say no competitor has these features. Mystic's proposed differentiator is the combined folder workflow, durable resume, byte verification, local protection and simple recipient controls. Adoption needs testing with real users; a feature list does not prove demand.

Suggested concise product line: **Send complete folders privately. Resume where you left off.**

## Boundaries that follow from keeping files off servers

Both file-holding devices must remain online with Mystic open while transferring. A browser cannot deliver a file after its only source goes offline. Screen wake lock helps where allowed; it cannot override mobile suspension. Downloads also need the page open until finished.

Browser quotas, available storage and save capabilities still apply. When neither native saving nor transferable-stream downloads work, the guarded memory fallback is 256 MiB. Directory inputs on some browsers omit empty folders; directory handles, dropped folders and the New empty folder action preserve them.

A previously saved download or encrypted backup is required after site data is cleared. Passphrases cannot be reset. Protection covers saved file metadata and keys; chat and transfer history are separate and can be cleared independently.

TURN can forward encrypted network packets without storing files. The code prepares expiring credentials, but no relay is provisioned or enabled by default. Some networks will fail without one. There are no server accounts, offline cloud delivery or cloud backups.

## Launch evidence and remaining release gates

Automated checks cover durable resume, incompatible source rejection, authenticated backups and rollback, protected reload and idle lock, targeted four-device sharing, a 750-file phone layout, and a real 280 MiB local WebRTC transfer with matching native and browser-stream exports. Responsive checks cover six viewport sizes and reduced keyboard space. These do not replace physical iOS/Android and internet-network testing.

A local signaling run handled 2,000 sockets in 1,000 rooms, relaying 1,000 offers with p95 157 ms; server and clients shared one machine/process. This is not a claim of hosted production capacity. Measure the chosen hosting tier, restrictive-network connection success, relay capacity and real device quotas before advertising thousands of simultaneous users. Render explicitly says its free web instances are not for production ([provider documentation](https://render.com/docs/free)). Deployment is prepared only; no service has been published.
