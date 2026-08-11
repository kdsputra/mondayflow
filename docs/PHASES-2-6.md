# Phases 2-6 Operations Guide

## Platform state

Konfigurasi user-facing disimpan sebagai JSON versioned pada `workspace_feature_state`. Data yang memerlukan processing, audit, keamanan secret, atau akses publik tetap memakai tabel khusus: `automation_jobs`, `integration_connections`, `public_form_submissions`, `integration_webhook_events`, `organization_security`, `scim_tokens`, dan `billing_accounts`.

## Automations

Event `item_created` dan `status_changed` berjalan langsung setelah mutation item berhasil. Email dan webhook masuk `automation_jobs`. Edge Function `automation-runner` memanggil `enqueue_due_date_automations()`, mengambil job yang jatuh tempo, lalu mengirim melalui provider server-side.

Jadwalkan function runner setiap menit dan isi:

```text
AUTOMATION_CRON_SECRET
AUTOMATION_WEBHOOK_ALLOWLIST
RESEND_API_KEY
AUTOMATION_EMAIL_FROM
```

## Integrations

Browser hanya menyimpan provider, endpoint, dan status konfigurasi. OAuth client secret dan refresh token harus berada dalam Supabase secrets atau token vault. `integration-oauth` memvalidasi role owner/admin. `integration-webhook` memverifikasi secret provider, melakukan deduplication event, lalu mengantrekan automation webhook.

## Public forms

URL publik menggunakan `?form=<uuid>`. `get_public_form()` hanya mengembalikan form yang published. `submit_public_form()` memvalidasi status publish dan menulis ke tabel response tanpa membuka akses langsung anon ke tabel workspace.

## Enterprise

- SSO settings tidak mengaktifkan provider dengan sendirinya; metadata IdP dan domain verification tetap wajib.
- SCIM token lengkap hanya dikembalikan sekali. Database menyimpan SHA-256 hash dan preview.
- Browser tidak dapat menulis status pembayaran. Trial dibuat melalui RPC terotorisasi; paid state hanya berasal dari Stripe webhook terverifikasi.
- Organization export berisi konfigurasi dan snapshot board aktif. Untuk export besar, pindahkan proses ke background job dan private Storage.
