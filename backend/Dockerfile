# Stage 1: Build (compiles C extensions only)
FROM python:3.15-slim-bookworm@sha256:575f8bc12ec26542e0678bc6b60e385218248019d433157ec327264a78c3a853 AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Runtime
FROM python:3.15-slim-bookworm@sha256:575f8bc12ec26542e0678bc6b60e385218248019d433157ec327264a78c3a853 AS runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz-subset0 \
    fonts-dejavu-core \
    libbrotli1 \
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

COPY . .
RUN chmod +x /app/entrypoint.sh /app/prestart.sh

RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser && \
    chown -R appuser:appuser /app && \
    mkdir -p /tmp/scans && chown appuser:appuser /tmp/scans

USER appuser

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
