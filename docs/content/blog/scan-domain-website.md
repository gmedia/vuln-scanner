# Scan domain: cek website yang sudah online

Domain adalah nama yang diketik pengunjung (contoh: toko Anda di internet). Di belakangnya ada hosting atau VPS. **Scan domain** Sinexis memeriksa **sisi yang terlihat dari internet**, bukan folder di komputer Anda.

## Apa yang dicek

- **DNS** — apakah nama domain mengarah ke tempat yang masuk akal
- **Sertifikat (TLS/HTTPS)** — gembok di browser: masih valid atau hampir kedaluwarsa
- **Header keamanan** — “aturan lalu lintas” yang browser harapkan dari situs
- **Sidik jari teknologi** — stack yang terlihat dari luar (bukan audit kode sumber)
- **Subdomain publik** — nama lain yang tercatat di catatan publik (crt.sh), jika ada

Ini **bukan** meretas situs Anda. Ini pemeriksaan postur: apa yang orang luar bisa lihat.

## Kapan relevan

Anda punya website di hosting bersama, VPS, atau cloud. Pengunjung memakai HTTPS. Anda ingin tahu jika sertifikat, header, atau catatan DNS berubah tanpa Anda sadar.

## Yang tidak termasuk

- Memperbaiki plugin WordPress secara otomatis
- Scan virus file di disk hosting
- Jaminan “tidak bisa diretas”

Hasilnya masuk dasbor Sinexis. Kalau Anda pasang **jadwal**, perubahan penting dibanding bulan lalu bisa dikirim email — itu modul Scan Attach, dibahas di artikel terpisah.

Mulai dari **satu domain publik** yang benar-benar dipakai pelanggan. Jangan campur semua subdomain percobaan di paket kecil.
