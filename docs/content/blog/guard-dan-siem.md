# Guard dan SIEM: setelah Scan, bukan pengganti Scan

Dua nama yang mudah tertukar. Keduanya **bukan** paket Scan hari pertama.

## Guard (agen di server)

**Guard** memasang **agen tipis** di VPS/colo Anda. Yang dijual di v1: **inventaris mesin** + **alert kritis** (bukan “semua log dunia”).

Analogi: Scan melihat toko dari trotoar. Guard adalah **alarm di dalam** yang berbunyi untuk kejadian serius.

Syarat sehat: Anda **sudah** nyaman dengan Scan berkala. Guard adalah **upsell kedua**. Bukan dashboard Wazuh penuh untuk pelanggan. Bukan SOAR.

Enroll/unenroll agen adalah operasi lab/ops — bukan tombol “install dari artikel blog”.

## SIEM (cari peristiwa + kasus)

**SIEM** di Sinexis: **pencarian** peristiwa organisasi + **kasus** di workspace yang sama. Bukan konsol kedua, bukan ganti Guard.

Di produksi, modul ini bisa **mati** (`SIEM_ENABLED` default off) sampai ops menyalakan. Jangan janjikan SIEM di email AM wave-1.

## Urutan yang jujur

1. Domain dan/atau IP masuk Scan + jadwal
2. Kredit dan aset sesuai paket
3. Uptime jika Anda peduli “web down”
4. Baru Guard di host yang sama
5. SIEM hanya jika flag hidup dan ada yang membaca kasus

Kalau Anda cuma punya website + hosting: mulai dari **scan domain + jadwal**. Guard/SIEM boleh dibaca, jangan dibeli lebih dulu daripada kebiasaan laporan bulanan.
