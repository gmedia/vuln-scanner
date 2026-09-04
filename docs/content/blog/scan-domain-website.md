# Website sudah online. Scan domain melihat sisi luarnya

Nama domain adalah yang diketik pengunjung. Di belakangnya ada hosting atau VPS yang sudah hidup. Scan domain Sinexis tidak masuk ke situ.

Pemeriksaan ini berdiri di internet, melihat apa yang juga terlihat pengunjung, crawler, dan orang yang mencari lubang. Tidak buka folder di disk. Tidak minta akses panel. Tidak perlu memasang apa pun di server.

Satu kali jalan memberi foto hari itu. Yang membuatnya berguna adalah mengulanginya, lalu membandingkan.

## Apa yang benar-benar dilihat

**DNS.** Nama masih mengarah ke tempat yang masuk akal, atau sudah nyasar setelah pindah penyedia, ganti CDN, atau "perbaikan kecil" yang tidak dicatat.

**Sertifikat HTTPS.** Gembok di address bar masih hidup, nama di sertifikat cocok, dan tanggal kedaluwarsa tidak terlewat diam-diam.

**Header keamanan.** Browser modern mengharapkan beberapa aturan dikirim situs. Aturan ini sering hilang setelah ganti tema, plugin, atau pindah mesin.

**Teknologi yang terbaca publik.** Jenis web server atau platform yang kelihatan dari luar. Catatan permukaan, bukan audit kode.

**Subdomain yang tercatat di publik.** Staging lama, panel lama, atau "situs event tahun lalu" yang masih hidup tanpa yang merawat.

Itu pemeriksaan **postur**. Seberapa rapi permukaan hari ini. Bukan simulasi serangan, bukan tes logika bisnis.

## Kenapa ini lolos dari perhatian

Situs yang "sudah lancar" jarang punya orang yang duduk memeriksa DNS dan header tiap bulan. Yang biasanya ketahuan terlambat:

- Sertifikat hampir habis, perpanjangannya di akun orang yang sudah resign.
- Header hilang setelah update.
- Catatan DNS tersenggol saat migrasi email atau ganti nameserver.
- Subdomain lama masih menunjuk ke mesin yang sudah tidak dijaga.

Tidak ada yang terdengar heboh. Pintu masuk sering dari yang kecil dan membosankan.

## Yang masuk scan domain, yang tidak

| Dari luar | Bukan pekerjaan ini |
|---|---|
| DNS, HTTPS, header | Berkas di disk server |
| Teknologi yang terbaca publik | Plugin rusak di dalam CMS |
| Subdomain yang tercatat publik | Checkout, hak akses, alur login |
| Selisih vs pemeriksaan sebelumnya | Malware di hosting (itu Host Protect) |

## Batas yang kami jaga

Hasilnya daftar temuan plus penjelasan. Kami tidak menambal, tidak ganti tema, tidak sentuh DNS Anda. Tindakan tetap di tim Anda atau penyedia hosting.

Berkas di disk adalah pekerjaan Host Protect, dan itu butuh helper di mesin pelanggan. Kalau helper belum terpasang, statusnya jujur menunggu. Tidak ada temuan yang dikarang supaya laporan ramai.

Scan domain juga bukan Guard. Tidak ada agen. Tidak ada yang membaca kejadian di server tiap jam. Ritmenya sesekali, sesuai tombol atau jadwal.

Pemeriksaan otomatis bukan pengganti manusia. Salah harga di keranjang, hak akses antar cabang, atau bolong di alur login hanya ketemu kalau ada orang yang menelusuri. Ini lapisan dasar, bukan pentest.

## Setelah hasil keluar

Dasbor mengelompokkan temuan menurut keparahan, dengan bahasa yang bisa diteruskan ke orang non-teknis. Laporan bisa diekspor.

Kalau jadwal Attach hidup, pemeriksaan berikutnya dibanding dengan acuan. Email menonjolkan perubahan serius, bukan menempel daftar yang sama tiap minggu. Cara kerja jadwal ada di artikel Scan Attach.

Tiap scan memotong kredit. Bobot per jenis kelihatan di layar harga di dalam akun, sebelum tombol ditekan. Artikel ini tidak menyebut tarif.

## Satu domain dulu

Pilih nama yang benar-benar dipakai pelanggan, bukan subdomain percobaan.

Buka **sinexis.app**, daftar, jalankan satu scan domain, baca isinya sekali. Kalau pantas jadi bahan rapat bulanan, hidupkan jadwalnya.
