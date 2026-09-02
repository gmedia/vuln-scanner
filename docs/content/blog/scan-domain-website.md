# Scan domain: cek website yang sudah online

Domain itu nama yang diketik pengunjung. Di belakangnya ada hosting atau VPS yang sudah jalan. Scan domain Sinexis melihat sisi itu **dari internet**, bukan dari dalam folder di server.

Bukan "kami masuk server lalu beresin plugin." Bukan SIEM. Tidak perlu pasang agen. Satu klik, tunggu hasilnya.

## Apa yang sebenarnya diperiksa

OWASP membedakan DAST (uji aplikasi yang sudah hidup, dari luar) dari uji logika bisnis. Scan domain Sinexis termasuk yang pertama: **baseline postur** dari sisi publik.

Yang dicek:

- **DNS** = nama masih mengarah ke tempat yang masuk akal, atau sudah nyasar ke IP yang salah.
- **Sertifikat HTTPS** = gembok TLS masih hidup atau hampir kedaluwarsa. Ini yang sering lolos setelah pindah hosting.
- **Header keamanan** = aturan yang browser harapkan dari situs. Kadang hilang setelah update theme atau migrasi.
- **Sidik teknologi** = apa yang terlihat dari luar (WordPress, Nginx, dan sejenisnya). Bukan audit kode.
- **Subdomain** = yang tercatat di catatan publik (misalnya crt.sh). Kadang ada subdomain lupa yang masih hidup.

Ini pemeriksaan postur. Satu scan bukan "kami coba bobol checkout." Jadwal yang bikin jadi kebiasaan.

## Kapan berguna

Situs sudah live, orang pakai HTTPS, dan tidak ada yang sempat cek manual tiap bulan. Yang sering lolos:

- Sertifikat hampir kedaluwarsa, tidak ada yang ingat perpanjang.
- Header berubah setelah pindah hosting atau ganti theme.
- DNS tersenggol tanpa ada yang sadar.
- Subdomain lama masih mengarah ke server yang tidak dijaga.

Mulai dari **satu domain yang benar-benar dipakai pelanggan**. Jangan masukkan semua subdomain percobaan ke akun kecil.

## Yang dicek vs yang tidak

| Dicek dari luar | Tidak dicek |
|---|---|
| DNS, TLS, header, sidik stack, subdomain publik | File di disk server |
| Sertifikat hidup atau mati | Plugin WordPress rusak |
| Konfigurasi publik yang terlihat | Logika bisnis (checkout, login bypass) |
| Perubahan dibanding scan sebelumnya | Malware di hosting (itu Host Protect) |

## Yang tidak otomatis

Plugin WordPress tidak kami perbaiki. File di disk hosting tidak kami cek virus dari scan domain (itu pekerjaan Host Protect plus helper di VM, dan tanpa helper kami tidak mengarang temuan palsu).

Tidak ada jaminan "tidak bisa diretas." Tidak mengganti WAF di edge panel hosting, dan kami tidak menempel WAF ke nginx publik Sinexis.

## Langkah berikutnya

Hasilnya di dasbor. Kalau jadwal hidup, perubahan yang serius dibanding bulan lalu bisa dikirim lewat email. Itu namanya Scan Attach, dan ada artikel terpisah yang menjelaskan cara kerjanya.

Scan domain memakai kredit. Angka pasti ada di layar harga di akun Anda.
