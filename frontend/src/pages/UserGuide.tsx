import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
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
  LogIn,
  ListOrdered,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
} from "@/components/ui/Card";
import { BRAND } from "@/lib/brand";
import {
  buildEnrollCurlExample,
  GUARD_AGENT_INSTALL_INTRO,
  GUARD_AGENT_INSTALL_STEPS,
  GUARD_DISTRO_INSTALL_FOOTER,
  GUARD_DISTRO_INSTALL_GUIDES,
  GUARD_HOST_SETUP_STEPS,
} from "@/lib/guardEnrollHost";

const toc = [
  { id: "mulai", label: "1. Mulai & login" },
  { id: "scan-ip", label: "2. Scan IP (step-by-step)" },
  { id: "scan-domain", label: "3. Scan Domain" },
  { id: "scan-mobile", label: "4. Scan Mobile" },
  { id: "hasil", label: "5. Baca hasil & unduh" },
  { id: "jadwal", label: "6. Jadwal berkala" },
  { id: "workspace", label: "7. Workspace & undangan" },
  { id: "kredit", label: "8. Kredit" },
  { id: "guard", label: "9. Guard (runtime)" },
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

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="list-decimal space-y-2.5 pl-5 text-sm text-muted-foreground">
      {children}
    </ol>
  );
}

function Ui({ children }: { children: ReactNode }) {
  return (
    <strong className="font-medium text-foreground">{children}</strong>
  );
}

function useActiveGuideSection() {
  const [activeId, setActiveId] = useState<string>(toc[0].id);

  useEffect(() => {
    const nodes = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (nodes.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
        const first = visible[0]?.target.id;
        if (first) {
          setActiveId(first);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return activeId;
}

function GuideTocLinks({
  activeId,
  onNavigate,
}: {
  activeId: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Daftar isi panduan">
      <ul className="space-y-0.5">
        {toc.map((item) => {
          const isActive = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={onNavigate}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function UserGuide() {
  const activeId = useActiveGuideSection();
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const activeLabel =
    toc.find((item) => item.id === activeId)?.label ?? toc[0].label;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 max-w-3xl">
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
          Panduan step-by-step memakai {BRAND.product} (mesin VulnScanner). Label
          tombol mengikuti UI. Tidak ada host, IP produksi, atau kredensial di
          halaman ini — ganti contoh target dengan aset yang Anda berwenang uji.
        </p>
      </div>

      <div className="lg:hidden">
        <details
          className="group mb-6 rounded-lg border border-border bg-card"
          open={mobileTocOpen}
          onToggle={(event) =>
            setMobileTocOpen((event.target as HTMLDetailsElement).open)
          }
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <ListOrdered className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">
                Daftar isi
                <span className="ml-2 font-normal text-muted-foreground">
                  · {activeLabel}
                </span>
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-border px-2 py-2">
            <GuideTocLinks
              activeId={activeId}
              onNavigate={() => setMobileTocOpen(false)}
            />
          </div>
        </details>
      </div>

      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-0 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <ListOrdered className="h-3.5 w-3.5 text-primary" />
              Daftar isi
            </p>
            <GuideTocLinks activeId={activeId} />
          </div>
        </aside>

        <div className="min-w-0 space-y-6">

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="mulai"
            icon={LogIn}
            title="1. Mulai: daftar, login, workspace"
          />
          <Steps>
            <li>
              Buka halaman login aplikasi. Belum punya akun? daftar lewat{" "}
              <Ui>Register</Ui> (email + password).
            </li>
            <li>
              Verifikasi email jika diminta (tautan di inbox / alur{" "}
              <Ui>Verify email</Ui>). Akun belum terverifikasi biasanya tidak
              bisa scan.
            </li>
            <li>
              Login. Pastikan sidebar menampilkan saldo kredit dan menu navigasi
              (Dashboard, scanner, Jadwal, Guard, dll.).
            </li>
            <li>
              Jika Anda punya lebih dari satu organisasi, pilih workspace aktif
              di switcher org (atas / area sidebar). Semua scan dan jadwal
              terikat <Ui>org aktif</Ui>.
            </li>
            <li>
              Buka{" "}
              <Link to="/dashboard" className="text-primary hover:underline">
                Dashboard
              </Link>{" "}
              untuk ringkasan riwayat dan pintasan.
            </li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="scan-ip"
            icon={Radar}
            title="2. Scan IP — step by step"
          />
          <Steps>
            <li>
              Sidebar →{" "}
              <Link to="/scan/ip" className="text-primary hover:underline">
                IP Scanner
              </Link>
              . Judul halaman: <Ui>IP scanner</Ui>.
            </li>
            <li>
              Cek pratinjau kredit di form (biaya scan IP). Saldo kurang → top-up
              dulu (lihat bagian Kredit).
            </li>
            <li>
              Isi <Ui>Target IP address</Ui> (IPv4 yang Anda kuasai). Opsional:
              sesuaikan <Ui>Port range</Ui> (default <code>1-1000</code>, atau
              mis. <code>22,80,443</code>).
            </li>
            <li>
              Klik <Ui>Start IP scan</Ui>. Tunggu status{" "}
              <Ui>Initializing scan…</Ui> lalu Anda dialihkan ke{" "}
              <Ui>Scan details</Ui> (<code>/scan/&lt;id&gt;</code>).
            </li>
            <li>
              Pantau badge status (<Ui>pending</Ui> / <Ui>running</Ui> →{" "}
              <Ui>completed</Ui> atau <Ui>failed</Ui>). Progress juga bisa
              terlihat di kartu <Ui>Scan progress</Ui> jika masih di halaman
              scanner.
            </li>
            <li>
              Setelah <Ui>completed</Ui>, lanjut ke bagian{" "}
              <a href="#hasil" className="text-primary hover:underline">
                Baca hasil & unduh
              </a>
              .
            </li>
          </Steps>
          <p className="text-xs text-muted-foreground">
            Cakupan tipikal: port/service (nmap), CVE OSV, severity, OS
            fingerprint bila tersedia.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="scan-domain"
            icon={Globe}
            title="3. Scan Domain — step by step"
          />
          <Steps>
            <li>
              Sidebar →{" "}
              <Link to="/scan/domain" className="text-primary hover:underline">
                Domain Scanner
              </Link>
              .
            </li>
            <li>
              Isi <Ui>Target domain</Ui> (mis. hostname yang Anda miliki). Opsional:
              tombol <Ui>Try example.com</Ui> hanya untuk coba alur UI — jangan
              mengandalkan hasil lab publik sebagai audit produksi.
            </li>
            <li>
              Cek biaya kredit, lalu klik <Ui>Start domain scan</Ui>.
            </li>
            <li>
              Ikuti redirect ke detail scan; tunggu <Ui>completed</Ui>.
            </li>
          </Steps>
          <p className="text-xs text-muted-foreground">
            Cakupan tipikal: DNS/subdomain, TLS, security headers, tech
            fingerprint.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="scan-mobile"
            icon={Smartphone}
            title="4. Scan Mobile — step by step"
          />
          <Steps>
            <li>
              Sidebar →{" "}
              <Link to="/scan/mobile" className="text-primary hover:underline">
                Mobile Scanner
              </Link>
              . Kartu <Ui>Upload binary</Ui>.
            </li>
            <li>
              Pilih platform (Android / iOS). Android: file <code>.apk</code> /{" "}
              <code>.aab</code>. iOS: <code>.ipa</code>. Maks. ukuran file sesuai
              UI (orde ratusan MB).
            </li>
            <li>
              Drag-and-drop atau pilih file. Pastikan ekstensi cocok platform.
            </li>
            <li>
              Cek kredit (tipe <code>apk</code> / <code>ipa</code> terpisah), lalu
              mulai upload/scan lewat tombol start di form.
            </li>
            <li>
              Setelah job dibuat, buka <Ui>Scan details</Ui> dan tunggu selesai.
            </li>
          </Steps>
          <p className="text-xs text-muted-foreground">
            Cakupan tipikal: manifest/permission, exported component, secret
            hardcoded, cek biner platform.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="hasil"
            icon={LayoutDashboard}
            title="5. Baca hasil & unduh laporan"
          />
          <Steps>
            <li>
              Di <Ui>Scan details</Ui>, baca ringkasan severity, tabel{" "}
              <Ui>Findings</Ui>, dan kartu <Ui>Scan info</Ui> (waktu, target,
              tipe).
            </li>
            <li>
              Bila scan berasal dari jadwal berulang, perhatikan strip diff
              baseline (temuan baru / resolved) jika tersedia.
            </li>
            <li>
              Unduh laporan dari tombol kanan atas:
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <Ui>JSON</Ui> — data mentah
                </li>
                <li>
                  <Ui>HTML teknis</Ui> — laporan lengkap teknis
                </li>
                <li>
                  <Ui>Laporan eksekutif</Ui> — ringkasan untuk manajemen
                </li>
              </ul>
            </li>
            <li>
              Butuh scan ulang target sejenis: klik <Ui>Re-scan</Ui> (kembali ke
              form scanner yang sesuai).
            </li>
            <li>
              Riwayat juga ada di Dashboard; buka baris scan untuk detail yang
              sama.
            </li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="jadwal"
            icon={CalendarClock}
            title="6. Jadwal scan berkala (Scan Attach)"
          />
          <p className="text-sm text-muted-foreground">
            Peran <Ui>viewer</Ui> hanya membaca — tidak bisa buat/ubah jadwal.
            Admin/member/owner org: lanjut.
          </p>
          <Steps>
            <li>
              Sidebar →{" "}
              <Link to="/schedules" className="text-primary hover:underline">
                Jadwal
              </Link>
              . Judul: <Ui>Jadwal scan</Ui>.
            </li>
            <li>
              Lihat <Ui>Kuota jadwal aktif</Ui> (mis. N/10). Penuh → nonaktifkan
              jadwal lama dulu.
            </li>
            <li>
              Di kartu <Ui>Jadwal baru</Ui>:
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <Ui>Label</Ui> (opsional)
                </li>
                <li>
                  <Ui>Tipe</Ui>: Domain atau IP
                </li>
                <li>
                  <Ui>Target</Ui> (wajib)
                </li>
                <li>
                  <Ui>Frekuensi</Ui>: Mingguan / Bulanan
                </li>
                <li>
                  <Ui>Email notifikasi</Ui> (opsional; default email akun)
                </li>
              </ul>
            </li>
            <li>
              Klik <Ui>Buat jadwal</Ui>. Jadwal muncul di <Ui>Jadwal Anda</Ui>.
            </li>
            <li>
              Kelola per baris: <Ui>Aktifkan</Ui> / <Ui>Nonaktifkan</Ui>, unduh{" "}
              <Ui>Eksekutif</Ui> dari scan terakhir, buka{" "}
              <Ui>scan terakhir</Ui> / <Ui>buka scan</Ui> di riwayat runs,
              hapus jika perlu.
            </li>
            <li>
              Setiap run memotong kredit personal. Kredit habis → jadwal bisa
              nonaktif dengan error terkait credits.
            </li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="workspace"
            icon={Users}
            title="7. Workspace & undangan — step by step"
          />
          <Steps>
            <li>
              Buka{" "}
              <Link
                to="/settings/workspace"
                className="text-primary hover:underline"
              >
                Workspace
              </Link>{" "}
              (atau Settings workspace di navigasi).
            </li>
            <li>
              <Ui>Buat organisasi</Ui>: isi <Ui>Nama</Ui>, opsional{" "}
              <Ui>Slug</Ui>, klik <Ui>Buat workspace</Ui>. Anda jadi owner.
            </li>
            <li>
              Ganti org aktif lewat switcher agar scan/jadwal masuk workspace
              yang benar.
            </li>
            <li>
              Owner/admin: undang anggota — email + peran (member / viewer /
              admin sesuai opsi UI), kirim undangan. Status di daftar undangan;
              bisa dicabut.
            </li>
            <li>
              Penerima: buka tautan undangan (URL berisi token) → kartu{" "}
              <Ui>Terima undangan</Ui> → klik <Ui>Terima undangan</Ui> saat sudah
              login.
            </li>
            <li>
              Lihat daftar <Ui>Anggota</Ui> dan peran. Platform admin (
              <code>is_admin</code>) beda dari admin org — panel{" "}
              <code>/admin</code> global.
            </li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading id="kredit" icon={Coins} title="8. Kredit — step by step" />
          <Steps>
            <li>
              Lihat saldo di sidebar (atau area kredit akun).
            </li>
            <li>
              Sebelum scan, form menampilkan pratinjau biaya. Tombol start
              disabled jika tidak eligible.
            </li>
            <li>
              Setelah scan, cek{" "}
              <Link
                to="/credit-history"
                className="text-primary hover:underline"
              >
                Credit History
              </Link>{" "}
              untuk pemotongan / refund (gagal scan sering refund otomatis).
            </li>
            <li>
              Top-up v1: lewat invoice / admin penyedia — bukan form kartu di
              app. Hubungi AM/ops jika saldo habis.
            </li>
            <li>
              Ingat: kredit <Ui>personal</Ui> (bukan dompet bersama org).
            </li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading
            id="guard"
            icon={Shield}
            title="9. Guard (runtime thin) — step by step"
          />
          <p className="text-sm text-muted-foreground">
            Inventori agen + alert kritis per org. Bukan SIEM penuh / raw log.
            Hanya admin/owner org yang mengaktifkan & membuat token. Setup host
            di bawah bersifat generik (placeholder) — tanpa alamat lab/prod di
            dokumen publik.
          </p>
          <Steps>
            <li>
              Sidebar →{" "}
              <Link to="/guard" className="text-primary hover:underline">
                Guard
              </Link>
              .
            </li>
            <li>
              Kartu <Ui>Status</Ui>: pastikan org aktif benar. Jika{" "}
              <Ui>disabled</Ui>, admin klik <Ui>Aktifkan Guard</Ui>.
            </li>
            <li>
              Setelah enabled, admin: kartu <Ui>Enroll token</Ui> → label
              opsional → <Ui>Generate</Ui>. Salin token mentah segera (hanya
              sekali ditampilkan). UI menampilkan blok{" "}
              <Ui>Langkah host (setelah token)</Ui> + contoh curl — gunakan itu
              di host. Jangan tempel token di chat/repo publik.
            </li>
            <li>
              Di host target (aset yang Anda kuasai secara hukum), ikuti urutan:
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                {GUARD_HOST_SETUP_STEPS.map((step) => (
                  <li key={step.slice(0, 40)}>{step}</li>
                ))}
              </ol>
            </li>
            <li>
              Contoh enroll dari host (ganti origin app & token; tanpa JWT):
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {buildEnrollCurlExample(
                  "https://<APP_ORIGIN>",
                  "<ENROLL_TOKEN>",
                  "<AGENT_NAME>",
                )}
              </pre>
              Endpoint publik org-bound lewat token:{" "}
              <code className="text-foreground">POST /api/guard/enroll</code>{" "}
              body{" "}
              <code className="text-foreground">
                {"{"} token, agent_name {"}"}
              </code>
              . Response:{" "}
              <code className="text-foreground">agent_id</code>,{" "}
              <code className="text-foreground">agent_key</code>,{" "}
              <code className="text-foreground">manager_host</code>,{" "}
              <code className="text-foreground">install_hint</code>.
            </li>
            <li>
              Instalasi runtime agen di host target (per distro, tanpa secret
              lab):
              <p className="mt-2 text-sm text-muted-foreground">
                {GUARD_AGENT_INSTALL_INTRO}
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                {GUARD_AGENT_INSTALL_STEPS.map((step) => (
                  <li key={step.slice(0, 40)}>{step}</li>
                ))}
              </ol>
              <div
                className="mt-3 space-y-2"
                data-testid="guard-distro-install-commands"
              >
                <p className="text-sm font-medium text-foreground">
                  Perintah di host target (bedakan distro)
                </p>
                {GUARD_DISTRO_INSTALL_GUIDES.map((guide) => (
                  <details
                    key={guide.id}
                    className="group rounded-md border border-border bg-muted/30"
                  >
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                          {guide.title}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {guide.blurb}
                        </span>
                      </span>
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <pre className="mx-3 mb-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background/80 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                      {guide.commands.join("\n")}
                    </pre>
                  </details>
                ))}
                <p className="text-xs text-muted-foreground">
                  {GUARD_DISTRO_INSTALL_FOOTER}
                </p>
              </div>
            </li>
            <li>
              Klik <Ui>Sync</Ui> (admin) untuk memperbarui proyeksi. Lihat tabel{" "}
              <Ui>Agen</Ui> (status active/disconnected/pending) dan{" "}
              <Ui>Alert kritis</Ui>.
            </li>
            <li>
              Viewer+: hanya melihat agent/alert setelah Guard enabled — tanpa
              generate token.
            </li>
            <li>
              Troubleshooting singkat: enroll 4xx → token expired/revoked/salah
              org; agen pending lama → cek koneksi host ke{" "}
              <code className="text-foreground">manager_host</code> dari
              response + Sync; jangan gunakan password Manager di host.
            </li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <SectionHeading id="tips" icon={BookOpen} title="Tips & batasan" />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Hanya scan / enroll aset yang Anda kuasai secara hukum.</li>
            <li>
              Jangan menyimpan password, API key, atau alamat internal di ticket
              publik / screenshot sembarangan.
            </li>
            <li>
              Guard v1 = inventori + alert kritis + enroll — bukan SOAR atau
              dashboard manager pelanggan.
            </li>
            <li>
              Brand: {BRAND.name} / {BRAND.product}; mesin scan = VulnScanner.
            </li>
            <li>
              Menu ini: Sidebar →{" "}
              <Link to="/guide" className="text-primary hover:underline">
                User Guide
              </Link>
              .
            </li>
          </ul>
          <p className="pt-2 text-xs text-muted-foreground">
            {BRAND.footerLine}
          </p>
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}

export default UserGuide;
