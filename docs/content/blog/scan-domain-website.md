# Scan domain: memeriksa website yang sudah online

Domain adalah nama yang diketik pengunjung Anda. Di belakang nama itu ada hosting atau VPS yang sudah berjalan.

Scan domain Sinexis melihat sisi luarnya — persis seperti yang dilihat pengunjung dan, sayangnya, juga orang yang berniat jahat. Kami tidak masuk ke folder di server, tidak membuka panel hosting, dan tidak perlu Anda memasang apa pun.

Analoginya sederhana: kami berdiri di trotoar depan ruko Anda dan mencatat kondisi pintu, gembok, dan papan nama. Bukan masuk ke gudang.

## Yang benar-benar diperiksa

**DNS.** Nama domain masih mengarah ke tempat yang masuk akal, atau sudah nyasar ke alamat lain. Ini sering berubah tanpa ada yang sadar setelah pindah penyedia.

**Sertifikat HTTPS.** Gembok di address bar masih hidup, atau sudah mendekati tanggal kedaluwarsa. Termasuk apakah nama di sertifikat cocok dengan domainnya.

**Header keamanan.** Ada beberapa aturan yang browser modern harapkan dikirim oleh situs. Aturan ini sering hilang setelah ganti tema, update, atau migrasi.

**Teknologi yang terlihat.** Jenis web server dan platform yang bisa dikenali dari luar. Ini bukan audit kode, hanya catatan apa yang terbaca publik.

**Subdomain yang tercatat publik.** Kadang muncul subdomain lama yang sudah dilupakan tapi masih hidup dan tidak ada yang merawatnya.

Semuanya adalah pemeriksaan **postur**: seberapa rapi permukaan situs Anda hari ini. Satu kali scan memberi gambaran hari itu. Jadwal yang membuatnya jadi kebiasaan.

## Kapan ini terasa berguna

Situasi paling umum: situs sudah live, jalan normal, dan tidak ada orang yang punya waktu memeriksa hal-hal kecil setiap bulan.

Yang biasanya lolos dari perhatian:

- Sertifikat HTTPS mendekati kedaluwarsa dan tidak ada yang ingat memperpanjang.
- Header keamanan hilang setelah update tema atau pindah hosting.
- Catatan DNS tersenggol saat ada perubahan lain.
- Subdomain lama masih menunjuk ke server yang sudah tidak dirawat.

Tidak ada yang dramatis di daftar itu. Tapi hal-hal kecil seperti inilah yang biasanya jadi pintu masuk.

## Yang diperiksa dan yang tidak

| Diperiksa dari luar | Tidak diperiksa |
|---|---|
| DNS, sertifikat HTTPS, header keamanan | Berkas di disk server |
| Teknologi yang terbaca publik | Plugin yang bermasalah di dalam CMS |
| Subdomain yang tercatat publik | Logika bisnis: checkout, hak akses, alur login |
| Perubahan dibanding pemeriksaan sebelumnya | Berkas mencurigakan di hosting (itu Host Protect) |

## Batasnya, supaya jelas

Kami tidak memperbaiki apa pun. Hasil scan adalah daftar temuan plus penjelasannya; tindakannya tetap di tangan Anda atau tim hosting Anda.

Scan domain juga tidak memeriksa berkas di disk. Pemeriksaan berkas mencurigakan adalah pekerjaan Host Protect, dan itu butuh program pembantu di mesin Anda. Kalau pembantunya belum ada, statusnya jujur "menunggu" — kami tidak mengarang temuan.

Ini juga bukan pemantauan dari dalam server. Scan domain berjalan dari internet, sesekali, sesuai jadwal; tidak ada yang membaca kejadian di server Anda tiap jam.

Dan pemeriksaan otomatis bukan pengganti pengujian oleh manusia. Kesalahan di alur pemesanan atau hak akses antar pengguna hanya ketemu kalau ada orang yang menelusurinya. Kami memberi lapisan dasar yang rutin, bukan pentest.

## Setelah hasilnya keluar

Hasil muncul di dasbor, dikelompokkan menurut tingkat keparahan, dengan penjelasan singkat per temuan. Bisa juga diekspor jadi laporan yang enak dibaca orang non-teknis.

Kalau Anda menghidupkan jadwal, pemeriksaan berikutnya otomatis dibandingkan dengan yang sekarang. Yang dikirim ke email hanya perubahan yang serius, bukan seluruh daftar berulang-ulang. Bagian itu dibahas terpisah di artikel tentang Scan Attach.

Setiap scan memakai kredit. Jumlahnya bisa Anda lihat di layar harga di dalam akun sebelum menekan tombol.

## Langkah berikutnya

Pilih satu domain yang benar-benar dipakai pelanggan Anda — bukan subdomain percobaan. Buka **sinexis.app**, daftar, dan jalankan satu scan domain.

Baca hasilnya sekali. Kalau isinya masuk akal untuk dilaporkan tiap bulan, hidupkan jadwalnya.
