# Aset bernama dan workspace: supaya scan tidak salah sasaran

Dua kata yang sering ditukar. Pisahkan dulu.

**Aset** adalah barang yang diperiksa. Nama manusiawi untuk target: "website booking", "VPS produksi", "IP colo lantai 2". Bukan agen. Bukan izin jaringan.

**Workspace** adalah orang-orangnya. Satu perusahaan, satu hotel, satu kantor. Di versi sekarang kira-kira satu organisasi, bukan banyak proyek bersarang.

Tanpa aset, orang mengetik IP atau domain berulang-ulang. Salah ketik ke alamat milik orang lain bukan soal kerapian lagi. Dengan aset, didaftarkan sekali, jadwal menempel di nama itu, riwayat terkumpul di satu tempat.

## Nama, bukan dekorasi

Label dan tag di daftar aset hanya untuk mengelompokkan tampilan. Bisa dipilih beberapa sekaligus. Tag tidak memasang apa pun di server, tidak menambah agen, tidak membuka port.

Pakai nama yang orang lain pahami saat Anda cuti. "Situs utama" atau "VPS billing" lebih berguna daripada kode yang hanya Anda hafal.

## Atap jumlah aset ikut paket

Batasnya keras sesuai tingkat yang diambil. Tidak ada janji belasan domain di paket satu aset.

- **Dasar:** satu aset. Satu domain atau satu IP.
- **Menengah:** beberapa aset.
- **Multi-aset:** belasan nama, untuk yang pegang banyak VPS atau domain.

Angka pastinya tampil di akun. Blog tidak mengutip kuota seolah harga.

## Empat peran di workspace

Dari yang paling luas:

- **Owner.** Mengundang orang, mengatur langganan.
- **Admin.** Mengundang, mengelola aset dan jadwal.
- **Member.** Kerja harian: menjalankan scan, membaca hasil.
- **Viewer.** Lihat saja. Tidak mengubah pengaturan.

Viewer sering diremehkan. Manajer, pemilik, atau compliance biasanya cukup membaca laporan bulanan tanpa risiko menyentuh tombol.

Aturan praktis: owner dan admin mengundang, member mengerjakan, viewer memantau.

## Kredit tidak ikut undangan

Mengundang rekan **tidak** menyatukan saldo. Kredit menempel di akun login masing-masing.

Kalau satu orang harus menanggung semua pemeriksaan, tunjuk satu pemegang kredit. Biarkan dia yang menjalankan atau menjadwalkan. Kas bersama organisasi belum ada.

Itu juga alasan PDF bolak-balik bisa dikurangi: hasilnya dibaca di workspace, dengan peran yang jelas, tanpa meneruskan berkas ke grup yang salah.

## Tiga susunan yang wajar

**Satu properti.** Satu workspace, satu aset (domain booking), satu orang IT. GM sebagai viewer kalau ingin laporan.

**Beberapa properti.** Satu workspace, beberapa aset. IT pusat sebagai member, GM tiap lokasi sebagai viewer.

**Kantor banyak VPS.** Satu workspace, belasan aset bernama, paket multi-aset. Tag memisahkan produksi dan internal.

Hospitality di sini contoh susunan tim, bukan klaim bahwa semua pelanggan adalah hotel.

## Yang tidak berubah karena aset

Mendaftarkan nama tidak memasang program di mesin. Guard tetap satu `wazuh-agent` per VM, bukan per aset atau per tag. Helper Host Protect juga per mesin, bukan per label.

Aset adalah cara Sinexis menyebut target. Titik.

## Buat satu nama dulu

Buka **sinexis.app**. Buat satu aset untuk target yang paling penting, yang benar-benar dipakai.

Undang satu rekan hanya jika ada yang perlu membaca. Tambah nama berikutnya setelah manfaatnya terasa, bukan karena kuota paket masih sisa.
