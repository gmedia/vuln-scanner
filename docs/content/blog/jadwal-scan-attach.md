# Scan Attach: jadwal, perubahan, dan laporan untuk atasan

Scan sekali itu cek kesehatan sekali. Hasilnya bagus di hari itu, tapi bulan depan sudah basi.

Scan Attach itu janji berulang: domain dan/atau IP dicek tiap minggu atau bulan, otomatis. Pertanyaannya sederhana: **apa yang baru dan lebih berbahaya dibanding kemarin?**

Itu alasan add-on ini ditagih berulang di colo/VPS yang sudah Anda bayar. Bukan hobi scan. Bukan SIEM 24 jam. Tidak perlu agen di server untuk jadwal ini, pemeriksaan tetap dari internet.

## Cara kerjanya

Anda pilih ritme: bulanan atau mingguan, sesuai paket. Ada batas jumlah jadwal per organisasi, itu batas produk, bukan "unlimited kalau minta."

Alurnya:

1. **Tunjuk target** = domain atau IP yang mau diawasi. Lebih aman lewat aset bernama supaya tidak salah sasaran.
2. **Pastikan kredit ada** = jadwal makan kredit yang sama dengan scan biasa. Kredit habis, jadwal berhenti sendiri.
3. **Hidupkan jadwal** = siklus pertama jalan otomatis.
4. **Baca selisih** = bulan berikutnya, yang Anda lihat bukan PDF acak, tapi perubahan dibanding yang kemarin.

## Yang terasa di operasional

Hasil sebelumnya jadi acuan. Yang diutamakan: temuan parah **baru**, bukan dump ribuan baris yang bikin pusing.

Email kalau muncul yang serius (kelengkapan tergantung paket). Ada laporan HTML ringkas, Bahasa Indonesia, yang masuk akal diteruskan ke pemilik atau GM hotel.

Kredit habis? Jadwal mati sendiri. Isi ulang atau naik paket, lalu hidupkan lagi. Tidak ada kejutan tagihan tambahan.

## Yang dicek vs yang tidak

| Dari jadwal Attach | Bukan dari sini |
|---|---|
| Perubahan temuan dibanding periode sebelumnya | Log 24 jam di dalam server |
| Temuan parah baru yang perlu perhatian | Patch otomatis atau perbaikan |
| Laporan HTML untuk diteruskan | Dashboard SIEM atau Wazuh penuh |
| Notifikasi email untuk temuan serius | Alert real-time setiap menit |

## Bukan ini

Bukan SIEM. Bukan "aman 100%." Bukan Guard (satu `wazuh-agent` di dalam server), itu upsell lain. Bukan agen enroll kedua. Bukan unlimited scan. Bukan pengganti pentest tahunan.

Untuk pembeli colo/VPS, modul ini yang paling dekat dengan "kenapa saya bayar tiap bulan." Scan sekali di dasbor tetap ada. Attach yang bikin jadi kebiasaan.

## Langkah berikutnya

Pilih satu domain atau IP yang benar-benar menghadap pelanggan. Scan sekali dulu, lihat hasilnya. Kalau masuk akal, hidupkan jadwal. Bulan depan Anda baca selisih, bukan PDF acak.
