# Scan domain melihat website seperti pengunjung melihatnya

Nama yang diketik orang ke address bar adalah domain. Di belakangnya ada hosting atau VPS yang sudah jalan. Scan domain Sinexis tidak masuk ke folder itu.

Yang dilihat: sisi luar. Persis yang dilihat pengunjung, crawler, dan orang yang iseng mengetik nama Anda. Tidak ada panel hosting yang dibuka. Tidak ada program yang perlu dipasang.

Analogi yang pas bukan "audit gudang". Lebih seperti berdiri di etalase. Kaca, papan nama, gembok di pintu depan. Isi gudang urusan lain.

## Yang benar-benar diambil potretnya

**DNS.** Nama masih mengarah ke tempat yang masuk akal, atau sudah nyasar setelah pindah penyedia. Perubahan kecil di catatan nama sering tidak ada yang sadar sampai situs "aneh" seminggu kemudian.

**Sertifikat HTTPS.** Gembok di browser masih hidup, nama di sertifikat cocok, dan tanggal kedaluwarsa belum di depan mata. Yang hampir mati bulan depan lebih berguna diketahui sekarang daripada saat pengunjung sudah dapat peringatan.

**Header keamanan.** Browser modern mengharapkan beberapa aturan dikirim situs. Aturan ini sering hilang setelah ganti tema, plugin, atau pindah mesin. Bukan kesalahan moral. Cuma yang terlewat.

**Teknologi yang terbaca.** Jenis web server dan platform yang kelihatan dari luar. Catatan postur, bukan audit kode, bukan daftar plugin di dalam CMS.

**Subdomain publik.** Nama lama yang masih hidup di catatan publik, kadang masih menunjuk ke mesin yang sudah tidak ada yang merawat. Pintu samping yang lupa dikunci.

Satu kali jalan memberi gambar hari itu. Jadwal yang membuatnya jadi kebiasaan. Tanpa jadwal, hasilnya cepat basi.

## Kenapa ini terasa berguna padahal "situs kan sudah live"

Karena live bukan berarti permukaan dirawat. Situasi paling umum: tidak ada orang yang punya waktu tiga puluh menit tiap bulan untuk mengecek hal-hal kecil.

Yang biasanya lolos:

- Sertifikat mendekati habis, perpanjangan tidak ada di kalender siapa pun.
- Header hilang setelah update.
- Catatan DNS tersenggol saat perubahan lain.
- Subdomain staging atau "old" masih nyala.

Tidak dramatis. Justru itu yang berbahaya: kecil, sepele, dan terbuka ke internet.

## Yang diperiksa dan yang tidak

| Dari luar | Bukan dari sini |
|---|---|
| DNS, HTTPS, header keamanan | Berkas di disk server |
| Teknologi yang terbaca publik | Plugin bermasalah di dalam CMS |
| Subdomain yang tercatat publik | Logika bisnis: checkout, hak akses, alur login |
| Perubahan dibanding pemeriksaan sebelumnya | Malware di hosting (itu Host Protect) |

## Batas yang kami jaga

Kami tidak memperbaiki. Hasilnya daftar temuan plus penjelasan. Tindakannya di tangan Anda atau tim hosting.

Berkas di disk bukan wilayah scan domain. Host Protect yang membaca disk, dan itu butuh helper di mesin. Helper belum ada: statusnya menunggu. Kami tidak mengarang temuan WordPress di server yang isinya aplikasi lain.

Ini juga bukan Guard. Tidak ada yang membaca kejadian di dalam server tiap jam. Scan domain jalan dari internet, sesekali, sesuai jadwal.

Bukan pengganti pentest. Salah pengaturan hak akses atau lubang di alur pemesanan hanya ketemu kalau ada orang yang menelusuri aplikasi Anda. Lapisan dasar yang rutin, bukan simulasi serangan.

## Setelah hasilnya keluar

Dasbor mengelompokkan menurut keparahan, dengan penjelasan singkat. Bisa diekspor jadi laporan yang masuk akal dibaca orang non-teknis.

Hidupkan jadwal, maka pemeriksaan berikutnya dibandingkan dengan yang sekarang. Email menonjolkan perubahan serius, bukan seluruh daftar diulang. Itu Scan Attach, dibahas di artikel tersendiri.

Setiap jalan memakai kredit. Tarifnya tampil di layar harga di dalam akun, sebelum tombol ditekan. Tidak ada angka di halaman ini.

## Langkah berikutnya

Pilih domain yang benar-benar diketik pelanggan. Bukan subdomain percobaan.

Buka **sinexis.app**, daftar, jalankan satu scan domain, baca sekali. Kalau isinya pantas jadi bahan rapat bulanan, hidupkan jadwalnya.
