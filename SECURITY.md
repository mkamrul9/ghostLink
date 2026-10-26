# Security policy

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/mkamrul9/ghostLink/security/advisories/new). Do not report an exploitable vulnerability in a public issue or discussion.

Include a clear description, affected revision/browser, minimal reproduction using synthetic data, the expected behavior and the observed impact. Do not send real private files, passphrases, active invitations or live relay credentials. If a credential has already leaked, revoke or rotate it separately.

Maintainers will investigate reports as availability permits. There is currently no guaranteed response time, paid support contract or bug bounty. Please allow coordinated remediation before publishing exploit details.

## Supported code

Security fixes currently target the latest `main` branch. Older commits and third-party deployments may not receive backports. Deployers are responsible for installing updates, configuring HTTPS, managing TURN credentials, applying bandwidth limits and monitoring their hosting environment.

See the [security model](docs/security-model.md) for trust boundaries, local file protection, known limits and test coverage. Passing CI is not a security certification or independent audit.
