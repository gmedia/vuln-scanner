# Guard bukan SIEM. SIEM bukan Guard

Dua nama ini paling gampang dijual sebagai satu barang. Di Sinexis keduanya sadar dibedakan, dan keduanya **bukan** tempat memulai.

Scan adalah foto berkala dari luar. Guard dan SIEM bekerja dari arah dalam. Mencampur keduanya seolah "paket keamanan lengkap" membuat ekspektasi yang tidak kami penuhi.

## Guard: tipis, di dalam mesin

Guard hari ini: **inventaris mesin yang terdaftar, plus alert untuk peristiwa yang benar-benar kritis**.

Bukan "semua log ditelan", bukan dasbor Wazuh yang diserahkan ke pelanggan, dan bukan tombol isolasi ajaib. Otomasi tanggap insiden juga tidak termasuk.

Satu agen per VM: satu `wazuh-agent`. Tidak ada program pendaftaran kedua di sampingnya, dan tidak ada agen scan terpisah yang harus dipasang "supaya Guard hidup".

Yang dilakukan:

- Menampilkan mesin yang sudah terdaftar.
- Meneruskan alert kritis ke tim Anda.
- Berhenti di situ.

Yang tidak dilakukan:

- Menyimpan dan menayangkan seluruh log harian di UI pelanggan.
- Mengganti konsol pemantauan penuh yang mungkin sudah Anda punya.
- Menjalankan respons insiden otomatis.
- Membaca berkas di disk. Itu Host Protect.

Syarat wajar: Scan berkala sudah jadi kebiasaan. Guard lapisan kedua. Pasang dan lepas agen dikerjakan bersama ops, bukan dari tutorial blog yang seolah satu klik.

## SIEM: cari peristiwa, tutup tiket

Di produk ini SIEM dua hal, tidak lebih.

**Pencarian peristiwa.** Menelusuri log organisasi yang sudah masuk. Ini bukan konsol kedua, dan bukan pengganti Guard.

**Cases.** Tiket insiden di database aplikasi Sinexis. Dibuka, ditangani, ditutup, dengan jejak siapa mengerjakan apa. Ini tiket aplikasi, bukan plugin Wazuh, bukan daftar alert Guard yang dipindah folder.

Yang tidak kami klaim: bukan platform keamanan AI, bukan pusat operasi 24 jam, bukan orang Sinexis yang membaca kasus Anda tiap malam.

Banyak akun mematikan modul ini sampai ada manusia di pihak Anda yang benar-benar menutup tiket. Fitur yang tidak pernah dibuka lebih berbahaya daripada tidak ada, karena terasa seperti sudah berjaga.

Flag terpisah dari Guard. Menghidupkan Guard tidak menyalakan SIEM.

## Host Protect, supaya tidak masuk keranjang yang sama

Host Protect membaca berkas di disk mesin pelanggan, lewat helper kecil yang **jalan di VM itu**. Fokusnya berkas web yang mencurigakan. Kerjanya di mesin Anda, tumpukan sendiri, bukan klon panel hosting.

Kalau helper belum terpasang atau tidak terjangkau: status menunggu atau tidak terjangkau. Kami tidak mengarang temuan. Tidak ada `wp-content` palsu di server yang isinya aplikasi akuntansi.

Pemasangan lewat installer resmi, bukan salin repositori. Bukan agen pendaftaran kedua di samping Guard.

## Urutan yang waras

1. **Scan domain dan/atau IP**, lalu jadwal Attach. Fondasi.
2. **Kredit dan aset** sesuai paket, supaya jadwal benar-benar jalan.
3. **Uptime** kalau Anda peduli nyala atau mati. Termasuk paket Scan.
4. **Guard** di mesin yang sama, setelah laporan Scan dibaca rutin. Satu agen per VM.
5. **Host Protect** kalau perlu kejelasan berkas di disk. Per mesin, helper dulu.
6. **SIEM** paling akhir, hanya jika ada orang yang siap membaca Cases.

Website di hosting bersama, tanpa akses mesin, sering cukup berhenti di langkah 1. Baca Guard dan SIEM. Jangan beli sebelum kebiasaan laporan bulanan ada.

## Sesudah Scan jalan

Mulai di **sinexis.app** dari Scan dan jadwal. Pakai beberapa siklus.

Kalau kemudian Anda butuh alarm dari dalam, bicarakan Guard. SIEM belakangan, dan hanya jika modulnya aktif plus ada nama orang yang benar-benar menutup tiket.
