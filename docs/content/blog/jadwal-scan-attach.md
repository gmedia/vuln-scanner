# Attach: janji cek ulang, bukan foto sekali

Scan sekali benar untuk hari itu. Minggu depan, sertifikat bisa hampir habis, port bisa terbuka, DNS bisa nyasar. Foto lama tidak menolong.

Scan Attach adalah janji berulang. Domain dan/atau IP diperiksa lagi tiap minggu atau tiap bulan, otomatis. Pertanyaan utamanya bukan "ada berapa temuan", melainkan **apa yang baru dan lebih berbahaya dibanding acuan sebelumnya**.

Kata attach dipakai karena modul ini menempel di colo, VPS, atau hosting yang sudah Anda bayar. Bukan pindahan mesin. Bukan SIEM. Untuk jadwal ini tidak ada agen. Pemeriksaan tetap dari internet.

## Urutan yang biasa

Anda pilih ritme: bulanan atau mingguan, sesuai paket. Jumlah jadwal per organisasi ada atapnya. Atap itu bagian dari produk, bukan angka yang dinegosiasi di artikel blog.

1. **Tunjuk target.** Satu domain atau satu IP. Lebih aman lewat aset bernama, supaya orang lain tidak salah ketik.
2. **Cek kredit.** Jadwal memotong saldo yang sama dengan scan manual. Kredit habis, jadwal berhenti.
3. **Hidupkan.** Siklus pertama jadi acuan.
4. **Baca selisih.** Periode berikutnya yang ditonjolkan adalah perubahan, terutama temuan parah yang baru muncul.

## Yang berubah di rapat bulanan

Tanpa jadwal, pembicaraan keamanan sering berhenti di "sepertinya aman". Dengan acuan, bahannya konkret: bulan ini ada perubahan, satu sudah ditutup, satu masih terbuka.

Notifikasi email untuk temuan serius, kelengkapannya tergantung paket. Ada laporan HTML ringkas dalam Bahasa Indonesia yang masuk akal diteruskan ke pemilik usaha, manajer, atau GM, tanpa harus diterjemahkan dulu oleh orang teknis.

Itu pekerjaan kontrol. Bukan pemantauan log sepanjang malam.

## Kalau kredit habis

Jadwal diam. Tidak ada pemeriksaan yang dipaksa. Tidak ada tagihan yang muncul di belakang.

Isi ulang atau naikkan paket, hidupkan lagi. Riwayat lama tidak dihapus, jadi perbandingan bisa disambung.

## Dari Attach, dan yang bukan

| Dari jadwal | Bukan dari sini |
|---|---|
| Selisih temuan vs periode lalu | Baca log di dalam server |
| Temuan parah baru | Patch otomatis |
| Laporan HTML ringkas | Dasbor SIEM |
| Email untuk yang serius | Alert tiap menit |

## Batas sejak halaman ini

Attach bukan Guard. Guard butuh satu `wazuh-agent` per mesin dan berdiri sebagai modul sendiri. Menghidupkan jadwal tidak memasang agen.

SIEM, Cases, dan tim yang berjaga juga bukan pekerjaan ini. Ritme mengikuti kalender, dari luar.

Pengujian oleh manusia tetap terpisah. Alur bisnis yang rumit butuh orang yang menelusuri. Attach hanya menjaga lapisan dasar tidak dibiarkan setahun tanpa dilihat.

Tidak ada janji aman 100 persen. Yang dijanjikan: kalau permukaan jadi lebih berisiko, Anda tahu dalam hitungan minggu, bukan setelah insiden.

## Buat siapa ini paling terasa

Tim kecil tanpa orang keamanan penuh waktu, dengan satu sampai beberapa alamat yang menghadap pelanggan.

Penyedia colo atau VPS yang ingin satu baris keamanan yang bisa dibuktikan, bukan janji di chat.

Kantor atau properti yang tiap periode ditanya status, dan butuh satu halaman daripada slide kosong.

## Sesudah satu scan manual

Jalankan dulu satu pemeriksaan di **sinexis.app** pada target yang benar-benar live. Baca hasilnya.

Kalau isinya pantas jadi bahan rutin, hidupkan jadwal. Periode berikutnya pekerjaan Anda membaca perubahan, bukan mengulang dari nol.
