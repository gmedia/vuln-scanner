# Scan IP mengetuk pintu server dari internet

IP adalah nomor yang membuat mesin Anda bisa dipanggil dari luar. VPS, dedicated, colo: hampir selalu ada satu yang menghadap publik.

Scan IP Sinexis mengetuk dari jalan. Pintu mana yang terbuka. Siapa yang menjawab. Apakah versi layanan itu punya catatan kerentanan yang sudah diumumkan publik.

Teknisi tidak masuk ke sistem operasi Anda. Program tidak perlu dipasang untuk pemeriksaan ini. Kami tetap di luar.

## Isi ketukannya

**Port terbuka.** Layanan mana yang menjawab dari internet. Server "cuma untuk web" kadang masih membuka pintu lain yang lupa ditutup sejak instalasi pertama.

**Layanan dan versi.** Apa di balik tiap pintu, dan versi berapa. Web server. Kadang database yang seharusnya hanya kelihatan dari dalam. Kadang panel pengelolaan yang masih publik.

**Kerentanan publik yang cocok.** Kalau versi yang terdeteksi punya catatan di database kerentanan terbuka, itu ditampilkan. Sumbernya publik, bukan tebakan kami.

**Tingkat keparahan.** Supaya jelas mana yang perlu dibahas minggu ini, mana yang cukup jadi catatan.

Satu hal yang sering salah dibaca: versi yang punya catatan kerentanan bukan berarti mesin sudah dibobol. Artinya ada permukaan yang sebaiknya diperiksa dan, kalau perlu, ditutup atau diperbarui.

## Kapan ini relevan

Anda punya IP tetap, dan tidak ada yang rutin bertanya "apa saja yang masih terbuka dari luar?"

Situasi yang berulang:

- Database menghadap internet padahal cukup diakses dari jaringan dalam.
- Panel atau layanan pengelolaan masih terjangkau publik.
- Port baru muncul setelah migrasi atau pasang perangkat lunak, tanpa ada yang mencatat.
- Anda butuh bukti berkala bahwa permukaan masih sama seperti yang disepakati tim.

## Yang diperiksa dan yang tidak

| Dari luar | Bukan dari sini |
|---|---|
| Port yang menjawab dari internet | Pengaturan di dalam sistem operasi |
| Layanan dan versi yang terlihat | Isi database atau berkas aplikasi |
| Kerentanan publik yang cocok | Aturan firewall (kami tidak mengubahnya) |
| Perubahan dibanding sebelumnya | Berkas mencurigakan di disk (itu Host Protect) |

## Batasnya

Tidak ada patch otomatis. Tidak ada yang mengubah firewall Anda. Keputusan tetap di tangan Anda atau penyedia server.

Ini bukan Guard. Guard butuh satu agen di dalam mesin, dan itu modul terpisah. Menghidupkan scan IP tidak memasang apa pun.

Bukan Uptime. Uptime menjawab "masih nyala?" tiap beberapa menit. Scan IP menjawab "pintu apa yang terbuka, dan apa risikonya?" Ritme dan pertanyaannya beda.

Bukan pentest. Daftar permukaan, bukan simulasi serangan. Manusia tetap perlu kalau kontrak atau audit mewajibkan uji mendalam.

## Bedanya dengan fitur keamanan di panel

Panel hosting yang punya antivirus atau pemindai berkas bekerja dari dalam: melihat file, akun, konfigurasi.

Scan IP bekerja dari arah berlawanan. Yang satu tahu isi rumah. Yang satu tahu apa yang kelihatan dari jalan. Keduanya bisa jalan berdampingan. Yang satu tidak menggantikan yang lain.

Kalau Anda sudah punya pemindai di panel, scan IP tetap berguna justru karena sudutnya berbeda: ia melihat apa yang *sengaja atau tidak* Anda buka ke publik.

## Cara membaca tanpa panik

Mulai dari yang paling parah. Tiga pertanyaan cukup:

1. Layanan ini memang perlu terbuka ke internet?
2. Versinya masih didukung?
3. Kalau tidak perlu publik, bisakah dibatasi ke jaringan dalam atau VPN?

Sering kali langkah termurah bukan menambal. Menutup pintu yang sejak awal tidak perlu dibuka.

## Langkah berikutnya

Pilih satu IP yang benar-benar melayani pelanggan. Buka **sinexis.app**, daftar, jalankan satu scan IP.

Kredit terpotong per jalan; lihat layar harga di akun sebelum menekan. Kalau hasilnya terasa jadi bahan yang bisa dibahas, hidupkan jadwal supaya perbandingannya jalan sendiri.
