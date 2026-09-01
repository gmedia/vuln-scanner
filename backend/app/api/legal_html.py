from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from app.api.blog_html import CANONICAL_HOST, _shell
from app.middleware.rate_limit import RateLimiter

html_router = APIRouter(tags=["legal-html"])

public_limiter = RateLimiter(
    max_requests=120,
    window_seconds=60,
    prefix="ratelimit:legal-html",
)

_CACHE = {
    "Cache-Control": "public, max-age=300, s-maxage=3600",
    "X-Robots-Tag": "index, follow",
}


def _legal_article(eyebrow: str, title: str, body: str) -> str:
    return (
        f"<article data-testid='legal-article'>"
        f"<p class='eyebrow'>{eyebrow}</p>"
        f"<h1>{title}</h1>"
        f"<p class='meta'>Berlaku untuk sinexis.app · bukan nasihat hukum</p>"
        f"<div class='body'>{body}</div>"
        f"</article>"
    )


_TERMS_BODY = """
<p>Dengan membuat akun atau memakai layanan Sinexis (scan IP, domain, mobile,
jadwal attach, workspace, Guard, dan kredit), Anda setuju dengan syarat ini.
Jika Anda tidak setuju, jangan gunakan layanan.</p>
<h2>1. Siapa yang boleh memakai</h2>
<p>Anda harus berwenang atas target yang Anda pindai. Scan hanya untuk aset
yang Anda miliki, sewa, atau yang secara tertulis diizinkan pemiliknya.
Memindai sistem orang lain tanpa izin dapat melanggar hukum.</p>
<h2>2. Layanan</h2>
<p>Sinexis menyediakan alat keamanan (scan, laporan, jadwal, workspace, Guard
tipis berbasis Wazuh — satu wazuh-agent per VM). Hasil bersifat indikasi
teknis, bukan jaminan bahwa sistem aman, dan bukan audit resmi, sertifikasi,
atau SIEM penuh.</p>
<h2>3. Kredit dan pembayaran</h2>
<p>Scan tertentu memakai kredit. Harga dan sisa saldo tampil di dasbor.
Kredit tidak dijamin dapat diuangkan. Kami dapat mengubah harga dengan
pemberitahuan di produk.</p>
<h2>4. Akun dan workspace</h2>
<p>Anda bertanggung jawab atas kredensial, undangan, dan peran di organisasi
Anda. Jangan membagikan kunci API atau token enroll secara publik.</p>
<h2>5. Larangan</h2>
<p>Dilarang memakai layanan untuk serangan, eksploitasi, malware, atau
mengganggu pihak ketiga. Kami dapat menangguhkan akun yang menyalahgunakan
scan atau kuota.</p>
<h2>6. Ketersediaan</h2>
<p>Layanan disediakan “sebagaimana adanya”. Kami dapat merawat, membatasi,
atau mengubah fitur. Tidak ada SLA implisit kecuali disepakati tertulis.</p>
<h2>7. Tanggung jawab</h2>
<p>Sejauh diizinkan hukum, Sinexis tidak bertanggung jawab atas kerugian
tidak langsung, kehilangan data, atau keputusan yang Anda ambil berdasarkan
hasil scan. Tanggung jawab agregat kami terbatas pada jumlah yang Anda
bayar untuk layanan dalam 12 bulan terakhir, atau nol jika gratis.</p>
<h2>8. Hukum</h2>
<p>Syarat ini diatur hukum Republik Indonesia, tanpa mengesampingkan hak
konsumen yang tidak dapat dikesampingkan. Sengketa diupayakan musyawarah
lebih dulu.</p>
<h2>9. Perubahan</h2>
<p>Kami dapat memperbarui halaman ini. Tanggal berlaku adalah tanggal
publikasi di URL ini. Pemakaian lanjutan berarti Anda menerima versi baru.</p>
<p>Kontak: gunakan formulir atau email yang tertera di akun Anda setelah
masuk. Halaman ini bukan pengganti perjanjian tertulis terpisah (jika ada).</p>
"""

_PRIVACY_BODY = """
<p>Kebijakan ini menjelaskan data yang kami proses saat Anda memakai
sinexis.app. Ini ringkasan produk, bukan nasihat hukum.</p>
<h2>1. Data yang kami kumpulkan</h2>
<ul>
<li>Akun: email, hash kata sandi, peran, keanggotaan workspace.</li>
<li>Pemakaian: target scan yang Anda kirim, jadwal, laporan, log kredit.</li>
<li>Guard: inventaris agen dan alert yang diikat ke organisasi Anda.</li>
<li>Teknis: alamat IP, log akses, cookie sesi yang diperlukan untuk login
dan preferensi tema/bahasa.</li>
</ul>
<h2>2. Tujuan</h2>
<p>Data dipakai untuk menyediakan scan, menagih kredit, keamanan akun,
dukungan, dan perbaikan produk. Kami tidak menjual daftar email Anda.</p>
<h2>3. Dasar pemrosesan</h2>
<p>Pemrosesan didasarkan pada kontrak (penyediaan layanan), kepentingan
sah (keamanan, pencegahan penyalahgunaan), dan kewajiban hukum jika ada.</p>
<h2>4. Penyimpanan dan lokasi</h2>
<p>Data disimpan di infrastruktur yang kami operasikan (termasuk colo/VPS).
Retensi mengikuti kebutuhan operasional: akun aktif, riwayat scan, dan
cadangan terbatas. Setelah akun dihapus, data dihapus atau dianonimkan
dalam jangka wajar kecuali hukum mewajibkan simpan lebih lama.</p>
<h2>5. Berbagi</h2>
<p>Kami dapat memakai subprosesor (hosting, email transaksional, pemantauan)
yang terikat kerahasiaan. Guard dapat meneruskan telemetri ke Manager
Wazuh yang kami kelola untuk organisasi Anda — bukan ke pelanggan lain.</p>
<h2>6. Keamanan</h2>
<p>Akses API memakai kunci atau JWT. Kami menerapkan kontrol wajar; tidak
ada sistem yang 100% aman. Laporkan insiden lewat saluran dukungan akun.</p>
<h2>7. Hak Anda</h2>
<p>Anda dapat meminta akses, koreksi, atau penghapusan data akun sesuai
hukum yang berlaku. Beberapa log teknis mungkin tertahan untuk keamanan.</p>
<h2>8. Cookie</h2>
<p>Kami memakai penyimpanan lokal untuk tema dan bahasa, plus cookie sesi
autentikasi. Bukan iklan pihak ketiga.</p>
<h2>9. Perubahan</h2>
<p>Pembaruan dipublikasikan di URL ini. Pertanyaan privasi: saluran dukungan
di dalam akun setelah masuk.</p>
"""


@html_router.get("/terms", response_class=HTMLResponse)
async def terms_html(request: Request) -> HTMLResponse:
    limited = await public_limiter(request)
    if limited:
        return limited  # type: ignore[return-value]
    inner = _legal_article("Legal", "Syarat dan Ketentuan", _TERMS_BODY)
    html = _shell(
        "Syarat dan Ketentuan — Sinexis",
        f"{CANONICAL_HOST}/terms",
        inner,
        current="terms",
    )
    return HTMLResponse(html, headers=_CACHE)


@html_router.get("/privacy", response_class=HTMLResponse)
async def privacy_html(request: Request) -> HTMLResponse:
    limited = await public_limiter(request)
    if limited:
        return limited  # type: ignore[return-value]
    inner = _legal_article("Legal", "Kebijakan Privasi", _PRIVACY_BODY)
    html = _shell(
        "Kebijakan Privasi — Sinexis",
        f"{CANONICAL_HOST}/privacy",
        inner,
        current="privacy",
    )
    return HTMLResponse(html, headers=_CACHE)
