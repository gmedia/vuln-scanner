# Scan IP: memeriksa server yang menghadap internet

IP adalah nomor rumah server Anda. VPS, dedicated server, dan colo hampir selalu punya satu yang bisa dijangkau dari internet.

Scan IP Sinexis mengetuk dari jalan. Pintu mana yang terbuka, siapa yang menjawab dari balik pintu itu, dan apakah ada kerentanan publik yang sudah diketahui untuk layanan tersebut.

Kami tetap di luar. Tidak ada teknisi yang masuk ke sistem operasi Anda, dan tidak ada program yang perlu dipasang untuk pemeriksaan ini.

## Isi pemeriksaannya

**Port yang terbuka.** Pintu mana saja yang menjawab dari internet. Kadang hasilnya mengejutkan: server yang "cuma untuk web" ternyata masih membuka layanan lain yang lupa ditutup sejak dulu.

**Layanan dan versinya.** Apa yang menjawab di balik setiap port, dan versi berapa. Misalnya jenis web server, atau sebuah database yang seharusnya tidak terlihat publik.

**Kerentanan publik yang cocok.** Kalau versi layanan yang terdeteksi punya catatan kerentanan yang sudah diumumkan publik, itu ditampilkan. Sumbernya database kerentanan terbuka, bukan tebakan kami sendiri.

**Tingkat keparahan.** Setiap temuan dikelompokkan supaya jelas mana yang perlu ditindak minggu ini dan mana yang sekadar catatan.

Perlu ditegaskan: mendeteksi versi yang punya catatan kerentanan bukan berarti server Anda sudah dibobol. Artinya ada permukaan yang sebaiknya diperiksa dan diperbarui.

## Kapan ini relevan

Anda punya IP tetap di VPS atau colo, dan tidak ada yang rutin memeriksa apa saja yang terbuka dari luar.

Beberapa situasi yang khas:

- Port database terbuka ke internet padahal seharusnya hanya diakses dari dalam.
- Layanan pengelolaan atau panel yang masih terjangkau publik.
- Ada port baru yang terbuka setelah migrasi atau instalasi terakhir, tanpa ada yang mencatat.
- Anda butuh bukti berkala bahwa permukaan server masih sama seperti yang disepakati.

## Yang diperiksa dan yang tidak

| Diperiksa dari luar | Tidak diperiksa |
|---|---|
| Port yang terbuka dari internet | Pengaturan di dalam sistem operasi |
| Layanan dan versi yang menjawab | Isi database atau berkas aplikasi |
| Kerentanan publik yang cocok | Aturan firewall Anda (kami tidak mengubahnya) |
| Perubahan dibanding pemeriksaan sebelumnya | Berkas mencurigakan di disk (itu Host Protect) |

## Batasnya

Kami tidak memasang patch otomatis dan tidak mengubah aturan firewall Anda. Keputusan dan eksekusinya tetap di tangan Anda atau penyedia server Anda.

Scan IP juga bukan pemantauan dari dalam server. Tidak ada program yang perlu dipasang untuk ini, dan tidak ada yang berjaga membaca kejadian tiap jam. Kalau Anda memang butuh alarm dari dalam server, itu pekerjaan Guard — modul terpisah, satu agen per mesin.

Ini juga bukan cek "masih nyala atau tidak" setiap beberapa menit. Untuk itu ada Uptime, yang dibahas di artikel tersendiri.

Dan seperti pemeriksaan otomatis lainnya, ini bukan pengganti pengujian oleh manusia. Hasil scan memberi daftar permukaan, bukan simulasi serangan menyeluruh.

## Bedanya dengan keamanan di dalam panel

Kalau server Anda memakai panel hosting dengan fitur keamanan sendiri, itu bekerja dari dalam: melihat berkas, akun, dan konfigurasi.

Scan IP bekerja dari arah berlawanan. Dua sudut pandang berbeda, dan keduanya bisa jalan berdampingan. Yang satu tahu isi rumah, yang satu tahu apa yang kelihatan dari jalan.

## Cara membaca hasilnya tanpa panik

Mulai dari yang paling parah, lalu tanyakan tiga hal: layanan ini memang perlu terbuka ke publik? Versinya masih didukung? Kalau tidak perlu publik, bisa dibatasi ke jaringan internal atau VPN?

Sering kali tindakan paling murah bukan menambal, tapi menutup pintu yang sejak awal tidak perlu dibuka.

## Langkah berikutnya

Pilih satu IP yang benar-benar melayani pelanggan Anda. Buka **sinexis.app**, daftar, lalu jalankan satu scan IP.

Setiap scan memakai kredit; biaya per jenis pemeriksaan bisa dilihat di layar harga di dalam akun sebelum Anda menjalankannya. Kalau hasilnya terasa berguna, hidupkan jadwal supaya perbandingannya jalan sendiri tiap bulan.
