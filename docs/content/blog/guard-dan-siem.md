# Guard dan SIEM: setelah Scan, bukan pengganti Scan

Dua nama gampang ketuker. Keduanya **bukan** paket Scan hari pertama.

## Guard

Lapisan tipis di VPS atau colo. Yang dijual sekarang: daftar mesin + alert yang serius. Bukan “semua log dunia.” Bukan dasbor Wazuh penuh buat pelanggan. Bukan otomasi insiden.

**Satu `wazuh-agent` per VM.** Bukan dua agen. Tidak ada daemon enroll kedua (`sinexis-scan`) yang harus dipasang mendampingi. Helper Host Protect (kalau ada) adalah add-on on-box, bukan agen enroll baru.

Scan lihat toko dari trotoar. Guard alarm di dalam, bunyi untuk yang serius.

Syarat sehat: Anda sudah nyaman dengan Scan berkala. Guard upsell kedua. Pasang atau lepas agen urusan lab dan ops — bukan tombol “install dari artikel blog.”

## SIEM

Di Sinexis: cari peristiwa organisasi + kasus di workspace yang sama. Bukan konsol kedua. Bukan ganti Guard. Bukan janji “platform AI cybersecurity.”

Di banyak lingkungan modul ini masih dimatikan sampai ada yang siap baca kasus. Jangan janji SIEM di email penjualan gelombang pertama.

## Urutan yang masuk akal

Domain dan/atau IP masuk Scan plus jadwal. Kredit dan aset sesuai paket. Uptime kalau Anda peduli web down. Baru Guard di host yang sama — **satu agen**. SIEM hanya jika modulnya hidup dan ada orang yang benar-benar baca kasus.

Website + hosting saja: mulai **scan domain + jadwal**. Guard dan SIEM boleh dibaca. Jangan dibeli lebih dulu daripada kebiasaan laporan bulanan.
