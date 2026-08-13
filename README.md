# MondayFlow

Demo GitHub Pages: `https://kdsputra.github.io/mondayflow/`

MondayFlow adalah aplikasi work management bergaya monday.com. Tahap 0 sampai 7 telah diimplementasikan: fondasi multi-tenant, board builder, automations, integration hub, Docs/Forms/Canvas, kontrol enterprise, PWA/offline, observability, dan backup tersedia dalam satu proyek yang siap masuk GitHub.

## Cakupan utama

- Auth email/password, registrasi, reset password, Google OAuth, profil, dan sign out
- Banyak workspace dan banyak board per workspace
- Board Main, Private, dan Shareable dengan akses owner/editor/viewer
- Peran workspace owner, admin, member, viewer, dan guest
- Pengelolaan anggota, tim, keanggotaan tim, dan tautan undangan kedaluwarsa
- Main Table, Kanban, Calendar, Dashboard, item, subitem, filter, bulk action, dan CSV
- Update thread, activity log, notifikasi, attachment privat, dan signed download URL
- Autosave dan realtime Supabase dengan Row Level Security di setiap data tenant
- Mode demo lokal jika Supabase belum dikonfigurasi
- Build check GitHub Actions pada push dan pull request
- Custom columns, formula, dependencies, people picker, saved views, dan templates
- Automation recipes, event engine, scheduler, email/webhook queue, dan run history
- Integration hub untuk Calendar, chat, storage, development, issue tracking, dan CRM
- Docs, public Forms, WorkCanvas, inbox, advanced workload, dan portfolio
- SAML/OIDC settings, SCIM provisioning, retention, audit export, trials, dan Stripe webhook
- Progressive Web App, navigasi mobile, antrean perubahan offline berbasis IndexedDB, dan replay saat online
- Reliability Center dengan Web Vitals, error session, backup lokal, backup online privat, restore aman, dan retensi

Dokumen keputusan teknis tersedia di [arsitektur](docs/ARCHITECTURE.md), [matriks hak akses](docs/PERMISSIONS.md), [kontrak database](docs/DATABASE-CONTRACT.md), [panduan tahap 2-6](docs/PHASES-2-6.md), dan [panduan tahap 7](docs/PHASE-7.md). Daftar kemampuan ada di [FEATURES.md](FEATURES.md).

## Jalankan lokal

Gunakan Node.js 20 atau lebih baru dan pnpm 10.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Tanpa isi `.env`, aplikasi berjalan dalam Demo mode dan menyimpan data contoh di browser.

## Hubungkan Supabase

1. Buat project Supabase baru.
2. Buka SQL Editor dan jalankan seluruh isi `supabase/schema.sql`.
3. Pastikan provider Email aktif di `Authentication > Providers`.
4. Untuk Google login, aktifkan provider Google dan isi OAuth client sesuai petunjuk Supabase.
5. Atur `Authentication > URL Configuration`: isi Site URL untuk alamat produksi dan tambahkan `http://localhost:5173/**` sebagai Redirect URL lokal.
6. Salin Project URL dan anon public key dari pengaturan API ke `.env`:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

7. Jalankan ulang `pnpm dev`, buat akun, lalu uji pembuatan workspace dan undangan dari menu Share.

Script SQL juga membuat bucket privat `board-files` dan `workspace-backups`, kebijakan Storage, fungsi undangan, platform state, automation queue, observability, restore tervalidasi, integration metadata, SCIM, billing, dan publikasi realtime. Anon key boleh berada di frontend karena RLS tetap menjadi penjaga akses. Jangan pernah menaruh service-role key di aplikasi atau GitHub.

Undangan menghasilkan tautan aman yang dapat disalin. Untuk automations dan integrasi eksternal, deploy folder `supabase/functions` lalu pasang secret sesuai `supabase/functions/README.md`.

## Upload ke GitHub

Jalankan dari folder `mondayflow`:

```bash
git init
git add .
git commit -m "Complete MondayFlow phases 0 through 7"
git branch -M main
git remote add origin https://github.com/USERNAME/mondayflow.git
git push -u origin main
```

`.env`, `node_modules`, dan `dist` sudah diabaikan oleh Git. Workflow `.github/workflows/ci.yml` menjalankan build pada setiap push dan pull request.

## Deploy

Gunakan pengaturan berikut di Vercel, Netlify, Cloudflare Pages, atau hosting statis lain:

- Build command: `pnpm build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`

Setelah URL produksi tersedia, masukkan URL tersebut ke Site URL dan Redirect URLs di Supabase Auth. Build lokal dapat diperiksa dengan `pnpm build` lalu `pnpm preview`.

PWA memerlukan HTTPS di produksi. Deploy Edge Function `backup-workspace`, isi `BACKUP_CRON_SECRET`, lalu panggil action `scheduled` dari Supabase Cron untuk backup otomatis dan pembersihan arsip kedaluwarsa.
