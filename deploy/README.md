# HTTPS and relay deployment

This is a self-hosting template for a **Linux server** with a domain, public IPv4 address, Docker and Docker Compose. It combines the Mystic app, Caddy-managed HTTPS and a coturn relay. It does not purchase a domain, create a host, or guarantee free bandwidth.

## Prepare

1. Point your domain's DNS at the server.
2. Copy `deploy/.env.example` to the ignored `deploy/.env`.
3. Set the domain and actual public relay IPv4 address. The supplied example IP is reserved for documentation.
4. Generate a random shared secret and set `TURN_SECRET`:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

5. Open inbound TCP 80/443 for HTTPS, UDP 443 for HTTP/3 if desired, TCP/UDP 3478 for TURN, and the chosen UDP allocation range. Apply provider firewall rules as well as host rules.
6. Size the relay port range, quotas and bandwidth for measured demand. The example allocation range is deliberately small; it is not a thousands-of-users capacity setting. Every relay connection consumes resources.

The stack denies relay connections to common private/link-local peer ranges and requires authenticated allocations. Network-level egress restrictions and operator monitoring remain necessary. The short-lived public credential endpoint also needs edge rate limits appropriate to the real deployment; same-origin checks are not an authentication system.

## Start

From the repository root:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

Caddy obtains a certificate for the configured domain. It needs valid DNS and inbound access for certificate issuance. The app is not published directly on port 8080; Caddy proxies HTTP and WebSocket traffic on the internal Docker network.

The relay uses Linux host networking. This template is not a Windows Docker Desktop relay configuration. Its TURN transport is UDP/TCP on 3478; TLS on 5349/443 is not configured. WebRTC payloads remain DTLS-encrypted, but a network that allows only TURN-over-TLS may still fail. Use a managed TLS-capable relay or separately configure coturn certificates and a suitable public endpoint for that requirement. Do not describe this template as universal network connectivity.

## Check before inviting users

```sh
npm run check:deployment -- https://files.example.com --require-relay
```

This checks HTTP health, security headers, client assets, configuration shape and whether TURN is advertised. It does **not** prove a successful TURN allocation or Internet transfer.

Use actual separate networks, for example home Wi-Fi and cellular. Exchange files both ways, interrupt a transfer, resume it, compare exports, and test local-folder permission and disk-full behavior. Measure load on the selected host and relay. CI builds and checks the application container; it does not provision this public stack.

Logs and health:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=100 app https relay
```

Treat relay logs as sensitive network metadata. Do not publish room codes, SDP, credentials or clients' network addresses. Keep OS/images updated and rotate the shared secret when needed. Existing credentials expire according to `TURN_TTL`.

## Update or stop

Pull reviewed source and image updates, then run the same `up -d --build` command. Keep deployment settings and the HTTPS data volumes. `docker compose down` stops the services; do not add `--volumes` unless you intend to remove certificate state.

See [DEPLOYMENT.md](../DEPLOYMENT.md) for preview hosting, operational limits and rollback. Upstream references: [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [coturn](https://github.com/coturn/coturn/tree/master/docker/coturn), [coturn authentication options](https://github.com/coturn/coturn/blob/master/README.turnserver).
