# Uptime: lampu toko masih nyala, atau sudah padam

Scan keamanan bertanya: pintu dan gemboknya masih wajar? Uptime bertanya hal lain: **dari internet, situs atau port ini masih merespons?**

Dua pertanyaan. Dua jawaban. Yang satu tidak menggantikan yang lain.

Ritmenya juga beda. Scan jalan sesekali sesuai jadwal. Uptime mengetuk tiap beberapa menit. Sama-sama dari luar. Sama-sama tidak butuh program di server Anda.

Scan adalah inspeksi kunci. Uptime adalah lewat depan toko dan melihat lampunya. Kalau padam, Anda tahu dalam hitungan menit, bukan dari pelanggan yang sudah marah.

Keduanya bukan pemantauan dari dalam. Keduanya bukan baca disk. Baca disk itu Host Protect.

## Yang diketuk

**HTTP(S).** Halaman publik menjawab atau tidak. Bukan analisis isi. Bukan celah keamanan. Hidup atau mati.

**TCP.** Port tertentu masih menerima koneksi. Port web, atau port yang tim Anda harapkan selalu bisa dihubungi.

**DNS.** Opsional. Nama masih mengarah ke alamat yang benar.

**Heartbeat.** Opsional. Mesin masih mengirim sinyal hidup. Berguna untuk kerja latar, misalnya cadangan terjadwal.

Saat status turun lalu naik, notifikasi bisa dikirim. Isinya kabar hidup atau mati. Bukan daftar kerentanan. Bukan saran patch.

## Yang Anda dapat kalau mati

Waktu. Tahu lebih cepat berarti bisa menghubungi penyedia sebelum antrean keluhan panjang. Ada catatan jam berapa mulai, berapa lama.

Catatan itu yang berguna saat berdebat dengan hosting atau colo. Bukan "kemarin sore rasanya sempat lemot". Data.

Uptime tidak menjelaskan *kenapa*. Kenapa ada di log server, di sisi penyedia, di aplikasi. Yang dipegang dari sini: dari luar, kapan berhenti menjawab.

## Yang dicek dan yang tidak

| Dicek Uptime | Bukan dari sini |
|---|---|
| Situs hidup atau mati dari internet | Penyebab (itu log server) |
| Port menerima koneksi atau tidak | Kerentanan di port itu (itu Scan IP) |
| Waktu respons dari luar | Performa di dalam mesin |
| Notifikasi saat status turun | Perbaikan otomatis, pindah hosting, jaminan SLA |

## Batasnya, supaya tidak dijadikan jimat

Tidak memperbaiki. Tidak memindahkan situs. Mati tetap Anda atau penyedia yang bertindak.

Bukan jaminan SLA. Angka yang mengikat ada di kontrak rak atau hosting. Uptime hanya mengonfirmasi apa yang terlihat dari internet.

Bukan Scan Attach. Bukan Guard. Bukan pelindung malware. Situs bisa menyala sempurna sambil punya sertifikat yang hampir kedaluwarsa, atau port database yang terbuka. Lampu nyala tidak berarti pintu terkunci.

Kalau menunya belum muncul di akun, modulnya mungkin belum diaktifkan untuk lingkungan itu. Jangan kira rusak. Tanya yang mengaktifkan flag.

## Pakai dengan waras

Pantau alamat yang sama dengan yang Anda scan. Aset "website booking" yang dicek bulanan adalah kandidat paling masuk akal untuk diketuk tiap beberapa menit.

Jangan masukkan puluhan URL percobaan. Satu alamat produksi yang benar-benar dipakai lebih berguna daripada sepuluh yang tidak ada yang peduli kalau mati.

Tidak semua aset harus dipantau. Nyalakan per target.

## Langkah berikutnya

Buka **sinexis.app**. Tambah satu monitor untuk alamat produksi yang paling merugikan kalau diam.

Biarkan seminggu. Setelah itu Anda punya gambaran, bukan tebakan, soal seberapa sering lampu itu padam dari luar.
