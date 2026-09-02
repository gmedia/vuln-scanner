# Guard dan SIEM: setelah Scan, bukan pengganti Scan

Dua nama gampang ketuker. Keduanya **bukan** paket Scan hari pertama. Di luar Sinexis, orang juga sering campur: OpenVAS/nmap = foto berkala dari luar; Wazuh/SIEM = mata di dalam host. Kami tidak menjual yang kedua seolah yang pertama.

## Guard

Lapisan tipis di VPS atau colo. Yang dijual sekarang: daftar mesin + alert yang serius. Bukan “semua log dunia.” Bukan dasbor Wazuh penuh buat pelanggan. Bukan otomasi insiden. Bukan Host Protect (baca webroot).

**Satu `wazuh-agent` per VM.** Bukan dua agen. Tidak ada daemon enroll kedua (`sinexis-scan`) yang harus dipasang mendampingi. Helper Host Protect (kalau ada) adalah add-on on-box — unduh satu skrip `sinexis-install.sh`, bukan clone repo — dan **bukan** agen enroll baru.

Scan lihat toko dari trotoar. Guard alarm di dalam, bunyi untuk yang serius.

Syarat sehat: Anda sudah nyaman dengan Scan berkala. Guard upsell kedua. Pasang atau lepas agen urusan lab dan ops — bukan tombol “install dari artikel blog.”

## SIEM

Di Sinexis: **cari peristiwa** organisasi + **Cases** (tiket insiden: buka / ack / tutup) di workspace yang sama. Cases disimpan di aplikasi kami, bukan plugin Wazuh dan bukan daftar alert Guard. Bukan konsol kedua. Bukan ganti Guard. Bukan janji “platform AI cybersecurity.”

Di banyak lingkungan modul ini masih dimatikan (`SIEM_ENABLED`) sampai ada yang siap baca kasus. Jangan janji SIEM di email penjualan gelombang pertama.

## Host Protect (supaya tidak ketuker lagi)

Malware di **disk VM pelanggan**, lewat helper. Tanpa helper: menunggu / tidak terjangkau — **bukan** temuan `wp-content` palsu. Pekerjaan sekelas Imunify on-box, stack sendiri; bukan pengganti CloudLinux di farm cPanel.

## Urutan yang masuk akal

Domain dan/atau IP masuk Scan plus jadwal. Kredit dan aset sesuai paket. Uptime kalau Anda peduli web down. Baru Guard di host yang sama — **satu agen**. Host Protect jika Anda butuh jujur soal file web. SIEM hanya jika modulnya hidup dan ada orang yang benar-benar baca Cases.

Website + hosting saja: mulai **scan domain + jadwal**. Guard dan SIEM boleh dibaca. Jangan dibeli lebih dulu daripada kebiasaan laporan bulanan.
