# Scan IP: cek server yang menghadap internet

IP itu nomor rumah server. VPS, dedicated, colo hampir selalu punya yang publik. Scan IP Sinexis mengetuk dari jalan: pintu mana yang terbuka, layanan apa yang menjawab, CVE yang cocok dengan layanan itu.

Analoginya: depan, belakang, gudang. Kami tidak duduk di ruang tamu. Kami lihat dari luar. Itu pekerjaan network scan, bukan SIEM yang menelan log 24 jam di dalam OS.

Ini bukan pasang agen di dalam. Scan IP tidak butuh `wazuh-agent`. Guard (satu agen per VM) adalah upsell terpisah. Host Protect (baca disk) juga terpisah.

## Isi pemeriksaan

Yang dicek dari luar:

- **Port terbuka** = pintu mana yang terbuka di host publik. SSH, HTTP, database, atau layanan yang seharusnya tidak terlihat.
- **Layanan yang teridentifikasi** = apa yang menjawab di balik port itu. Versi web server, jenis database, dan sejenisnya.
- **CVE yang cocok** = kerentanan yang sudah diketahui publik dan cocok dengan versi layanan yang terdeteksi. Sumbernya dari database publik (OSV.dev), bukan temuan sendiri.
- **Tingkat keparahan** = mana yang parah, mana yang informatif.

Tetap dari luar: tidak ada teknisi masuk sistem operasi, tidak ada patch otomatis, tidak ada perubahan konfigurasi.

## Kapan relevan

IP tetap di VPS atau colo. Server yang katanya cuma web, tapi kadang masih ada layanan lain yang lupa ditutup. Port database yang seharusnya tidak terbuka ke internet. SSH yang masih di port default.

Anda butuh bukti bulanan: permukaan ini masih seperti yang kita kira. Atau: ternyata ada port yang terbuka sejak migrasi terakhir.

## Yang dicek vs yang tidak

| Dicek dari luar | Tidak dicek |
|---|---|
| Port terbuka di host publik | Konfigurasi di dalam OS |
| Layanan dan versi yang menjawab | Patch otomatis atau perbaikan |
| CVE publik yang cocok | Firewall rules (kami tidak mengubah) |
| Perubahan dibanding scan sebelumnya | Logika aplikasi atau isi database |

## Yang tidak kami lakukan dari sini

Tidak patch otomatis. Tidak ganti firewall tanpa Anda. Bukan otomasi insiden. Bukan "kami masuk dalam-dalam." Bukan SIEM. Bukan daemon scan kedua di host.

Bukan Imunify di cPanel. Kalau farm Anda sudah punya panel dengan fitur keamanan on-box, Scan IP tetap hanya melihat dari internet. Dua pekerjaan berbeda, dua perspektif berbeda.

## Langkah berikutnya

Scan IP memakai kredit (biasanya lebih ringan daripada scan domain). Satu IP atau satu domain, pilih yang benar-benar menghadap pelanggan. Angka rupiah tidak ditulis di artikel ini, lihat layar harga di akun.

Aplikasi HP (APK/IPA) adalah mesin terpisah. Bukan pengganti cek server.
