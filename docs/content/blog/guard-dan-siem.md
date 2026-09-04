# Guard tipis, SIEM belakangan. Keduanya bukan Scan.

Dua nama yang paling gampang tertukar. Keduanya juga bukan tempat memulai.

Scan adalah foto berkala dari luar: apa yang kelihatan orang lewat. Guard dan SIEM bekerja dari arah dalam: apa yang terjadi di mesin. Banyak brosur mencampur keduanya seolah satu barang. Kami memisahkannya, termasuk soal apa yang *tidak* dijual.

Kalau Scan belum jadi kebiasaan, berhenti dulu di artikel ini. Baca. Jangan pasang agen.

## Guard: alarm di dalam, dibuat tipis

Guard sekarang dua hal: **daftar mesin yang terdaftar**, plus **alert untuk peristiwa yang benar-benar kritis**.

Bukan semua log ditelan. Bukan dasbor berburu peristiwa yang diserahkan ke pelanggan. Bukan otomasi yang menutup insiden sendiri.

Satu agen per mesin. Satu `wazuh-agent`. Bukan dua. Tidak ada daemon pendamping yang berebut sumber daya di kotak yang sama. Host Protect adalah skrip helper di mesin itu juga, bukan agen enroll kedua.

Yang dilakukan:

- Menampilkan inventaris mesin yang sudah terdaftar.
- Mengirim alert kritis, misalnya layanan penting mati atau perubahan yang mencurigakan.
- Meneruskan kabar itu ke tim Anda.

Yang tidak:

- Menyimpan dan menampilkan seluruh log sepanjang hari.
- Mengganti konsol pemantauan penuh.
- Menjalankan respons insiden otomatis.
- Membaca berkas di disk. Itu Host Protect.

Scan melihat toko dari etalase. Guard adalah alarm di dalam yang berbunyi untuk hal serius. Dua sudut. Dua tagihan mental. Jangan harap yang satu mengerjakan yang lain.

Syarat wajar: Scan berkala sudah jalan. Pemasangan dan pelepasan agen dikerjakan bersama tim operasional, bukan dari tombol di artikel blog.

## SIEM: cari peristiwa, tulis tiket. Bukan jaga 24 jam.

Di Sinexis, SIEM dua hal. Tidak lebih.

**Pencarian peristiwa.** Menelusuri log organisasi yang sudah masuk. Bukan konsol kedua. Bukan pengganti Guard.

**Cases.** Tiket insiden di database aplikasi Sinexis. Dibuka, ditangani, ditutup, dengan jejak siapa mengerjakan apa. Tiket di Sinexis, bukan plugin di sistem pemantauan lain, bukan daftar alert Guard yang dipindahkan.

Yang tidak kami klaim: bukan pusat operasi yang berjaga sepanjang hari. Tidak ada orang Sinexis yang membaca kasus Anda tiap jam. Bukan "platform AI".

Di banyak akun modul ini mati sampai ada orang di pihak Anda yang siap menutup tiket. Fitur yang tidak pernah dibuka lebih buruk daripada tidak ada. Memberi rasa aman yang salah.

Flag operasional bisa menyalakan atau mematikan. Default di banyak lingkungan: mati. Jangan kira beli Scan lalu SIEM ikut hidup.

## Host Protect, supaya tidak masuk antrean yang sama

Membaca berkas di disk, lewat helper kecil yang jalan di mesin Anda. Fokusnya berkas web yang mencurigakan.

Helper belum terpasang atau tidak terjangkau: statusnya menunggu atau tidak terjangkau. Kami tidak mengarang temuan supaya layar ramai. Tidak ada malware bertema CMS di server yang isinya aplikasi lain.

Pemasangan lewat skrip installer resmi, bukan menyalin repositori. Bukan agen kedua di samping Guard.

Host WAF, kalau dipakai, hidup di nginx pelanggan. Tidak pernah ditempel di edge sinexis.app.

## Urutan yang tidak merugikan Anda

1. **Scan domain dan/atau IP**, lalu jadwal Attach. Fondasi.
2. **Kredit dan aset** sesuai paket, supaya jadwal benar-benar jalan.
3. **Uptime** kalau Anda peduli mati atau tidak. Termasuk paket Scan.
4. **Guard** di server yang sama, setelah Scan rutin. Satu agen per mesin.
5. **Host Protect** kalau perlu kejelasan soal berkas di dalam. Per mesin.
6. **SIEM** paling akhir. Hanya jika ada orang yang membaca Cases.

Website di hosting? Berhenti di langkah pertama sudah masuk akal. Guard dan SIEM boleh dibaca. Jangan dibeli sebelum laporan bulanan benar-benar dibuka.

## Langkah berikutnya

Mulai Scan dan jadwal Attach di **sinexis.app**. Jalankan beberapa siklus.

Kalau setelah itu permukaan dari luar sudah terasa terurus, dan Anda masih butuh alarm dari dalam, baru bicarakan Guard. SIEM belakangan. Dan hanya jika modulnya aktif plus ada nama orang yang menutup tiket.
