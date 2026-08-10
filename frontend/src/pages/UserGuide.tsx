import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Radar,
  Globe,
  Smartphone,
  CalendarClock,
  Shield,
  Users,
  Coins,
  LayoutDashboard,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/Card";
import { BRAND } from "@/lib/brand";

const toc = [
  { id: "mulai", label: "Mulai cepat" },
  { id: "scan", label: "Scan (IP / Domain / Mobile)" },
  { id: "jadwal", label: "Jadwal (Scan Attach)" },
  { id: "workspace", label: "Workspace & peran" },
  { id: "kredit", label: "Kredit" },
  { id: "guard", label: "Guard (runtime thin)" },
  { id: "tips", label: "Tips & batasan" },
] as const;

function SectionHeading({
  id,
  icon: Icon,
  title,
}: {
  id: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h2
      id={id}
      className="mb-3 flex scroll-mt-20 items-center gap-2 text-lg font-semibold text-foreground"
    >
      <Icon className="h-5 w-5 shrink-0 text-primary" />
      {title}
    </h2>
  );
}

function UserGuide() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2 text-primary">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-medium uppercase tracking-wider">
            Panduan
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          User Guide
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cara memakai {BRAND.product} (mesin VulnScanner) untuk scan, jadwal
          berkala, workspace tim, dan Guard thin. Tanpa host, IP, atau kredensial
          di halaman ini.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar isi</CardTitle>
          <CardDescription>Lompat ke bagian yang relevan</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 sm:grid-cols-2">
            {toc.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading id="mulai" icon={LayoutDashboard} title="Mulai cepat" />
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              Masuk akun terverifikasi. Pilih{" "}
              <strong className="text-foreground">workspace (org)</strong> aktif
              di switcher jika Anda punya lebih dari satu.
            </li>
            <li>
              Buka{" "}
              <Link to="/dashboard" className="text-primary hover:underline">
                Dashboard
              </Link>{" "}
              untuk ringkasan dan pintasan.
            </li>
            <li>
              Jalankan scan sekali (IP / domain / mobile) atau buat{" "}
              <Link to="/schedules" className="text-primary hover:underline">
                Jadwal
              </Link>{" "}
              untuk cek berkala.
            </li>
            <li>
              Unduh laporan dari detail scan (JSON / HTML teknis / laporan
              eksekutif bila tersedia).
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="scan"
            icon={Radar}
            title="Scan (IP / Domain / Mobile)"
          />
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <Radar className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <Link to="/scan/ip" className="font-medium text-primary hover:underline">
                  IP Scanner
                </Link>
                {" — "}
                port / service fingerprint dan temuan terkait target IP. Cocok
                untuk VPS atau host yang Anda miliki wewenang menguji.
              </span>
            </li>
            <li className="flex gap-2">
              <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <Link
                  to="/scan/domain"
                  className="font-medium text-primary hover:underline"
                >
                  Domain Scanner
                </Link>
                {" — "}
                DNS, TLS, header keamanan, dan sinyal paparan domain. Sering
                jadi target attach berulang.
              </span>
            </li>
            <li className="flex gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <Link
                  to="/scan/mobile"
                  className="font-medium text-primary hover:underline"
                >
                  Mobile Scanner
                </Link>
                {" — "}
                unggah APK/AAB/IPA untuk analisis permission dan konfigurasi.
                Memakai kredit terpisah (à la carte).
              </span>
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Progress real-time lewat status job; buka detail scan untuk temuan
            per severity. Hanya scan target yang Anda berwenang uji.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="jadwal"
            icon={CalendarClock}
            title="Jadwal (Scan Attach)"
          />
          <p className="text-sm text-muted-foreground">
            Menu{" "}
            <Link to="/schedules" className="text-primary hover:underline">
              Jadwal
            </Link>{" "}
            membuat scan berulang (mis. domain/IP) di workspace aktif. Hasil
            bisa dibandingkan ke baseline dan diekspor (termasuk laporan
            eksekutif bila fitur aktif).
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Jadwal memakai <strong className="text-foreground">kredit</strong>{" "}
              saat dijalankan; kredit habis → jadwal bisa nonaktif otomatis.
            </li>
            <li>
              Ada <strong className="text-foreground">batas jumlah jadwal
              aktif per org</strong> (cap produk; default orde 10). Nonaktifkan
              yang tidak dipakai sebelum menambah baru.
            </li>
            <li>
              Dari Dashboard, pintasan &quot;Jadwal scan&quot; / &quot;Atur
              jadwal&quot; mengarah ke halaman yang sama.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading id="workspace" icon={Users} title="Workspace & peran" />
          <p className="text-sm text-muted-foreground">
            Di{" "}
            <Link
              to="/settings/workspace"
              className="text-primary hover:underline"
            >
              Workspace
            </Link>
            , kelola org, undangan, dan anggota. Scan dan jadwal terikat{" "}
            <strong className="text-foreground">org aktif</strong> di JWT /
            switcher.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Viewer</strong> — melihat scan
              / inventory sesuai org.
            </li>
            <li>
              <strong className="text-foreground">Admin / owner org</strong> —
              undangan, pengaturan, aksi Guard enable & enroll (bila Guard
              aktif).
            </li>
            <li>
              <strong className="text-foreground">Platform admin</strong>{" "}
              (is_admin) — panel /admin global; bukan pengganti peran org.
            </li>
            <li>
              Kredit v1 tetap <strong className="text-foreground">personal</strong>{" "}
              (bukan dompet org).
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading id="kredit" icon={Coins} title="Kredit" />
          <p className="text-sm text-muted-foreground">
            Setiap jenis scan punya biaya kredit (diatur admin pricing). Saldo
            di sidebar; riwayat di{" "}
            <Link to="/credit-history" className="text-primary hover:underline">
              Credit History
            </Link>
            . Top-up biasanya lewat proses invoice / admin — bukan self-serve
            kartu di app v1.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading id="guard" icon={Shield} title="Guard (runtime thin)" />
          <p className="text-sm text-muted-foreground">
            <Link to="/guard" className="text-primary hover:underline">
              Guard
            </Link>{" "}
            menampilkan inventori agent dan alert kritis per org — lapisan thin
            di atas bus sensor (bukan SIEM penuh, tanpa raw log Discover).
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Admin+ org</strong> mengaktifkan
              Guard dan membuat token enroll (rahasia; hash disimpan di server).
            </li>
            <li>
              Token enroll dipakai memasang agent di host yang Anda kelola;
              ikuti snippet/instruksi di UI. Jangan bagikan token di chat publik.
            </li>
            <li>
              Viewer+ melihat agent & alert yang tersinkron untuk org tersebut.
            </li>
            <li>
              Mode lab/CI bisa memakai data mock; live manager hanya di
              environment deploy — detail host tidak ditampilkan di panduan ini.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading id="tips" icon={BookOpen} title="Tips & batasan" />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Hanya scan dan pasang agent pada aset yang Anda kuasai.</li>
            <li>
              Jangan menaruh password, API key, atau alamat internal di ticket /
              repo publik.
            </li>
            <li>
              Guard v1 = inventori + alert kritis + enroll — bukan SOAR, raw log,
              atau dashboard manager untuk pelanggan.
            </li>
            <li>
              Brand: {BRAND.name} / {BRAND.product}; mesin scan = VulnScanner.
            </li>
            <li>
              Butuh bantuan fulfillment atau top-up kredit — hubungi AM / ops
              penyedia Anda (bukan lewat form di halaman ini).
            </li>
          </ul>
          <p className="pt-2 text-xs text-muted-foreground">
            {BRAND.footerLine}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default UserGuide;
