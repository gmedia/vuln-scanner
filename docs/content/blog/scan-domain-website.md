# Scan domain: cek website yang sudah online

Domain itu nama yang diketik pengunjung. Di belakangnya hosting atau VPS. Scan domain Sinexis melihat sisi itu dari internet — bukan folder di laptop Anda, bukan “kami masuk server lalu beresin plugin.”

## Yang biasanya muncul di hasil

DNS: nama masih mengarah ke tempat yang masuk akal, atau sudah nyasar. Gembok HTTPS: sertifikat masih hidup atau hampir habis. Header keamanan: aturan yang browser harapkan dari situs. Dari luar kadang kelihatan stack-nya (bukan audit kode). Subdomain yang tercatat di catatan publik (crt.sh) ikut kelihatan kalau ada.

Ini pemeriksaan postur. Bukan pentest “kami coba bobol.”

## Kapan ini berguna

Situs sudah live, orang pakai HTTPS, dan Anda tidak sempat cek manual tiap bulan. Yang sering lolos: sertifikat hampir kedaluwarsa, header berubah setelah migrasi, DNS tersenggol tanpa ada yang sadar.

Mulai dari **satu domain yang benar-benar dipakai pelanggan**. Jangan masukkan semua subdomain percobaan ke paket kecil.

## Yang tidak terjadi otomatis

Plugin WordPress tidak kami perbaiki. File di disk hosting tidak kami scan virus. Tidak ada jaminan “tidak bisa diretas.”

Hasilnya di dasbor. Kalau jadwal hidup, perubahan yang serius dibanding bulan lalu bisa ke email — itu Scan Attach, artikel terpisah.
