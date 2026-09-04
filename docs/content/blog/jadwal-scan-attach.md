# Scan Attach: yang dibaca adalah perubahannya

Scan sekali benar untuk hari itu. Bulan depan, hasilnya sudah menjadi arsip.

Scan Attach adalah janji yang diulang: domain atau IP diperiksa lagi tiap minggu atau tiap bulan, otomatis. Pertanyaan yang dijawab bukan "apa saja temuannya". Yang lebih berguna: **apa yang baru dan lebih berbahaya dibanding terakhir kali?**

Kata *attach* dipakai karena modul ini menempel di colo, VPS, atau hosting yang sudah Anda bayar. Bukan ganti rak. Bukan orang yang membaca log sepanjang malam. Pemeriksaan tetap dari internet. Tidak ada agen yang dipasang untuk jadwal ini.

Satu kali nmap di hari Jumat itu ingatan. Jadwal baru namanya kontrol.

## Cara kerjanya

Anda pilih ritme: bulanan atau mingguan, sesuai paket. Jumlah jadwal per organisasi ada batasnya. Batas itu bagian dari produk, bukan angka yang dinaikkan karena diminta ramah.

Urutannya pendek:

1. **Tunjuk target.** Satu domain atau satu IP. Lebih aman lewat aset yang sudah diberi nama, supaya orang lain tidak salah sasaran.
2. **Pastikan kredit ada.** Jadwal memakai kredit yang sama seperti scan manual. Nol berarti berhenti.
3. **Hidupkan.** Siklus pertama jadi acuan.
4. **Baca selisihnya.** Periode berikutnya bukan daftar dari nol. Perbandingan.

## Yang berubah di rapat bulanan

Acuan disimpan. Yang ditonjolkan temuan parah yang baru muncul, bukan baris yang sama dikirim ulang.

Temuan serius bisa masuk email; kelengkapannya tergantung paket. Ada laporan HTML ringkas dalam Bahasa Indonesia yang pantas diteruskan ke pemilik usaha, manajer, atau GM properti tanpa harus diterjemahkan dulu oleh orang IT.

Efeknya sederhana: percakapan tidak lagi "sepertinya aman". Menjadi "bulan ini ada dua perubahan, satu sudah ditutup".

Itu alasan attach dijual di samping infra, bukan sebagai sirkus vendor kedua.

## Kalau kredit habis

Jadwal berhenti sendiri. Tidak ada pemeriksaan yang dipaksa. Tidak ada tagihan yang muncul di belakang.

Isi ulang atau naikkan paket, lalu hidupkan lagi. Riwayat tidak hilang. Perbandingan bisa disambung.

## Yang dari Attach, yang bukan

| Dari jadwal Attach | Bukan dari sini |
|---|---|
| Perubahan temuan dibanding periode sebelumnya | Pemantauan log di dalam server |
| Temuan parah baru | Patch otomatis |
| Laporan HTML ringkas untuk diteruskan | Dasbor SIEM lengkap |
| Email untuk temuan serius | Alert tiap menit |

## Batas sejak awal, supaya tidak kecewa

Bukan SIEM. Bukan tim jaga 24 jam. Jalan sesuai kalender, dari luar.

Bukan Guard. Guard adalah alarm di dalam dengan satu agen per mesin. Menghidupkan Attach tidak memasang agen.

Bukan pentest. Alur pemesanan dan hak akses yang rumit tetap butuh manusia. Attach menjaga lapisan dasarnya tidak dibiarkan setahun tanpa dilihat.

Tidak ada janji aman total. Yang dijanjikan: kalau permukaan berubah jadi lebih berisiko, Anda tahu dalam hitungan minggu, bukan setelah ada yang menyalahgunakan.

## Buat siapa ini terasa

Tim kecil tanpa orang khusus keamanan, dengan beberapa alamat yang menghadap pelanggan.

Penyedia colo atau VPS yang ingin satu baris di tagihan yang bisa dibuktikan tiap bulan.

Kantor atau properti yang rutin ditanya kondisi keamanan dan butuh jawaban satu halaman, bukan folder PDF.

## Langkah berikutnya

Pilih satu alamat yang benar-benar menghadap pelanggan. Jalankan satu scan manual di **sinexis.app**, baca.

Kalau isinya pantas jadi rutinitas, hidupkan jadwal. Periode berikutnya Anda hanya membaca yang berubah.
