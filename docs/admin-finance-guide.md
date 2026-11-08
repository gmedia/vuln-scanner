# Panduan operator — layar keuangan admin

Referensi cepat untuk tim ops yang memakai layar keuangan/platform admin. Setiap halaman juga
punya panel **Cara menggunakan halaman ini** di dalam UI; dokumen ini adalah peta dan daftar
aturan, bukan salinan penuh copy tersebut.

---

## 1. Siapa yang boleh

- Semua rute `/admin/*` hanya untuk **platform admin** — pengguna dengan `users.is_admin = true`.
  Peran owner atau admin workspace **tidak cukup** untuk membuka layar ini.
- `/credit-history` bisa dibuka oleh **semua pengguna yang login** dan hanya menampilkan kredit
  scan pribadi milik akun tersebut.

---

## 2. Peta sidebar

| Rute | Label EN | Label ID | Untuk apa |
|------|----------|----------|-----------|
| `/admin/hpp` | HPP | HPP | Tarif COGS per unit, overhead bulanan, jurnal biaya, laporan margin. |
| `/admin/skus` | SKUs, Tiers & Pricing | SKU, Tier & Harga | Katalog harga jual SKU (tab Harga) dan katalog tier/fitur (tab Tier & Fitur). |
| `/admin/simulator` | HPP Simulator | Simulasi HPP | Simulasi what-if margin; tidak menyimpan apa pun. |
| `/admin/invoices` | Invoices | Invoice | Draf invoice manual, kirim, tandai lunas, void, cetak/PDF. |
| `/admin/promo-codes` | Promo codes | Kode promo | Buat/ubah diskon, persetujuan nilai besar, pemakaian, riwayat. |
| `/admin/subscription-requests` | Plan requests | Permintaan paket | Antrean upgrade/downgrade dari owner workspace. |
| `/admin/subscriptions` | Subscriptions | Langganan | Siklus billing per workspace, catat pembayaran, batalkan paket. |
| `/admin/ai` | AI Gateway | AI Gateway | Provider, model, kurs, wallet organisasi, pemakaian, trial chat. |
| `/admin/users/:id` | User details | Detail pengguna | Profil pengguna dan penyesuaian kredit scan pribadi. |
| `/credit-history` | Credit history | Riwayat kredit | Riwayat kredit scan pribadi milik pengguna yang login. |

---

## 3. Aksi yang tidak bisa dibatalkan

| Aksi | Halaman | Konfirmasi | Bisa dibatalkan? |
|------|---------|------------|------------------|
| Invoice **Void** | `/admin/invoices` | Ya | Tidak — final. |
| Invoice **Mark paid** | `/admin/invoices` | Tidak | Tidak; invoice `paid` tidak bisa di-`Void`. |
| Invoice **Mark sent** | `/admin/invoices` | Tidak | Tidak; tidak bisa kembali ke draf, dan tidak mengirim email. |
| Promo **Delete** | `/admin/promo-codes` | Ya | Tidak — permanen dan diblokir setelah ada baris redemption. |
| Promo **Deactivate** | `/admin/promo-codes` | Tidak | Ya — bisa diaktifkan kembali. |
| Promo **Approve** | `/admin/promo-codes` | Tidak | Tidak ada undo; kode menjadi aktif. |
| Simpan harga SKU | `/admin/skus` | Ya | Tidak; invoice yang sudah terbit tetap memakai nominal tersimpan. |
| Tier **Delete permanently** | `/admin/skus` | Ya | Tidak — permanen. |
| Tier **Deactivate** | `/admin/skus` | Tidak | Ya — organisasi grandfathered tetap berjalan. |
| Baris biaya HPP **Delete** | `/admin/hpp` | Ya | Tidak — permanen. |
| Simpan tarif/overhead HPP | `/admin/hpp` | Tidak | Tidak ada undo, tetapi setiap perubahan diaudit. |
| Langganan **Record payment** | `/admin/subscriptions` | Submit dialog | Tidak ada undo dari halaman ini. |
| **Cancel subscription** | `/admin/subscriptions` | Dialog | `End immediately` final; tidak ada tombol resume. |
| Plan request **Approve** | `/admin/subscription-requests` | Tidak | Tidak — tier langsung pindah. |
| Plan request **Reject** | `/admin/subscription-requests` | Dialog | Tidak. |
| AI **Top up** | `/admin/ai` | Tidak | Tidak — langsung, tanpa penyesuaian negatif. |
| AI hapus provider/model/fallback | `/admin/ai` | Ya | Tidak — permanen. |
| Kredit pengguna | `/admin/users/:id` | Konfirmasi inline dua langkah | Hanya dengan penyesuaian berlawanan. |

---

## 4. Aturan yang mudah salah

- Pembayaran admin hanya **transfer bank manual**; tidak ada gateway di layar invoice.
- **Mark sent tidak mengirim email.** Oper tidak boleh mengandalkan notifikasi otomatis.
- Pembayaran produk **host** tidak mengubah SKU Scan organisasi.
- Invoice **tahunan** tidak boleh memakai promo, dan siklus tahunan adalah **bayar 10 bulan untuk 12 bulan**.
- Promo bernilai besar (di atas 50% atau di atas Rp 5.000.000) butuh **admin platform berbeda** untuk `Approve`.
- Ketentuan diskon promo **terkunci setelah redemption pertama**.
- `Delete` promo diblokir oleh **adanya** baris redemption, termasuk yang sudah `released`; UI bisa
  terlihat aktif tetapi server menolak — gunakan `Deactivate`.
- `Void` invoice mengembalikan kuota promo, tetapi **baris redemption tetap ada**.
- Satu kode promo hanya berlaku untuk **satu baris invoice** (invoice dibuat per produk/SKU).
- Promo **100% otomatis melunasi** invoice saat dibuat dan mengaktifkan langganan scan.
- Daftar invoice hanya menampilkan **20 invoice terbaru**.
- Periode **tumpang tindih** untuk organisasi dan produk yang sama ditolak.
- Permintaan paket yang sudah dipakai **tidak kembali ke antrean** saat invoice di-`Void`.
- Kolom **`Bank ref` bukan filter**; nilainya dipakai oleh aksi `Mark paid` berikutnya.
- Perubahan harga SKU **tidak mengubah harga invoice** yang sudah terbit.
- **Kursi tier bersifat read-only** di layar katalog; batasnya diatur di tier.
- Penghapusan tier di UI bisa **kurang menghitung** promo/default; server tetap penentu akhir.
- Tarif HPP adalah **COGS, bukan harga jual**.
- Jumlah **uptime/guard** pada laporan HPP memakai inventori **live**, bukan rentang tanggal.
- Laporan HPP adalah **estimasi biaya/margin, bukan laba invoice**.
- **Simulator tidak menyimpan apa pun** — refresh menghapus isian.
- `Record payment` membutuhkan invoice **`sent`**, dan hanya invoice produk **scan** yang mengaktifkan langganan.
- `Approve` permintaan paket hanya mencatat keputusan + membuat invoice draft dan langganan `incomplete`; tier baru berlaku setelah invoice **scan** dibayar.
- Top-up AI hanya menerima **UUID organisasi yang ditempel** (tidak ada pencarian).
- Kurs FX di layar AI **hanya untuk tampilan harga**; COGS penagihan tetap memakai `AI_USD_IDR`.
- Harga model AI diisi dalam **USD per 1 juta token**.
- `/credit-history` adalah **kredit scan pribadi** — bukan wallet AI dan bukan tagihan workspace.
- Penyesuaian kredit **negatif tidak boleh melebihi saldo**.

---

## 5. Panduan per halaman

Buka halaman, lalu buka panel **Cara menggunakan halaman ini** untuk langkah dan batasan versi UI.

- `/admin/hpp` — HPP: tarif COGS, overhead, jurnal, dan laporan margin.
- `/admin/skus` — halaman SKU punya panel harga jual; tab **Tier & Fitur** punya panel sendiri untuk membuat/memensiunkan tier.
- `/admin/simulator` — panel simulasi menjelaskan asumsi, rumus, dan batasannya.
- `/admin/invoices` — panel invoice memandu draf → `Mark sent` → `Mark paid`, promo, dan permintaan tertunda.
- `/admin/promo-codes` — panel promo mencakup tipe, batas, persetujuan nilai besar, dan aturan redemption.
- `/admin/subscriptions` — panel langganan mencakup arti status dan alur `Record payment`.
- `/admin/subscription-requests` — panel permintaan paket membedakan `Approve` dan `Reject`.
- `/admin/ai` — panel AI Gateway mencakup provider, model, kurs, wallet, dan penggunaan.
- `/admin/users/:id` — panel penyesuaian kredit menjelaskan arah `+`/`−` dan batas saldo.
- `/credit-history` — panel riwayat kredit menjelaskan cakupan kredit scan pribadi dan batas filter.
