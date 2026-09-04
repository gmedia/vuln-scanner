# Scan IP: pintu server mana yang terbuka ke publik

IP adalah nomor yang dipakai internet untuk menemukan mesin Anda. VPS, dedicated, dan colo hampir selalu punya satu yang bisa diketuk dari luar.

Scan IP Sinexis mengetuk dari jalan. Pintu mana yang menjawab, layanan apa di balik pintu itu, versi berapa, dan apakah versi itu punya catatan kerentanan yang sudah diumumkan publik.

Teknisi kami tidak masuk sistem operasi. Tidak ada agen yang dipasang untuk pemeriksaan ini. Yang terlihat hanyalah apa yang mesin Anda sendiri sodorkan ke internet.

## Isi satu kali jalan

**Port terbuka.** Layanan yang menjawab dari luar. Mesin yang "cuma untuk web" kadang masih membuka pintu lain yang lupa ditutup sejak instalasi pertama.

**Layanan dan versi.** Siapa yang bicara di balik port itu. Web server, panel, database, atau sesuatu yang seharusnya hanya hidup di jaringan dalam.

**Kerentanan publik yang cocok.** Kalau versi yang terdeteksi ada di database kerentanan terbuka, itu tampil. Sumbernya catatan publik, bukan tebakan internal kami.

**Tingkat keparahan.** Supaya jelas mana yang perlu dibahas minggu ini, mana yang cukup dicatat.

Satu peringatan yang sering dilupakan: versi yang punya catatan kerentanan **bukan** bukti mesin sudah dibobol. Artinya ada permukaan yang perlu dicek dan, kalau perlu, ditutup atau diperbarui.

## Kapan ini terasa relevan

Anda pegang IP tetap, dan tidak ada yang rutin bertanya "apa saja yang masih terbuka dari internet".

Pola yang berulang:

- Database terlihat dari luar, padahal aplikasi saja yang seharusnya bicara dengannya.
- Panel kelola atau SSH yang dibiarkan publik "sementara", lalu lupa.
- Port baru muncul setelah migrasi, container, atau instalasi semalam.
- Pihak manajemen minta bukti berkala bahwa permukaan server masih sesuai kesepakatan.

## Yang dicek, yang tidak

| Dari internet | Bukan dari sini |
|---|---|
| Port yang menjawab | Isi sistem operasi |
| Layanan dan versi | Isi database atau berkas aplikasi |
| Kerentanan publik yang cocok | Aturan firewall (kami tidak mengubahnya) |
| Perubahan vs acuan sebelumnya | Berkas mencurigakan di disk (Host Protect) |

## Bukan panel, bukan Uptime, bukan Guard

Keamanan di dalam panel hosting bekerja dari dalam: berkas, akun, konfigurasi. Scan IP bekerja dari arah berlawanan. Keduanya bisa hidup berdampingan. Yang satu tahu isi rumah. Yang satu tahu apa yang kelihatan dari jalan.

Cek "masih nyala" tiap beberapa menit adalah pekerjaan Uptime, bukan scan IP.

Alarm dari dalam mesin ada di Guard: modul terpisah, satu agen per VM. Menghidupkan scan IP tidak memasang apa pun.

Kami tidak pasang patch otomatis dan tidak menutup port untuk Anda. Keputusan tetap di tangan Anda atau penyedia server.

Sama seperti scan lain, ini bukan pengganti pengujian manusia. Daftar permukaan, bukan simulasi serangan menyeluruh.

## Cara baca hasil tanpa panik

Mulai dari yang paling parah. Tiga pertanyaan biasanya cukup:

1. Layanan ini memang perlu terbuka ke publik?
2. Versinya masih dirawat?
3. Kalau tidak perlu publik, bisakah dibatasi ke jaringan dalam atau VPN?

Sering kali langkah termurah bukan menambal, tapi menutup pintu yang sejak awal tidak perlu ada.

## Langkah berikutnya

Pilih satu IP yang benar-benar melayani pelanggan, bukan mesin percobaan.

Buka **sinexis.app**, daftar, jalankan satu scan IP. Kredit terpotong sesuai layar harga di akun. Kalau hasilnya pantas jadi acuan, hidupkan jadwal supaya bulan depan yang Anda baca adalah selisihnya.
