# Edge Functions

Deploy these functions with the Supabase CLI after setting server-only secrets.

Required secrets depend on enabled features:

- `AUTOMATION_CRON_SECRET`, `AUTOMATION_WEBHOOK_ALLOWLIST`
- `RESEND_API_KEY`, `AUTOMATION_EMAIL_FROM`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `BACKUP_CRON_SECRET`
- Provider OAuth client IDs/secrets and a production token-vault adapter

Schedule `automation-runner` with Supabase Cron. Schedule `backup-workspace` by sending `{ "action": "scheduled" }` with `Authorization: Bearer <BACKUP_CRON_SECRET>`; the worker creates due backups and removes expired objects. Keep `SUPABASE_SERVICE_ROLE_KEY` only in Edge Function secrets. `integration-oauth` deliberately records a connection as `ready`, never `connected`, until the provider handshake and secure token storage are installed.

`backup-workspace` accepts authenticated owner/admin actions `backup` and `restore`. Restore is additive/upsert-based and intentionally does not replace workspace membership, security, billing, or secrets.
