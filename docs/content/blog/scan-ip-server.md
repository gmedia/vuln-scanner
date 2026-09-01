# Scan IP: cek server yang menghadap internet

IP itu nomor rumah server. VPS, dedicated, colo hampir selalu punya yang publik. Scan IP Sinexis mengetuk dari jalan: pintu mana yang terbuka, layanan apa yang menjawab.

Analogi rumah: depan, belakang, gudang. Kami tidak duduk di ruang tamu. Kami lihat dari luar, lalu tandai seberapa parah — termasuk celah yang sudah diketahui untuk layanan itu, kalau cocok.

Ini **bukan** pasang agen di dalam. Scan IP tidak butuh `wazuh-agent`. Guard (satu agen per VM) adalah upsell terpisah.

## Isi pemeriksaan

Port terbuka di host publik. Layanan yang teridentifikasi (web, SSH, dan semacamnya). Tingkat keparahan. Tetap dari luar: tidak ada teknisi masuk sistem operasi.

## Kapan relevan

IP tetap di VPS atau colo. Server yang katanya cuma web, tapi kadang masih ada layanan lain yang lupa ditutup. Anda butuh bukti bulanan: permukaan ini masih seperti yang kita kira.

## Yang tidak kami lakukan dari sini

Tidak patch otomatis. Tidak ganti firewall tanpa Anda. Bukan otomasi insiden, bukan “Windows dalam-dalam.” Bukan SIEM. Bukan daemon scan kedua di host.

Scan IP memakai kredit (biasanya lebih ringan daripada scan domain). Paket Basic sering cukup untuk **satu** IP **atau** satu domain — pilih yang benar-benar menghadap pelanggan.

Aplikasi HP (APK/IPA) mesin terpisah. Bukan pengganti cek server.
