# Scan Attach: jadwal, perubahan, dan laporan bulanan

Scan sekali itu seperti cek kesehatan sekali. Hasilnya benar untuk hari itu, tapi bulan depan sudah basi.

Scan Attach adalah janji berulang: domain dan/atau IP Anda diperiksa lagi tiap minggu atau tiap bulan, otomatis. Pertanyaan yang dijawab bukan "apa saja temuannya", tapi yang lebih berguna: **apa yang baru dan lebih berbahaya dibanding pemeriksaan sebelumnya?**

Kata "attach" dipakai karena modul ini menempel di layanan yang sudah Anda bayar — colo, VPS, atau hosting. Bukan hosting pengganti, dan bukan pemantauan log 24 jam. Untuk jadwal ini tidak ada agen yang perlu dipasang; pemeriksaan tetap dari internet.

## Cara kerjanya

Anda pilih ritmenya: bulanan atau mingguan, sesuai paket yang diambil. Jumlah jadwal per organisasi ada batasnya, dan batas itu bagian dari produk — bukan angka yang bisa dinaikkan sekadar karena diminta.

Urutannya:

1. **Tunjuk target.** Satu domain atau satu IP. Lebih aman lewat aset yang sudah diberi nama, supaya tidak salah sasaran.
2. **Pastikan kredit tersedia.** Jadwal memakai kredit yang sama seperti scan manual. Kredit habis berarti jadwal berhenti.
3. **Hidupkan jadwal.** Siklus pertama jalan otomatis dan jadi acuan awal.
4. **Baca selisihnya.** Periode berikutnya yang Anda lihat bukan daftar panjang dari nol, tapi perbandingan dengan hasil sebelumnya.

## Yang berubah di operasional harian

Hasil pemeriksaan sebelumnya disimpan sebagai acuan. Yang ditonjolkan adalah temuan parah yang **baru muncul**, bukan tumpukan baris yang sama tiap bulan.

Kalau ada temuan serius, notifikasi email dikirim; kelengkapannya tergantung paket. Ada juga laporan HTML ringkas dalam Bahasa Indonesia yang masuk akal diteruskan ke pemilik usaha, manajer, atau GM hotel tanpa perlu diterjemahkan dulu oleh orang IT.

Efek sampingnya sederhana tapi penting: pembicaraan keamanan bulanan jadi punya bahan. Bukan "sepertinya aman", tapi "bulan ini ada dua perubahan, satu sudah ditutup".

## Kalau kredit habis

Jadwal berhenti dengan sendirinya. Tidak ada pemeriksaan yang dipaksa jalan, dan tidak ada tagihan tambahan yang muncul di belakang.

Isi ulang kredit atau naikkan paket, lalu hidupkan jadwalnya lagi. Riwayat sebelumnya tidak hilang, jadi perbandingan bisa dilanjutkan.

## Yang dicek dan yang tidak

| Dari jadwal Attach | Bukan dari sini |
|---|---|
| Perubahan temuan dibanding periode sebelumnya | Pemantauan log di dalam server |
| Temuan parah baru yang perlu perhatian | Patch otomatis atau perbaikan |
| Laporan HTML ringkas untuk diteruskan | Dasbor SIEM lengkap |
| Notifikasi email untuk temuan serius | Alert real-time setiap menit |

## Batas yang perlu jelas sejak awal

Scan Attach bukan SIEM dan bukan tim yang berjaga tiap jam. Ia berjalan sesuai jadwal, dari luar.

Ini juga bukan Guard. Guard adalah alarm di dalam server dengan satu agen per mesin, dan itu modul terpisah. Menghidupkan jadwal Attach tidak memasang agen apa pun.

Bukan pula pengganti pengujian oleh manusia. Kalau aplikasi Anda punya alur pemesanan atau hak akses yang rumit, tetap perlu orang yang menelusurinya. Attach menjaga lapisan dasarnya tetap terpantau.

Dan tidak ada janji "aman 100%". Yang dijanjikan: kalau permukaan Anda berubah menjadi lebih berisiko, Anda tahu dalam hitungan minggu, bukan setahun kemudian.

## Buat siapa ini paling terasa

Tim kecil yang tidak punya orang khusus keamanan, tapi punya satu sampai beberapa alamat yang menghadap pelanggan.

Pemilik layanan hosting atau colo yang ingin menambahkan satu baris keamanan yang bisa dibuktikan tiap bulan, bukan janji lisan.

Kantor atau properti yang secara berkala ditanya "keamanan kita bagaimana?" dan butuh jawaban satu halaman.

## Langkah berikutnya

Pilih satu domain atau IP yang benar-benar menghadap pelanggan. Jalankan satu scan manual dulu di **sinexis.app**, lalu baca hasilnya.

Kalau isinya masuk akal untuk dilaporkan rutin, hidupkan jadwalnya. Periode berikutnya Anda hanya perlu membaca perubahannya.
