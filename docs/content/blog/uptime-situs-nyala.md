# Uptime: tahu situsnya mati sebelum pelanggan yang bilang

Scan bertanya: pintu dan gemboknya masih wajar? Uptime bertanya hal lain: **dari internet, situs atau port ini masih merespons?**

Jawaban yang satu tidak menggantikan yang lain. Ritmenya juga beda. Scan jalan sesekali. Uptime mengetuk tiap beberapa menit. Keduanya dari luar. Keduanya tidak minta program dipasang di server.

Analoginya kasar tapi cukup: scan memeriksa kunci. Uptime melihat lampu toko masih nyala saat lewat. Kalau lampu mati, Anda tahu dalam hitungan menit, bukan sebulan kemudian dari keluhan.

## Yang benar-benar diketuk

**HTTP(S).** Halaman publik menjawab atau tidak. Bukan baca isi, bukan audit keamanan. Hidup atau mati.

**TCP.** Port tertentu masih menerima koneksi. Port web, atau port yang tim Anda harapkan selalu terjangkau.

**DNS.** Opsional. Nama masih mengarah ke alamat yang benar.

**Heartbeat.** Opsional. Mesin masih mengirim sinyal hidup. Berguna untuk pekerjaan latar, misalnya cadangan terjadwal.

Saat status turun lalu naik, notifikasi bisa dikirim. Isinya kabar hidup atau mati. Bukan daftar kerentanan. Bukan analisis kenapa mesin mati. Alasan ada di log server Anda, atau di tiket penyedia.

## Yang Anda dapat saat mati

Waktu. Kabar lebih cepat, plus catatan jam berapa mulai dan berapa lama. Itu bahan yang berguna saat bicara dengan hosting atau colo. Bukan ingatan orang yang "kayaknya dari tadi siang".

Uptime tidak memindahkan situs, tidak ganti DNS, tidak hidupkan mesin. Tetap Anda atau penyedia yang bertindak.

## Tabel batas

| Dicek Uptime | Bukan dari sini |
|---|---|
| Nyala atau mati dari internet | Kenapa mati |
| Port terima koneksi atau tidak | Lubang di port itu (Scan IP) |
| Waktu merespons dari luar | Performa di dalam mesin |
| Notifikasi saat turun | Perbaikan otomatis |

## Yang sering tertukar

Ini bukan jaminan SLA. Angka ketersediaan yang mengikat ada di kontrak penyedia Anda. Uptime hanya mengonfirmasi apa yang terlihat dari luar.

Scan Attach tetap terpisah: situs bisa nyala sempurna sambil sertifikat hampir kedaluwarsa.

Guard juga terpisah. Tidak ada agen di sini, tidak ada alert dari dalam mesin.

Host Protect tidak ikut. Uptime tidak membaca berkas di disk.

Kalau menunya belum muncul di akun, modulnya mungkin belum diaktifkan di lingkungan itu. Jangan anggap hilang berarti "sudah termasuk diam-diam".

## Pakai dengan hemat

Pantau alamat yang sama dengan yang Anda scan. Aset "website booking" yang dicek bulanan biasanya aset yang sama yang pantas diketuk tiap beberapa menit.

Jangan masukkan puluhan URL percobaan. Satu alamat produksi yang benar-benar dipakai lebih berguna daripada sepuluh yang tidak ada yang peduli kalau mati.

Monitor bisa hidup atau mati per target. Tidak semua aset wajib dipantau.

## Nyalakan satu monitor

Buka **sinexis.app**. Tambah satu monitor untuk alamat produksi yang paling penting.

Biarkan seminggu. Setelah itu Anda punya gambaran, dari luar, seberapa sering layanan Anda benar-benar menjawab, dan apakah perlu monitor kedua.
