# Deployment profiles

Aero Diary is a normal standalone Next.js application. The portable deployment contract is:

```text
pnpm install --frozen-lockfile
pnpm prisma migrate deploy
pnpm build
pnpm start
```

The application does not require Tailscale, ChatMock, or any other OCI-specific tool. Configure a normal reverse proxy or hosting platform as appropriate for the deployment environment.

The `ops/oci/` profile records the chosen Oracle Cloud operating procedure. Its Tailscale exposure and operator-managed OpenAI-compatible endpoint are infrastructure choices, not application requirements.
