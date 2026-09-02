# Uptime: apakah website atau port masih nyala?

Scan keamanan bertanya: pintu dan gembok masih wajar? Uptime bertanya hal lain: **dari internet, situs atau port itu masih merespons?**

Dua pertanyaan beda, dua jawaban beda. Satu tidak menggantikan yang lain.

AM sering kena pertanyaan "kenapa web down?" Uptime adalah cek dari luar, berkala, hitungan menit, bukan sebulan sekali. Tidak perlu pasang agen di server.

## Analoginya

Scan = inspeksi kunci dan jendela, lihat apakah ada yang lemah. Uptime = lampu toko masih nyala pas lewat jalan. Kalau mati, Anda tahu dalam beberapa menit, bukan sebulan kemudian.

Keduanya bukan SIEM. Keduanya bukan Host Protect (itu cek file di disk).

## Yang dicek

**HTTP(S)** = halaman publik jawab atau tidak. Bukan analisis konten, bukan cek keamanan. Cuma: hidup atau mati.

**TCP** = port tertentu di VPS masih terima koneksi. Misalnya port 443 untuk web, port 22 untuk SSH.

**DNS** = opsional, cek apakah nama domain masih mengarah ke IP yang benar.

**Heartbeat** = opsional, cek apakah server mengirim sinyal hidup secara berkala.

Status turun lalu naik bisa kirim notifikasi. Ini bukan analisis celah keamanan, bukan CVE, bukan scan vulnerability.

## Paket dan flag

Di spek, kursi uptime termasuk add-on Scan, bukan baris harga terpisah. Kalau menu uptime tidak muncul di akun, tanya yang urus lingkungan.

Uptime bisa diaktifkan atau dimatikan per target. Tidak harus semua aset dipantau.

## Yang dicek vs yang tidak

| Dicek oleh Uptime | Bukan dari sini |
|---|---|
| Situs hidup atau mati dari internet | Kenapa situs mati (itu log server) |
| Port terbuka atau tertutup | Kerentanan di port itu (itu Scan IP) |
| Waktu respons dari luar | Performa di dalam server |
| Notifikasi saat turun | Perbaikan otomatis |

## Bukan uptime

Tidak ganti hosting otomatis. Kalau situs mati, Anda yang harus bertindak.

Bukan SLA legal 99,99%. Itu kontrak infra dengan provider hosting atau colo. Uptime hanya mengonfirmasi dari luar.

Bukan pengganti Scan Attach. Bukan Guard. Bukan agen kedua. Bukan "aman dari malware."

## Langkah berikutnya

Pakai URL atau port yang sama dengan yang Anda scan. Monitor yang benar-benar dipakai pelanggan, bukan puluhan URL percobaan di akun kecil. Satu URL produksi yang dipantau lebih berguna daripada sepuluh yang asal masuk.
