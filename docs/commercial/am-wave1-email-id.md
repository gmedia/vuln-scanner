# Template email wave-1 — Sinexis Scan / Secure Scan Add-on (Bahasa)

**Status:** product-owned copy for **AM** (P0 lock B4: hybrid — product template, **AM sends**).
**Bukan** legal offer. Harga = working list P0; finance boleh ± sesuaikan.
**Jangan** tempel SID, domain pelanggan, atau data finance ke commit publik — isi placeholder di **CRM / draft email privat**.

**Sumber harga & tier:** [`sku-scan-secure-addon.md`](sku-scan-secure-addon.md) · one-pager: [`sinexis-one-pager.md`](sinexis-one-pager.md).

---

## Cara pakai (AM)

1. Pilih SID dari **10 wave-1** di CRM (pola VPS+domain, colo IP, multi-service, dsb.).
2. Ganti semua `{…}` di draft privat.
3. Kirim dari identitas AM / GMD yang biasa dipakai pelanggan (bukan mailbox produk anonim).
4. Catat di CRM: tanggal kirim, tier ditawarkan, next follow-up.
5. Jika setuju: serahkan ke ops fulfillment (kredit + schedule) — checklist di SKU §3.

**Jangan janjikan:** SIEM, “aman 100%”, Guard/Wazuh, unlimited scan, multi-user workspace (belum P2).

---

## Subject lines (pilih satu)

1. `Pemeriksaan berkala permukaan publik untuk {layanan_infra} Anda`
2. `Add-on keamanan untuk {VPS|colo|cloud} yang sudah Anda langgani`
3. `{Nama_AM}: usulan Sinexis Scan (cek bulanan IP/domain)`

---

## Body A — cold / soft upsell (disarankan wave-1)

```text
Yth. Bapak/Ibu {Nama_PIC},

Perkenalkan, saya {Nama_AM} dari {GMD/AppMedia}.

Anda sudah berlangganan {ringkas_layanan: mis. VPS / colo / cloud} bersama kami. Yang sering terlewat: permukaan publik (alamat IP atau domain yang menghadap internet) jarang dicek ulang setiap bulan—padahal port, sertifikat, dan temuan risiko bisa berubah.

Kami menawarkan add-on berulang **Sinexis Scan** (di tagihan bisa tertulis Secure Scan Add-on):

• Jadwal pemeriksaan eksternal domain dan/atau IP (bulanan atau mingguan, sesuai paket)
• Pemberitahuan jika muncul temuan critical/high baru dibanding pemeriksaan sebelumnya
• Ringkasan perubahan + laporan HTML yang bisa diteruskan ke manajemen (Bahasa Indonesia)
• Bukan pengganti firewall atau SIEM; bukan jaminan “kebal peretasan”—ini pemeriksaan postur publik yang teratur

Paket (harga list kerja, per bulan, belum PPN jika berlaku):

• Basic — 1 target (1 domain atau 1 IP), bulanan — Rp 300.000
• Pro — hingga 3 target, mingguan atau bulanan, diff lebih lengkap — Rp 650.000
• Multi-asset — hingga 10 target — Rp 2.000.000

Untuk akun seperti milik Anda, saran awal kami: paket **{Basic|Pro}**.

Jika berkenan, balas email ini atau hubungi saya di {kontak_AM}. Cukup sebutkan domain atau IP publik yang ingin dimasukkan (maks. sesuai paket). Tim kami siapkan jadwal + laporan siklus pertama.

Terima kasih,
{Nama_AM}
{Jabatan}
{Telepon / WA bisnis}
```

---

## Body B — follow-up singkat (7–10 hari, belum balas)

```text
Yth. Bapak/Ibu {Nama_PIC},

Menyambung email saya tanggal {tanggal_email_1} tentang add-on pemeriksaan berkala IP/domain (Sinexis Scan).

Apakah ada 15 menit minggu ini untuk konfirmasi 1 target (Basic) atau hingga 3 (Pro)? Tidak ada kewajiban—hanya kejelasan apakah ini relevan untuk {layanan_infra} Anda.

Salam,
{Nama_AM}
{kontak}
```

---

## Body C — undangan pilot #1 (design-partner, 1 bulan sponsored)

**Hanya** untuk kandidat pilot yang sudah disepakati internal (bukan blast 10 SID). List price tetap dicatat di CRM.

```text
Yth. Bapak/Ibu {Nama_PIC},

Kami mencari 1–2 mitra desain untuk add-on **Sinexis Scan** pada langganan infra yang sudah berjalan.

Untuk siklus perkenalan (±1 bulan) kami dapat men-sponsor paket {Basic|Pro} (1–3 target): jadwal otomatis, notifikasi critical/high baru, laporan HTML Bahasa, dan tinjauan manusia opsional untuk temuan critical.

Yang kami minta: 1 kontak teknis, target publik yang jelas, dan feedback singkat di akhir siklus (lanjut berbayar / sesuaikan paket).

Jika setuju, balas dengan: (1) domain/IP kandidat, (2) email untuk notifikasi, (3) preferensi bulanan vs mingguan.

Salam,
{Nama_AM} / {Product}
```

---

## WhatsApp / chat singkat (opsional)

```text
Pak/Bu {Nama}, {Nama_AM} GMD. Ikut tawar add-on cek berkala IP/domain di atas VPS/colo yg sdh jalan—jadwal + laporan beda temuan, mulai ~300rb/bln (1 target). Boleh kirim ringkas email?
```

---

## Objection cheatsheet (AM)

| Keberatan | Respons singkat |
|-----------|-----------------|
| “Kami sudah punya firewall” | Firewall ≠ cek berkala apa yang terlihat dari luar + ringkasan untuk management. |
| “Nanti saja / sibuk” | Basic = 1 target/bulan; setup ringan; kami yang jadwalkan. |
| “Mahal” | Bandingkan ke biaya VPS/colo bulanan; Basic 300rb = satu pemeriksaan teratur + laporan. |
| “Buktikan dulu” | Tawarkan pilot internal jika akun cocok design-partner; atau 1 siklus berbayar Basic. |
| “Butuh banyak user login” | v1 = 1 login teknis; laporan HTML bisa di-forward. Multi-user = roadmap jika dibutuhkan. |

---

## Setelah “ya” — serah terima ke ops (tanpa PII di git)

- [ ] Tier + jumlah target + cadence (weekly/monthly)
- [ ] Email notifikasi
- [ ] Kredit bundle sesuai tier (10 / 24 / 60) atau grant pilot
- [ ] Schedule dibuat; cap 10 enabled/user
- [ ] CRM: service line / service_id, renew owner = AM
- [ ] Siklus 1: kirim/tunjukkan executive HTML + cerita diff

Ops detail: [`../scan-schedules-ops.md`](../scan-schedules-ops.md).
