FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY workers/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b AS runtime

WORKDIR /app

ARG BUNDLETOOL_VERSION=1.18.3

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    nmap \
    openssl \
    sudo \
    openjdk-17-jre-headless \
    curl \
    ca-certificates \
    && mkdir -p /opt/bundletool \
    && curl -fsSL \
        "https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar" \
        -o /opt/bundletool/bundletool.jar \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

COPY workers/ .
# Bake backend ORM (prod has no ./backend mount). celery_app sys.path → /backend.
COPY backend/ /backend/

ENV PYTHONPATH=/backend
ENV BUNDLETOOL_JAR=/opt/bundletool/bundletool.jar

RUN chmod +x /app/entrypoint.sh

RUN groupadd -r appuser && useradd -r -g appuser -G sudo -d /app appuser && \
    echo "appuser ALL=(root) NOPASSWD: /usr/bin/nmap" >> /etc/sudoers.d/appuser && \
    chown -R appuser:appuser /app /backend /opt/bundletool

USER appuser

ENTRYPOINT ["/app/entrypoint.sh"]
