# Scan IP: cek server yang menghadap internet

IP itu nomor rumah server. VPS, dedicated, colo hampir selalu punya yang publik. Scan IP Sinexis mengetuk dari jalan: pintu (port) mana yang terbuka, layanan apa yang menjawab.

Kalau analogi rumah: depan, belakang, gudang. Kami tidak duduk di ruang tamu Anda. Kami lihat dari luar, lalu petakan temuan ke tingkat keparahan — termasuk CVE yang sudah diketahui untuk layanan itu, kalau cocok.

## Isi pemeriksaan

Port terbuka di host publik. Layanan yang teridentifikasi (web, SSH, dan semacamnya). Klasifikasi keparahan. Tetap **eksternal**: tidak ada “teknisi masuk OS.”

## Kapan relevan

IP tetap di VPS atau colo. Server yang katanya cuma 80/443, tapi kadang masih ada layanan lain yang lupa ditutup. Anda butuh bukti bulanan: permukaan ini masih seperti yang kita kira.

## Yang tidak kami lakukan dari scan ini

Tidak patch otomatis. Tidak ganti firewall tanpa Anda. Bukan SOAR, bukan “Windows dalam-dalam.”

Scan IP memakai kredit (biasanya lebih ringan daripada scan domain). Paket Basic sering cukup untuk **satu** IP **atau** satu domain — pilih yang benar-benar menghadap pelanggan.

Aplikasi HP (APK/IPA) mesin terpisah. Bukan pengganti cek server.
