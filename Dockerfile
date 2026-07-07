# Phuglee / Distress OS — one container, one public port (:3000).
# Form Forge (Python) and Property Analyzer (Node) start automatically via server.js.

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY modules/property-analyzer/package.json modules/property-analyzer/package-lock.json ./modules/property-analyzer/
RUN cd modules/property-analyzer && npm ci --omit=dev

COPY modules/form-forge/requirements.txt ./modules/form-forge/
RUN pip3 install --no-cache-dir -r modules/form-forge/requirements.txt --break-system-packages

COPY . .

ENV NODE_ENV=production
ENV DISTRESS_OS_HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "server.js"]