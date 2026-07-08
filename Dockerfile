# Phuglee / Distress OS — one container, one public port (:3000).
# Form Forge (Python) and Property Analyzer (Node) start automatically via server.js.

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python-is-python3 \
    libglib2.0-0 \
    libgomp1 \
    libjpeg62-turbo \
    libopenjp2-7 \
  && ln -sf /usr/bin/python3 /usr/bin/python \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY modules/property-analyzer/package.json modules/property-analyzer/package-lock.json ./modules/property-analyzer/
RUN cd modules/property-analyzer && npm ci --omit=dev

COPY modules/form-forge/requirements.txt ./modules/form-forge/
RUN pip3 install --no-cache-dir -r modules/form-forge/requirements.txt --break-system-packages

COPY . .

# One-time seed: restores Property Analyzer session on first boot when volume is empty.
COPY scripts/seed-data/distressAnalyzerSession_LATEST.json ./scripts/seed-data/

RUN python3 -c "import sys; sys.path.insert(0,'modules/form-forge'); from review_portal.app import app; print('form-forge import ok')" \
  && python3 -c "from waitress import serve; print('waitress ok')"

ENV NODE_ENV=production
ENV PHUGLEE_AUTH_DISABLED=1
ENV DISTRESS_OS_HOST=0.0.0.0
ENV FORM_FORGE_HOST=0.0.0.0
ENV PROPERTY_ANALYZER_HOST=0.0.0.0
ENV FORGE_BUNDLED_FALLBACK=1
ENV FORGE_LOG_INHERIT=1
ENV FORGE_BOOT_LOG=/tmp/forge-boot.log
ENV FORGE_EXTERNAL_BOOT=1
ENV PDA_DATA_ROOT=/app/pda-data

RUN chmod +x scripts/docker-entrypoint.sh

EXPOSE 3000

CMD ["sh", "scripts/docker-entrypoint.sh"]