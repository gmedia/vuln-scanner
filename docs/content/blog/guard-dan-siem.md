# Guard dan SIEM: setelah Scan, bukan pengganti Scan

Dua nama yang gampang tertukar. Keduanya bukan paket Scan hari pertama.

Di luar Sinexis, orang juga sering mencampur: OpenVAS/nmap = foto berkala dari luar; Wazuh/SIEM = mata di dalam host. Sinexis tidak menjual yang kedua seolah-olah yang pertama.

## Guard: lapisan tipis di dalam server

Guard adalah alarm di dalam VPS atau colo Anda. Yang dijual sekarang: **daftar mesin plus alert yang benar-benar kritis**. Bukan "semua log dunia." Bukan dasbor Wazuh penuh untuk pelanggan. Bukan otomasi insiden.

Satu `wazuh-agent` per VM. Bukan dua agen. Tidak ada daemon enroll kedua yang harus dipasang mendampingi.

Yang Guard lakukan:

- Inventaris mesin yang terdaftar.
- Alert untuk peristiwa kritis (misalnya: layanan penting mati, perubahan mencurigakan).
- Notifikasi ke tim.

Yang Guard **tidak** lakukan:

- Menelan semua log 24 jam.
- Mengganti dashboard Wazuh penuh.
- Otomasi insiden atau respons otomatis.
- Membaca file di disk (itu Host Protect).

Scan lihat toko dari trotoar. Guard alarm di dalam, bunyi untuk yang serius. Dua perspektif, dua pekerjaan.

Syarat: Anda sudah nyaman dengan Scan berkala. Guard upsell kedua. Pasang atau lepas agen urusan lab dan ops, bukan tombol "install dari artikel blog."

## SIEM: cari peristiwa dan tiket insiden

Di Sinexis, SIEM terdiri dari dua hal:

**Cari peristiwa** = telusuri log organisasi yang sudah masuk. Bukan konsol kedua, bukan ganti Guard.

**Cases** = tiket insiden di Postgres. Buka, akui, tutup. Disimpan di aplikasi Sinexis, bukan plugin Wazuh, bukan daftar alert Guard.

Bukan "platform AI cybersecurity." Bukan konsol terpisah yang harus login beda. Di banyak lingkungan, modul ini masih dimatikan (`SIEM_ENABLED`) sampai ada yang siap baca kasus.

Jangan janji SIEM di email penjualan gelombang pertama. Itu modul untuk tim yang sudah matang.

## Host Protect: cek malware di disk

Supaya tidak tertukar lagi.

Host Protect membaca file di **disk VM pelanggan**, lewat helper yang jalan di mesin itu sendiri. Pekerjaan sekelas Imunify on-box, stack sendiri, bukan clone panel.

Tanpa helper: menunggu atau tidak terjangkau. Bukan temuan `wp-content` palsu di path ERP. Kami tidak mengarang malware yang tidak ada.

Helper diunduh lewat satu skrip `sinexis-install.sh`, bukan clone repo. Bukan agen enroll baru.

## Urutan yang masuk akal

1. **Domain dan/atau IP masuk Scan** plus jadwal. Ini fondasi.
2. **Kredit dan aset** sesuai paket. Supaya jadwal jalan.
3. **Uptime** kalau Anda peduli web down. Kursi Scan, bukan baris baru.
4. **Guard** di host yang sama. Satu agen. Setelah Scan berjalan.
5. **Host Protect** jika Anda butuh jujur soal file web. Per VM, bukan per tag.
6. **SIEM** hanya jika modulnya hidup dan ada orang yang benar-benar baca Cases.

Website plus hosting saja? Mulai **scan domain plus jadwal**. Guard dan SIEM boleh dibaca. Jangan dibeli lebih dulu daripada kebiasaan laporan bulanan.

## Langkah berikutnya

Mulai dari Scan. Jadwal Attach. Kalau sudah jalan beberapa bulan dan Anda butuh alarm di dalam server, baru bicara Guard. SIEM belakangan, kalau modulnya hidup dan ada yang baca.
