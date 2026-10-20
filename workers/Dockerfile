FROM python:3.12-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258 AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY workers/requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258 AS runtime

WORKDIR /app

ARG BUNDLETOOL_VERSION=1.18.3
ARG INSTALL_BUNDLETOOL=0

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    nmap \
    openssl \
    sudo \
    openjdk-17-jre-headless \
    ca-certificates \
    && mkdir -p /opt/bundletool /tmp/scans /tmp/bundletool-work \
    && chmod 1777 /tmp/scans /tmp/bundletool-work \
    && if [ "$INSTALL_BUNDLETOOL" = "1" ]; then \
         apt-get install -y --no-install-recommends curl \
         && ( \
              curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 \
                --connect-timeout 30 --max-time 180 \
                "https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar" \
                -o /opt/bundletool/bundletool.jar \
           || curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 \
                --connect-timeout 30 --max-time 180 \
                "https://ghproxy.net/https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar" \
                -o /opt/bundletool/bundletool.jar \
         ) \
         && apt-get purge -y curl \
         && apt-get autoremove -y; \
       fi \
    && rm -rf /var/lib/apt/lists/*

# Nothing in the runtime stage installs packages, but the base image ships pip
# (25.0.1, six advisories) and pip vendors its own urllib3/msgpack, which Trivy
# scans as vulnerable copies. Remove pip and setuptools from the runtime image
# instead of upgrading them: smaller attack surface, and no vendored duplicates.
RUN python -m pip uninstall -y pip setuptools \
    && rm -rf /usr/local/lib/python3.12/site-packages/pip \
              /usr/local/lib/python3.12/site-packages/pip-*.dist-info \
              /usr/local/lib/python3.12/site-packages/setuptools* \
              /usr/local/lib/python3.12/site-packages/pkg_resources \
    && python -c "import sys; print('runtime python', sys.version.split()[0], '- no pip, by design')"

COPY --from=builder /install /usr/local

COPY workers/ .
# Bake backend ORM (prod has no ./backend mount). celery_app sys.path → /backend.
COPY backend/ /backend/

ENV PYTHONPATH=/backend
ENV BUNDLETOOL_JAR=/opt/bundletool/bundletool.jar
ENV BUNDLETOOL_JAVA_TMPDIR=/tmp/bundletool-work

RUN chmod +x /app/entrypoint.sh

RUN groupadd -r appuser && useradd -r -g appuser -G sudo -d /app appuser && \
    echo "appuser ALL=(root) NOPASSWD: /usr/bin/nmap" >> /etc/sudoers.d/appuser && \
    chown -R appuser:appuser /app /backend /opt/bundletool

USER appuser

ENTRYPOINT ["/app/entrypoint.sh"]
