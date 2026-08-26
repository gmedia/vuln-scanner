# Scan IP: cek server yang menghadap internet

IP adalah “nomor rumah” server di internet. VPS, dedicated, dan colo hampir selalu punya IP publik. **Scan IP** Sinexis melihat **pintu (port) yang terbuka** dan layanan yang menjawab dari luar.

## Analogi

Rumah punya beberapa pintu: depan, belakang, gudang. Scan IP mengetuk dari jalan: pintu mana yang terbuka, dan layanan apa yang menyapa. Lalu memetakan temuan ke tingkat keparahan (termasuk CVE yang diketahui untuk layanan itu).

## Apa yang dicek

- Port terbuka di host publik
- Layanan yang teridentifikasi (misalnya web, SSH)
- Klasifikasi keparahan / CVE yang terkait layanan itu

Pemeriksaan **eksternal**. Kami tidak masuk ke dalam OS Anda seperti teknisi yang duduk di depan keyboard.

## Kapan relevan

- VPS atau colo dengan IP tetap
- Server yang seharusnya hanya buka 80/443, tapi mungkin masih buka layanan lain
- Anda ingin bukti bulanan: “permukaan IP ini masih seperti yang kita kira”

## Yang tidak termasuk

- Patch otomatis di server
- Ganti firewall tanpa persetujuan Anda
- Windows “dalam-dalam” atau SOAR

Scan IP memakai **kredit** (biasanya lebih ringan daripada scan domain). Paket Basic sering cukup untuk **satu** IP **atau** satu domain — pilih yang benar-benar menghadap pelanggan.

Aplikasi HP (APK/IPA) adalah mesin terpisah, bukan pengganti cek server.
