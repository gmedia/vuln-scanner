# Sinexis menempel di rak yang sudah Anda bayar

Colo, VPS, atau hosting sudah ada di tagihan. Situs sudah bisa diketik orang. Yang sering absen: orang yang secara rutin melihat permukaan itu dari internet, lalu mencatat kalau ada yang berubah.

Sinexis mengisi absen itu. Bukan pindah rak. Bukan ganti penyedia. Bukan "serahkan kunci server ke kami".

Bayangkan toko yang sudah buka di ruko sewaan. Kami tidak merenovasi. Kami tidak tidur di dalam. Kami lewat di depan, mencatat pintu, gembok, dan papan nama, lalu membandingkannya dengan catatan bulan lalu. Kalau ada jendela yang tertinggal terbuka, Anda yang dikabari.

Batas itu sengaja. Banyak penawaran keamanan menjual rasa "sudah diurus semua". Kami tidak.

## Menempel, bukan menggantikan

Pemeriksaan dari luar tidak butuh program di server. Firewall, antivirus di mesin, dan backup tetap pekerjaan Anda atau penyedia Anda.

Yang ditambah: kebiasaan. Ada jadwal. Ada temuan. Ada orang di tim yang bisa membaca hasil yang sama tanpa saling kirim berkas.

Itu alasan kata *attach* dipakai. Lapisan keamanan di atas infra yang sudah dibayar, bukan platform baru yang harus merobohkan yang lama.

## Dua arah yang sering dicampur

**Dari luar.** Ini kerja harian Scan: port, DNS, sertifikat HTTPS, header keamanan, layanan yang menjawab. Foto dari trotoar. Berguna, dan terbatas.

**Dari dalam.** Ini kerja lain. Butuh program di mesin, dan orang yang benar-benar membaca hasilnya. Guard dan Host Protect ada di akun yang sama, tapi kami tidak menjualnya seolah-olah sama dengan scan dari internet, dan tidak menjanjikan ada yang berjaga tiap jam.

Kalau Anda hanya punya website di hosting, scan domain plus jadwal sudah cukup untuk memulai. Jangan beli alarm di dalam sebelum kebiasaan membaca laporan bulanan terbentuk.

## Isi akun, tanpa brosur

**Scan domain** melihat website dari internet: DNS, HTTPS, header, teknologi yang terbaca publik, subdomain yang tercatat di catatan publik.

**Scan IP** melihat server dari internet: pintu yang terbuka, siapa yang menjawab, kerentanan publik yang cocok dengan versi layanan itu.

**Scan mobile** memeriksa berkas Android atau iOS yang Anda unggah sendiri. Pelengkap. Bukan menu utama pemilik VPS.

**Scan Attach** mengulang pemeriksaan tiap minggu atau tiap bulan, lalu menonjolkan temuan serius yang *baru*. Satu kali scan adalah ingatan. Jadwal baru namanya kontrol.

**Kredit** adalah saldo tiap pemeriksaan. Terlihat sebelum tombol ditekan. Habis berarti berhenti, bukan tagihan diam-diam.

**Aset** adalah nama manusiawi untuk target: situs booking, VPS produksi, server kantor. Supaya tiket tidak berisi alamat mentah.

**Workspace** mengundang rekan. Empat peran: owner, admin, member, viewer. Kredit tetap menempel di login masing-masing, bukan kas bersama.

**Uptime** mengetuk tiap beberapa menit: masih menjawab atau sudah diam. Bukan CVE. Bukan SLA.

**Guard** tipis: inventaris mesin plus alert kritis. Satu `wazuh-agent` per mesin. Bukan dasbor SIEM yang harus ditunggui.

**SIEM** adalah pencarian peristiwa plus Cases, tiket insiden di aplikasi Sinexis. Di banyak akun masih dimatikan sampai ada orang yang siap menutup tiket.

**Host Protect** membaca disk lewat program pembantu di mesin Anda. Belum terpasang berarti statusnya menunggu, bukan temuan yang dikarang.

**Host WAF** opsional, di nginx pelanggan. Tidak pernah ditempel di pintu depan sinexis.app.

## Siapa yang biasanya cocok

Tim yang domain atau servernya sudah hidup, dengan satu sampai beberapa alamat yang menghadap pelanggan.

Kantor atau properti yang tiap bulan ditanya "keamanan kita bagaimana" dan butuh satu halaman, bukan tumpukan istilah.

Penyedia yang sudah menagih colo atau VPS dan ingin menambah satu baris yang bisa dibuktikan, bukan janji lisan.

## Yang tidak kami janjikan

Tidak ada "aman seratus persen". Manfaat yang wajar: lubang menganga lebih sulit lolos berbulan-bulan tanpa ada yang tahu.

Scan otomatis bukan pentest. Alur checkout, hak akses antar pengguna, rantai penyalahgunaan, itu kerja manusia. Pakai Sinexis di antara dua engagement, bukan sebagai gantinya.

Host Protect hanya melaporkan apa yang helper benar-benar lihat. Disk bersih atau helper belum ada: layarnya jujur, bukan ramai palsu.

## Mulai dari mana

Pilih satu domain atau satu IP yang benar-benar dipakai. Bukan alamat percobaan.

Buka **sinexis.app**, daftar, jalankan satu pemeriksaan, baca hasilnya. Kalau isinya terasa bisa diteruskan ke orang non-teknis, hidupkan jadwalnya.
