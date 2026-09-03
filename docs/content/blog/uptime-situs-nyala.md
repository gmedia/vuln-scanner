# Uptime: apakah website atau port masih nyala?

Scan keamanan menjawab satu pertanyaan: pintu dan gemboknya masih wajar? Uptime menjawab pertanyaan yang sama sekali lain: **dari internet, situs atau port ini masih merespons?**

Dua pertanyaan berbeda, dua jawaban berbeda. Yang satu tidak menggantikan yang lain.

Bedanya juga di ritme. Scan berjalan sesekali sesuai jadwal; Uptime memeriksa tiap beberapa menit. Sama-sama dari luar, dan sama-sama tidak butuh program dipasang di server Anda.

## Analoginya

Scan adalah inspeksi kunci dan jendela: mana yang lemah, mana yang perlu diganti. Uptime adalah melihat lampu toko masih menyala saat lewat di depannya.

Kalau lampunya mati, Anda tahu dalam hitungan menit — bukan sebulan kemudian saat ada pelanggan yang mengeluh.

Keduanya bukan pemantauan dari dalam server, dan bukan pemeriksaan berkas di disk. Yang terakhir itu pekerjaan Host Protect.

## Yang dicek

**HTTP(S)** — halaman publik menjawab atau tidak. Bukan analisis isi halaman, bukan pemeriksaan keamanan. Cuma: hidup atau mati.

**TCP** — port tertentu masih menerima koneksi. Misalnya port web, atau port SSH yang seharusnya selalu bisa dijangkau tim Anda.

**DNS** — opsional, memastikan nama domain masih mengarah ke alamat yang benar.

**Heartbeat** — opsional, memastikan server Anda masih mengirim sinyal hidup secara berkala. Berguna untuk pekerjaan yang jalan di latar belakang, misalnya proses backup terjadwal.

Saat status turun lalu naik kembali, notifikasi bisa dikirim. Yang dikirim adalah kabar hidup atau mati — bukan analisis celah keamanan, bukan daftar kerentanan.

## Kalau situsnya mati, apa yang Anda dapat

Anda dapat waktu. Tahu lebih cepat berarti bisa menghubungi penyedia hosting sebelum keluhan pelanggan menumpuk, dan punya catatan jam berapa gangguan mulai serta berapa lama berlangsung.

Catatan waktu itu yang biasanya paling berguna saat membahas gangguan dengan penyedia layanan Anda. Bukan ingatan, tapi data.

## Yang dicek dan yang tidak

| Dicek oleh Uptime | Bukan dari sini |
|---|---|
| Situs hidup atau mati dari internet | Kenapa situs mati (itu ada di log server) |
| Port menerima koneksi atau tidak | Kerentanan di port itu (itu Scan IP) |
| Waktu respons dari luar | Performa di dalam server |
| Notifikasi saat status turun | Perbaikan otomatis |

## Batasnya

Uptime tidak memperbaiki apa pun dan tidak memindahkan hosting Anda. Kalau situs mati, tetap Anda atau penyedia server yang bertindak.

Ini juga bukan jaminan SLA. Angka ketersediaan yang mengikat ada di kontrak dengan penyedia hosting atau colo Anda; Uptime hanya mengonfirmasi dari luar apa yang benar-benar terlihat.

Dan bukan pengganti Scan Attach, bukan Guard, bukan perlindungan dari malware. Situs bisa menyala sempurna sambil punya sertifikat yang hampir kedaluwarsa — itu sebabnya keduanya tetap perlu.

## Cara memakainya dengan waras

Pantau alamat yang sama dengan yang Anda scan. Kalau "website booking" adalah aset yang diperiksa rutin, itu juga yang paling masuk akal dipantau tiap beberapa menit.

Jangan memasukkan puluhan URL percobaan. Satu alamat produksi yang benar-benar dipakai pelanggan lebih berguna daripada sepuluh alamat yang tidak ada yang peduli kalau mati.

Uptime bisa dinyalakan atau dimatikan per target, jadi tidak semua aset harus dipantau. Kalau menunya belum muncul di akun Anda, modulnya kemungkinan belum diaktifkan untuk lingkungan itu.

## Langkah berikutnya

Buka **sinexis.app**, lalu tambahkan satu monitor untuk alamat produksi yang paling penting.

Biarkan berjalan seminggu. Setelah itu Anda punya gambaran nyata tentang seberapa stabil layanan Anda dari luar — dan apakah perlu monitor kedua.
