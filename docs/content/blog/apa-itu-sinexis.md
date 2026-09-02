# Apa itu Sinexis?

Server Anda sudah jalan. Website sudah online. Sinexis tidak mengganti itu.

Kami menambahkan **pemeriksaan berkala dari internet** terhadap permukaan yang sudah ada, lalu memberi tahu kalau ada yang berubah. Bukan hosting baru. Bukan migrasi. Bukan "kami ambil alih server Anda."

Bayangkan ruko yang sudah disewa. Kami bukan tukang renovasi. Kami lewat depan setiap bulan, lihat pintu, jendela, kunci, papan nama. Kalau bulan depan ada jendela terbuka atau kunci lemah, kami kabari. Itu saja.

## Bedanya dengan SIEM atau EDR

Dua pekerjaan ini sering dicampur jadi satu oleh vendor lain. Sinexis memisahkan.

**Scan dari luar** (yang Sinexis lakukan) = pemeriksaan permukaan dari internet. Port, TLS, header, DNS. Semacam foto berkala dari trotoar. Bukan "kami masuk server Anda."

**SIEM / EDR 24 jam** = agen di dalam host yang menelan log terus-menerus. Itu pekerjaan berbeda, dan Sinexis tidak menjualnya seolah-olah sama.

Guard di Sinexis adalah lapisan tipis: daftar mesin plus alert yang benar-benar kritis. Bukan dasbor Wazuh penuh. Bukan "platform SIEM." Satu `wazuh-agent` per VM, bukan dua agen.

## Siapa yang pakai

Tim yang domain atau IP-nya sudah di hosting atau VPS. Satu-dua server menghadap internet. Hotel atau kantor yang butuh laporan singkat tiap bulan, bukan tumpukan istilah keamanan. Account manager yang sudah tagih colo/VPS dan butuh baris security yang jujur di invoice.

Sinexis **attach** di infra yang sudah dibayar, bukan ganti rak.

## Yang ada di akun

**Scan domain** = cek website dari internet: DNS, sertifikat HTTPS, header keamanan, sidik teknologi. Satu kali klik.

**Scan IP** = cek server dari internet: port terbuka, layanan yang menjawab, CVE yang cocok. Satu kali klik.

**Jadwal (Scan Attach)** = scan yang berulang otomatis. Tiap minggu atau bulan, hasilnya dibanding yang kemarin. Yang diutamakan: temuan parah **baru**, bukan dump ribuan baris.

**Kredit** = dompet untuk tiap pemeriksaan. Seperti pulsa. Isi, pakai, lihat sisa. Tanpa kredit, bulan ini tidak ada pemeriksaan.

**Aset** = nama untuk target Anda. "Website booking", "VPS produksi", "IP colo rak A." Supaya tidak ketik ulang setiap kali.

**Workspace** = tempat undang rekan satu tim. Owner, admin, member, viewer. Kredit tetap pribadi per orang.

**Uptime** = cek "situs masih nyala dari luar?" secara berkala, hitungan menit. Bukan scan keamanan, tapi berguna untuk tahu kalau web down.

**Host Protect** = cek malware di disk VM Anda, lewat helper yang jalan di mesin itu sendiri. Tanpa helper, hasilnya menunggu, bukan temuan palsu. Pekerjaan sekelas Imunify on-box, stack sendiri.

**SIEM** = cari peristiwa organisasi plus Cases (tiket insiden: buka, akui, tutup) di Postgres. Bukan plugin Wazuh. Di banyak lingkungan masih dimatikan.

## Yang tidak kami janjikan

Firewall, antivirus, backup tetap urusan Anda. Tidak ada "aman 100%." Tidak ada tim yang duduk baca semua log. Tidak ada dua agen yang harus dipasang berpasangan.

Scan otomatis tidak mengganti pentest manusia atau uji logika bisnis (checkout, hak akses). Itu di luar cakupan baseline DAST dari luar.

Host WAF (deteksi plus proteksi per-site) ada sebagai add-on, tapi kami tidak menempel WAF ke nginx publik Sinexis. Itu untuk server Anda, bukan edge kami.

## Langkah berikutnya

Kalau colo atau VPS sudah jalan, mulai dari satu domain atau IP yang benar-benar dipakai pelanggan. Scan sekali, lihat hasilnya. Kalau masuk akal, hidupkan jadwal. Itu cerita paling jujur tentang Sinexis: pemeriksaan permukaan yang kelihatan dari internet, dilakukan berulang, bukan sekali lalu lupa.
