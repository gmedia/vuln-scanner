# Aset dan workspace: nama target plus satu tim

Dua kata yang sering tertukar. Mari kita pisahkan.

**Aset** = barang yang dicek. "Website booking", "VPS produksi", "IP colo rak A." Nama manusia untuk target supaya tidak ketik ulang setiap kali scan.

**Workspace** = perusahaan atau hotel tempat orang diundang. Satu organisasi kira-kira satu perusahaan di versi ini, bukan banyak proyek bersarang.

Label dan tag di daftar aset hanya untuk mengelompokkan dan filter di dasbor. Bisa pilih beberapa tag sekaligus. Bukan agen. Bukan SIEM. Bukan izin jaringan.

## Kenapa aset penting

Tanpa nama, orang ketik IP atau domain berulang-ulang dan kadang salah sasaran. Dengan aset: nama sekali, pakai berkali-kali, jadwal menempel di situ.

Batas aset sesuai paket:

- **Basic** = 1 aset. Satu domain atau satu IP.
- **Pro** = sampai 3 aset. Beberapa target.
- **Multi-asset** = sampai 10 aset. Banyak VPS atau domain.

Itu batas keras sesuai yang dijual. Jangan janji 50 domain di Basic.

Pakai nama yang masuk akal. "Situs utama" lebih baik daripada string acak. Jangan tempel data pelanggan orang lain ke contoh publik.

## Workspace: siapa bisa apa

Peran di workspace:

- **Owner** = yang punya. Undang orang, atur billing.
- **Admin** = undang orang, kelola aset dan jadwal.
- **Member** = kerja scan sehari-hari. Lihat hasil, jalankan scan.
- **Viewer** = lihat saja. Tidak mengubah apa pun. Berguna untuk GM hotel atau tim compliance.

Owner dan admin yang undang orang. Member kerja. Viewer memantau.

## Kredit di workspace

Kredit tetap pribadi per orang. Undang rekan ke workspace **tidak** menggabungkan pulsa jadi kas perusahaan. Dompet organisasi mungkin belakangan.

Satu orang plus satu VPS: Basic dan satu aset biasanya cukup. Beberapa properti atau banyak SID: workspace plus aset plus Multi.

## Contoh pakai

**Hotel satu properti:** satu workspace, satu aset (domain booking), satu orang IT yang pegang.

**Hotel grup:** satu workspace, beberapa aset (satu per properti atau satu per layanan). Undang GM sebagai viewer, IT sebagai member.

**Kantor dengan banyak VPS:** satu workspace, belasan aset bernama. Multi-asset paket.

Guard, kalau diambil, tetap satu `wazuh-agent` per mesin di workspace itu, bukan daemon kedua per aset. Host Protect helper juga per VM, bukan per tag.

## Langkah berikutnya

Buat aset pertama untuk target yang paling penting. Undang satu rekan kalau perlu. Mulai dari yang kecil, tambah kalau sudah terasa manfaatnya.
