from __future__ import annotations


class ScanPdfUnavailableError(Exception):
    pass


def render_scan_pdf(html: str) -> bytes:
    try:
        from weasyprint import HTML
    except (OSError, ImportError) as exc:
        raise ScanPdfUnavailableError("PDF rendering unavailable") from exc

    try:
        pdf = HTML(string=html).write_pdf()
    except OSError as exc:
        raise ScanPdfUnavailableError("PDF rendering unavailable") from exc

    if not isinstance(pdf, bytes) or not pdf:
        raise ScanPdfUnavailableError("PDF rendering unavailable")
    return pdf
