# Scan domain: cek website yang sudah online

Domain itu nama yang diketik pengunjung. Di belakangnya hosting atau VPS. Scan domain Sinexis melihat sisi itu **dari internet**. Bukan folder di laptop. Bukan “kami masuk server lalu beresin plugin.” Bukan SIEM. Tidak perlu pasang agen.

OWASP membedakan **DAST** (uji aplikasi yang sudah hidup, dari luar) dari uji logika bisnis. Scan domain kami adalah **baseline postur**: DNS, gembok TLS, header yang browser harapkan, sidik jari stack, subdomain yang sudah tercatat publik. Bukan “kami coba bobol checkout.”

## Yang biasanya muncul

Nama masih mengarah ke tempat yang masuk akal, atau sudah nyasar. Gembok HTTPS: sertifikat masih hidup atau hampir habis. Aturan yang browser harapkan dari situs (header). Kadang kelihatan teknologi di luar (bukan audit kode). Subdomain yang tercatat di catatan publik ikut kelihatan kalau ada.

Ini pemeriksaan postur. Satu nmap — atau satu klik scan — **bukan kontrol**. Jadwal yang bikin jadi kebiasaan (artikel Scan Attach).

## Kapan berguna

Situs sudah live, orang pakai HTTPS, dan tidak ada yang sempat cek manual tiap bulan. Yang sering lolos: sertifikat hampir kedaluwarsa, header berubah setelah pindah hosting, DNS tersenggol tanpa ada yang sadar.

Mulai dari **satu domain yang benar-benar dipakai pelanggan**. Jangan masukkan semua subdomain percobaan ke paket kecil.

## Yang tidak otomatis

Plugin WordPress tidak kami perbaiki. File di disk hosting tidak kami cek virus dari scan domain (itu Host Protect + helper di VM — tanpa helper kami tidak mengarang temuan). Tidak ada jaminan “tidak bisa diretas.” Tidak mengganti WAF di edge panel, dan kami **tidak** menempel WAF ke nginx publik Sinexis.

Hasilnya di dasbor. Kalau jadwal hidup, perubahan yang serius dibanding bulan lalu bisa ke email — itu Scan Attach, artikel terpisah.
