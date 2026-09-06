# Backend static payloads

`sinexis-install.sh` is a copy of `packaging/host-protect-helper/sinexis-install.sh`.

Keep them in sync when the packaging wrapper changes. The public download is
`GET /install/sinexis-install.sh` (no API key). Docker build context is `./backend`,
so the file must live here — not only under `packaging/`.
