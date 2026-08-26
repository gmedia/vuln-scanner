# Uptime: apakah website atau port masih nyala?

Scan keamanan menjawab: “pintu dan gembok masih wajar?” **Uptime** menjawab pertanyaan lain: **“dari internet, situs atau port itu masih merespons?”**

AM sering ditanya “kenapa web down?” Uptime adalah cek **dari luar**, berkala (orde menit, bukan sebulan sekali).

## Analogi

Scan = inspeksi kunci dan jendela. Uptime = apakah lampu toko masih menyala saat lewat jalan.

Keduanya berguna. Yang satu tidak menggantikan yang lain.

## Apa yang dicek

- **HTTP(S)** — halaman publik menjawab atau tidak
- **TCP** — port tertentu (misalnya layanan di VPS) masih menerima koneksi

Saat status **turun** lalu **naik**, sistem bisa mengirim email. Ini bukan analisis CVE.

## Paket

Di spek produk, kursi uptime **termasuk** di add-on Scan — bukan baris harga terpisah di list kerja. Fitur bisa dilindungi flag (`UPTIME_ENABLED`); jika mati di lingkungan Anda, tanya ops.

## Yang bukan uptime

- Mengganti hosting otomatis
- SLA legal 99,99% (itu kontrak infra, bukan modul ini)
- Mengganti Scan Attach

Pakai uptime pada **URL atau port yang sama** dengan yang Anda scan. Jangan monitor puluhan URL percobaan di akun kecil.
