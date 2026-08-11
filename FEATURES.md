# Feature Coverage

MondayFlow meniru alur kerja inti monday.com tanpa memakai merek, aset, atau kode milik monday.com. Tahap 0-7 kini memiliki implementasi di aplikasi, database, dan worker foundation.

## Tahap 0-1

| Area | Cakupan |
| --- | --- |
| Foundation | React SPA, Supabase Auth/Postgres/Storage/Realtime, multi-tenant workspace |
| Account | Email/password, Google OAuth, reset password, profil, sign out |
| Workspace | Banyak workspace/board, anggota, tim, undangan bertoken |
| Security | Workspace roles, board roles, Main/Private/Shareable, RLS, signed file URL |
| Board | Table, Kanban, Calendar, Dashboard, item, subitem, updates, activity, CSV |

## Tahap 2

| Fitur | Implementasi |
| --- | --- |
| Column builder | Text, number, date, dropdown, checkbox, formula, people, dependency |
| Formula | Evaluasi formula terkontrol untuk budget, progress, dan days remaining |
| Dependency | Pemilih item dependency langsung di Main Table |
| People picker | Menggunakan anggota workspace, bukan daftar akun global |
| Saved views | Menyimpan layout, status, priority, dan owner filter lalu menerapkannya kembali |
| Templates | Campaign launch dan Product sprint; template menambah struktur tanpa menghapus data |

## Tahap 3

| Fitur | Implementasi |
| --- | --- |
| Recipe builder | Trigger item created, status changed, date arrived, webhook received |
| Actions | Set status, assign owner, notification, email, webhook |
| Event engine | Item create/update menjalankan recipe aktif dan mencatat run history |
| Scheduler | SQL scheduler membuat job due-date; Edge Function memproses antrean |
| Delivery | Resend email adapter dan webhook allowlist di server |

## Tahap 4

Integration hub tersedia untuk Google/Outlook Calendar, Slack, Teams, Google Drive, GitHub, Jira, dan HubSpot. Metadata koneksi tersimpan dengan RLS. Edge Functions menangani konfigurasi OAuth dan webhook intake; status tidak akan berubah menjadi `connected` sebelum token vault dan kredensial provider dipasang.

## Tahap 5

| Fitur | Implementasi |
| --- | --- |
| Docs | Dokumen workspace dengan editor dan autosave |
| Forms | Builder, publish toggle, URL publik tanpa login, validasi, dan response storage |
| Canvas | Notes, warna, editing, dan hubungan antar-node |
| Inbox | Pesan workspace, unread state, dan mark-all-read |
| Workload | Kapasitas anggota dan portfolio board lintas workspace aktif |
| Dashboard | Status, budget, progress, timeline, dan workload |

## Tahap 6

| Fitur | Implementasi |
| --- | --- |
| SSO | Konfigurasi SAML/OIDC, verified domain, enforcement flag |
| SCIM | Token sekali tampil, hash database, list users, suspend/reactivate endpoint |
| Retention | Kebijakan 30 hari sampai 10 tahun |
| Audit/export | Activity history dan organization JSON export |
| Billing | Plan/seats, database trial, Stripe webhook sebagai sumber status pembayaran |
| Admin security | Secret tetap server-only; token dan billing tables tidak dapat diubah langsung oleh browser |

## Tahap 7

| Fitur | Implementasi |
| --- | --- |
| PWA | Manifest, service worker, install flow, shell cache, dan fallback navigasi offline |
| Mobile | Bottom navigation, safe-area spacing, panel Reliability layar penuh, dan kontrol touch-friendly |
| Offline data | Antrean IndexedDB untuk item, update, activity, delete, dan platform state; replay idempotent saat online |
| Observability | Error/rejection capture, LCP, CLS, TTFB, long task, workspace event table, dan RLS |
| Backup | Export JSON lokal, bucket online privat, metadata backup, retensi, restore tervalidasi, dan scheduled worker |
| Performance | Deferred search, lazy-loaded feature centers, query limits, indeks database, dan content visibility |

## Memerlukan konfigurasi produksi

- OAuth client dan token vault untuk setiap integration provider
- Resend atau provider email lain untuk pengiriman email nyata
- Supabase Cron untuk `automation-runner`
- Stripe products, prices, Checkout endpoint, dan signing secret
- Metadata SAML/OIDC dari identity provider
- Domain verification dan kebijakan organisasi final
- Supabase Cron dengan `BACKUP_CRON_SECRET` untuk backup otomatis

UI menampilkan koneksi sebagai `ready`, bukan `connected`, selama handshake eksternal belum terverifikasi.

## Checklist penerimaan

- Tambah setiap tipe custom column dan edit nilainya pada Main Table
- Terapkan template dan saved view
- Ubah status menjadi `Stuck`, lalu periksa toast, inbox, activity, dan run history
- Buat recipe email/webhook dan periksa job queue
- Konfigurasikan integration endpoint; pastikan secret tidak masuk browser state
- Edit Doc, publish Form, buka URL `?form=<id>`, dan kirim response tanpa login
- Tambah serta hubungkan Canvas notes; periksa Inbox dan Workload
- Konfigurasikan SSO, buat SCIM token, ubah retention, export organization, dan mulai trial
- Build production harus selesai tanpa error TypeScript
- Install PWA, putuskan jaringan, edit item, sambungkan kembali, lalu pastikan offline queue kosong
- Buat backup lokal, restore file yang sama, dan pastikan board kembali tanpa mengganti membership
