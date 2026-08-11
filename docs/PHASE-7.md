# Tahap 7: Reliability dan Mobile

## Cakupan

Tahap 7 menjadikan board dapat dipasang sebagai PWA, tetap menerima perubahan inti saat koneksi terputus, memantau kesehatan aplikasi, dan menyediakan jalur backup/restore untuk demo maupun Supabase.

## PWA dan mobile

- `manifest.webmanifest` mendefinisikan mode standalone, ikon, warna, scope, dan start URL.
- Service worker hanya menyimpan shell dan aset GET dari origin aplikasi. Request Supabase, Edge Function, dan mutasi tidak disimpan di cache.
- Navigasi mobile bawah memberi akses cepat ke Home, My work, New item, Platform, dan Inbox.

## Offline queue

Mutasi item, update, activity, delete, dan platform state masuk ke IndexedDB ketika kegagalan teridentifikasi sebagai masalah jaringan. UUID dibuat di client, sehingga replay menggunakan upsert dan aman terhadap pengiriman ulang. File attachment tidak diantrekan karena byte file memerlukan lifecycle dan quota tersendiri.

Saat event `online` diterima, antrean diputar berurutan. Kegagalan non-jaringan dicatat per operasi dan operasi berikutnya tetap diproses. Reliability Center menyediakan retry manual dan clear queue dengan konfirmasi dua langkah.

## Observability

Client mengukur LCP, CLS, TTFB, long task, error, dan unhandled rejection. Event online hanya dikirim bila workspace mengaktifkan telemetry. Payload tidak menyertakan judul item, update, form response, atau isi dokumen. RLS mengizinkan anggota menulis event miliknya dan hanya owner/admin membaca event workspace.

## Backup dan restore

- Backup lokal berisi account demo, snapshot board aktif, dan platform state dalam schema version 7.
- Backup online dibuat server-side dan mencakup seluruh board, item, updates, activity, attachment metadata, forms, dan konfigurasi non-secret.
- Object disimpan di bucket privat `workspace-backups`; metadata terlihat hanya bagi owner/admin.
- Restore browser memvalidasi produk, versi, dan struktur dasar.
- Restore online memvalidasi workspace serta board, lalu melakukan upsert item, update, activity, dan platform state. Membership, SSO/SCIM, billing, secret, dan file attachment tidak ditimpa.

## Operasi produksi

1. Jalankan ulang `supabase/schema.sql`.
2. Deploy `backup-workspace`.
3. Tambahkan `BACKUP_CRON_SECRET` sebagai Edge Function secret.
4. Jadwalkan request harian action `scheduled` melalui Supabase Cron.
5. Pantau `workspace_backups`, `observability_events`, dan log Edge Function.
6. Uji restore pada workspace staging sebelum menggunakannya sebagai prosedur pemulihan produksi.

## Batas yang disengaja

Offline queue tidak mencakup upload file, perubahan membership, billing, SCIM, atau OAuth. Cloud restore bersifat non-destruktif dan tidak menghapus record yang tidak terdapat di backup. Untuk disaster recovery penuh, tetap aktifkan backup Postgres terkelola dan point-in-time recovery dari provider.
