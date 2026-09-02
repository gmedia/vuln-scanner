# Apa itu Sinexis?

Sinexis bukan hosting. Website atau VPS Anda sudah jalan — kami tidak pindahkan ke mesin baru. Yang kami jual: **pemeriksaan dari internet yang berulang**, lalu kabar kalau permukaan berubah; kalau perlu, **alarm di dalam mesin** tanpa mengarang malware.

Bayangkan ruko yang sudah sewa. Kami tidak bangun gedung. Kami lewat depan, lihat pintu, jendela, papan nama — bulan ini, bulan depan. Bukan sekali pas buka toko lalu hilang.

Di industri, itu beda dua pekerjaan yang sering dijual campur: **scan berkala dari luar** (port, TLS, header — semacam baseline DAST) versus **SIEM / EDR 24 jam** di dalam host. Sinexis mulai dari yang pertama. Yang kedua hanya kalau Anda sadar beli Guard atau SIEM — dan kami tidak menamai Guard sebagai “platform SIEM”.

Ini **bukan SIEM**. Ini **bukan agen kedua** di samping yang sudah ada. Satu `wazuh-agent` per mesin kalau Anda ambil Guard. Scan dari luar tidak butuh daemon enroll baru.

## Siapa yang biasanya pakai

Orang yang domain-nya sudah di hosting atau VPS. Tim kecil, satu-dua server menghadap internet. Hotel atau kantor yang maunya laporan singkat, bukan tumpukan istilah. AM yang sudah tagih colo/VPS dan butuh baris security yang jujur — attach, bukan ganti rak.

## Yang ada di akun

Pertama: scan website (domain) dan/atau alamat server (IP). Kalau mau jadi kebiasaan, hidupkan jadwal — tiap minggu atau bulan, hasilnya dibanding yang kemarin. Itu **Scan Attach**.

Tiap pemeriksaan makan kredit, kira-kira seperti pulsa. Bisa undang rekan ke satu workspace. Target bisa dikasih nama (“situs booking”) supaya tidak ketik ulang. Ada cek “situs masih nyala dari luar?”. Ada alarm di dalam server (Guard) untuk yang serius — daftar mesin + alert keras, bukan tumpukan log. Cari peristiwa dan **Cases** (tiket insiden di Postgres) adalah modul SIEM terpisah; di banyak tempat masih dimatikan. Cases bukan plugin Wazuh.

Scan file HP (APK/IPA) ada di mesin. Bukan cerita utama kalau yang Anda bayar hosting atau VPS.

**Host Protect** (cek malware di disk) adalah add-on jujur: helper jalan **di VM Anda**, membaca webroot di situ — pola Imunify-class, stack sendiri, bukan clone panel. Tanpa helper, hasilnya menunggu — **bukan** temuan WordPress palsu di path ERP.

## Yang tidak kami janjikan

Firewall, antivirus, backup tetap urusan Anda. Tidak ada “aman 100%.” Tidak ada tim yang duduk baca semua log. Tidak ada dua agen yang harus dipasang berpasangan. Scan otomatis **tidak** mengganti pentest manusia atau uji logika bisnis (checkout, hak akses) — itu di luar baseline DAST.

Kalau colo atau VPS sudah jalan, ini pemeriksaan permukaan yang kelihatan dari internet, plus opsi on-box yang tidak berbohong. Ada alasan dibuka tiap bulan — bukan scan sekali, screenshot, lalu lupa.
