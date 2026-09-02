# Scan Attach: jadwal, perubahan, dan laporan untuk atasan

Scan sekali itu cek kesehatan sekali. Scan Attach itu janji berulang: domain dan/atau IP dicek tiap minggu atau bulan. Pertanyaannya sederhana — **apa yang baru dan lebih berbahaya dibanding kemarin?**

Itu alasan add-on ditagih berulang di colo/VPS yang sudah Anda bayar. Bukan hobi scan. Bukan SIEM 24 jam. Tidak perlu agen di server untuk jadwal ini — pemeriksaan tetap dari internet, seperti OpenVAS/nmap berkala, bukan Wazuh yang duduk di host.

## Yang terasa di operasional

Anda pilih ritme (bulanan atau mingguan, sesuai paket). Ada batas jumlah jadwal per organisasi — itu batas produk, bukan “unlimited kalau minta.”

Hasil sebelumnya jadi acuan. Yang kami utamakan: temuan parah **baru**, bukan dump ribuan baris. Email kalau muncul yang serius (kelengkapan banding tergantung paket). Ada laporan HTML ringkas, Bahasa Indonesia, yang masuk akal diteruskan ke pemilik atau GM.

Alurnya: tunjuk domain atau IP (lebih aman lewat aset bernama), pastikan kredit ada, hidupkan jadwal, siklus pertama jalan. Bulan berikutnya Anda baca **selisih**, bukan PDF acak.

Kredit habis, jadwal berhenti sendiri. Isi ulang atau naik paket, lalu hidupkan lagi.

## Bukan ini

Bukan SIEM. Bukan “aman 100%.” Bukan Guard (satu `wazuh-agent` di dalam server) — itu upsell lain. Bukan agen enroll kedua. Bukan unlimited scan. Bukan pengganti pentest tahunan.

Untuk pembeli colo/VPS, modul ini yang paling dekat dengan “kenapa saya bayar tiap bulan.” Scan sekali di dasbor tetap ada; attach yang bikin jadi kebiasaan.
