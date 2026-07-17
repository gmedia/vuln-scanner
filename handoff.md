HANDOFF CONTEXT
===============

USER REQUESTS (AS-IS)
---------------------
- "What did we do so far?"
- "apakah agent mengalami stuck?"
- "buat handoff.md saya ingin melanjutkan menggunakan session 0pencode baru"

GOAL
----
Melanjutkan investigasi dan perbaikan scan job stuck "pending" di production (vs.appmedia.id). Dua job ID: c57bce63-3b6e-4f44-b4cb-960b048c9ae0 dan 71ab4184-8974-42c9-ac1f-c5b54b94b755.

WORK COMPLETED
--------------
- Membaca arsitektur dispatch-to-worker flow:
  - backend/app/services/scanner.py — dispatch Celery, start_scan, _dispatch_task, error handling CeleryError + rollback credit
  - backend/app/models/scan_job.py — schema ScanJob, status: pending/running/completed/failed
  - workers/celery_app.py — worker config: task_acks_late=True, rate limit 10/m, soft/hard timeout 600s/900s, queue routing
  - workers/tasks/ip_scan.py, domain_scan.py, mobile_scan.py — task dengan max_retries=3, dead_letter_handler, transisi status pending→running→completed/failed
  - docker-compose.yml — 3 worker container terpisah (worker_ip, worker_domain, worker_mobile) dengan queue routing via CELERY_QUEUE env
- Menemukan root cause gap: dua Celery app berbeda
  - Backend dispatcher: Celery("vuln_scanner_api") — tidak ada autodiscover_tasks, tidak ada config
  - Worker consumer: Celery("vuln_scanner") — ada autodiscover_tasks, config lengkap
- Diagnosis 5 skenario kenapa task bisa stuck pending:
  1. Worker container tidak running/crash
  2. Dua Celery app berbeda nama → potensi serialization/routing mismatch
  3. Task tidak masuk ke queue yang benar (default "celery" vs "ip_scan"/"domain_scan"/"mobile_scan")
  4. Worker health check HTTP pass tapi Celery consumer thread mati
  5. Rate limit 10/m menyebabkan antrian saat burst request
- Rekomendasi perbaikan: samakan Celery app name, tambah auto-fail untuk job pending > N menit, monitoring queue depth

CURRENT STATE
-------------
- Tidak ada perubahan code di repo terkait diagnosis ini (hanya read-only analysis)
- Ada file .bak: backend/app/services/auth.py.bak (uncommitted)
- Branch saat ini: tidak diketahui (belum ada branch baru untuk fix ini)
- Git history 10 commit terakhir: mostly test files untuk backend (test_scan_routes.py, test_auth_routes.py, dll)

PENDING TASKS
-------------
- Cek production: docker ps | grep worker, docker logs worker, Redis LLEN queue
- Samakan Celery app name backend dan worker
- Tambahkan autodiscover_tasks atau task_routes di backend Celery app
- Tambahkan endpoint monitoring queue depth (/health/queues)
- Tambahkan periodic task/cron untuk auto-fail job pending > N menit tanpa update
- Pastikan dead_letter handler berfungsi
- Buat branch feat/fix-scan-stuck-pending dan PR

KEY FILES
---------
- backend/app/services/scanner.py — dispatch logic, send_task ke Celery, rollback credit
- backend/app/models/scan_job.py — ScanJob model, status constraints
- workers/celery_app.py — worker Celery config, queue routing, rate limits
- workers/tasks/ip_scan.py — IP scan task, _update_status, _refund_credits
- workers/tasks/domain_scan.py — domain scan task
- workers/tasks/mobile_scan.py — mobile scan task
- docker-compose.yml — service definitions, worker containers
- backend/app/config.py — settings, Redis URL builder

IMPORTANT DECISIONS
-------------------
- Flow dispatch normal: start_scan → INSERT job (pending) → send_task ke Redis → UPDATE celery_task_id → commit
- Flow worker normal: consume task → _update_status("running") → scan → _update_status("completed"/"failed")
- Jika dispatch sukses (celery_task_id terisi) tapi status tetap "pending", artinya task berhasil dikirim ke broker tapi worker tidak pickup atau crash sebelum update status ke "running"
- Nama task di send_task: "ip_scan.run", "domain_scan.run", "mobile_scan.run"
- Queue mapping: ip_scan→ip_scan, domain_scan→domain_scan, mobile_scan→mobile_scan
- Worker punya max_retries=3, dead_letter_handler, soft limit 600s, hard limit 900s
- Backend Celery app name: "vuln_scanner_api" — Worker Celery app name: "vuln_scanner" — INCONSISTENT

EXPLICIT CONSTRAINTS
--------------------
- Ikuti AGENTS.md workflow: branch dari main, conventional commits, push segera, PR dengan --fill
- Jangan spawn terlalu banyak background agent

CONTEXT FOR CONTINUATION
------------------------
- Tidak bisa akses production server dari sini — perlu SSH manual atau minta user cek
- Diagnosis sudah komplit, tinggal implementasi code fix + verifikasi production
- Prioritas: samakan Celery app name dulu (fix termudah dengan dampak terbesar)
- Worker health check di port 8001 — bisa dimanfaatkan untuk monitoring tambahan
