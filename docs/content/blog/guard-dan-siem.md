# Guard dan SIEM: setelah Scan, bukan pengganti Scan

Dua nama yang paling gampang tertukar di Sinexis. Keduanya juga bukan tempat memulai.

Bedanya begini. Scan adalah foto berkala dari luar: apa yang terlihat orang lewat dari internet. Guard dan SIEM bekerja dari arah dalam: apa yang terjadi di dalam mesin Anda. Banyak penawaran keamanan mencampur keduanya seolah satu barang. Kami memisahkannya, termasuk soal batasnya.

## Guard: lapisan tipis di dalam server

Guard adalah alarm di dalam VPS atau colo Anda. Yang tersedia sekarang cukup spesifik: **daftar mesin yang terdaftar, plus alert untuk peristiwa yang benar-benar kritis**.

Bukan "semua log ditelan". Bukan dasbor pemantauan lengkap yang diserahkan ke pelanggan. Bukan respons insiden otomatis.

Satu agen per mesin — satu `wazuh-agent`, bukan dua. Tidak ada program pendamping kedua yang harus dipasang di sebelahnya.

Yang Guard lakukan:

- Menampilkan inventaris mesin yang sudah terdaftar.
- Mengirim alert untuk peristiwa kritis, misalnya layanan penting yang mati atau perubahan yang mencurigakan.
- Meneruskan notifikasi itu ke tim Anda.

Yang Guard **tidak** lakukan:

- Menyimpan dan menampilkan seluruh log sepanjang hari.
- Menggantikan dasbor pemantauan penuh.
- Menjalankan otomasi atau respons insiden sendiri.
- Membaca berkas di disk — itu pekerjaan Host Protect.

Analoginya: Scan melihat toko dari trotoar. Guard adalah alarm di dalam yang berbunyi untuk hal serius. Dua perspektif, dua pekerjaan berbeda.

Syarat wajarnya: Anda sudah nyaman dengan Scan berkala lebih dulu. Guard adalah lapisan kedua, dan pemasangan atau pelepasan agennya dikerjakan bersama tim operasional — bukan tombol yang dipasang sendiri dari artikel blog.

## SIEM: pencarian peristiwa dan tiket insiden

Di Sinexis, SIEM berarti dua hal, tidak lebih.

**Pencarian peristiwa** — menelusuri log organisasi yang sudah masuk. Ini bukan konsol kedua dan bukan pengganti Guard.

**Cases** — tiket insiden yang tersimpan di database aplikasi Sinexis. Dibuka, ditangani, lalu ditutup, dengan catatan siapa mengerjakan apa. Ini tiket di dalam aplikasi Sinexis, bukan plugin di sistem pemantauan lain, dan bukan daftar alert Guard yang dipindahkan.

Yang tidak kami klaim: ini bukan "platform keamanan AI", dan bukan pusat operasi keamanan yang berjaga 24 jam. Tidak ada tim Sinexis yang membaca kasus Anda tiap jam.

Di banyak akun, modul ini masih dimatikan sampai ada orang di pihak Anda yang benar-benar siap membaca dan menutup kasus. Fitur tiket yang tidak pernah dibuka lebih buruk daripada tidak ada, karena memberi rasa aman yang salah.

## Host Protect: memeriksa berkas di disk

Supaya tidak tertukar lagi dengan dua modul di atas.

Host Protect membaca berkas di disk mesin Anda, lewat program pembantu kecil yang jalan di mesin itu sendiri. Fokusnya berkas web yang mencurigakan.

Kalau program pembantunya belum terpasang atau tidak terjangkau, statusnya jujur: "menunggu" atau "tidak terjangkau". Kami tidak mengarang temuan supaya laporan terlihat ramai — tidak ada temuan berkas WordPress palsu di server yang isinya aplikasi akuntansi.

Pemasangannya lewat satu skrip installer resmi, bukan menyalin repositori kode. Dan ini bukan agen enroll kedua di samping Guard.

## Urutan yang masuk akal

1. **Scan domain dan/atau IP**, lalu hidupkan jadwalnya. Ini fondasinya.
2. **Kredit dan aset** disiapkan sesuai paket, supaya jadwal benar-benar jalan.
3. **Uptime** kalau Anda peduli situs mati atau tidak. Ini termasuk paket Scan.
4. **Guard** di server yang sama, setelah Scan berjalan rutin. Satu agen per mesin.
5. **Host Protect** kalau Anda butuh kejelasan soal berkas di dalam server. Per mesin.
6. **SIEM** paling akhir, dan hanya kalau ada orang yang siap membaca Cases.

Kalau yang Anda punya hanya website di hosting, berhenti di langkah pertama sudah masuk akal: scan domain plus jadwal. Guard dan SIEM boleh dibaca-baca dulu, jangan dibeli sebelum kebiasaan membaca laporan bulanan terbentuk.

## Langkah berikutnya

Mulai dari Scan dan jadwal Attach di **sinexis.app**. Jalankan beberapa bulan.

Kalau setelah itu Anda merasa butuh alarm dari dalam server, baru bicarakan Guard. SIEM belakangan, kalau modulnya aktif dan ada orang yang benar-benar membacanya.
