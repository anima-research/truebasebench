# True Base Bench: build the static site (Vite) and serve it with Caddy. Used by Railway (railway.json).
#
#   docker build -t truebasebench --build-arg VITE_DATA_BASE_URL=https://<bucket>.s3.<region>.io.cloud.ovh.net .
#   docker run --rm -p 8080:8080 truebasebench        # http://localhost:8080
#
# Build args (on Railway: service variables of the same name are passed as build args automatically):
#   VITE_DATA_BASE_URL    public base URL of the OVH bucket holding manifest.json + bench_v<N>.json.
#                         Empty = serve only the repo copy in data/ (bundled into the image at /data/).
#   VITE_SOURCE_REPO_URL  e.g. https://github.com/anima-research/truebasebench (links script names).
#   RUN_TESTS             1 (default) runs the site's data-contract and scoring tests before building.

# ---------------------------------------------------------------- build
FROM node:20.18.1-bookworm-slim AS build
WORKDIR /app/site

# Dependencies first, for layer caching.
COPY site/package.json site/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Sources (explicit list: never the host's node_modules or dist).
COPY data /app/data
# docs/ holds the measurement scripts; the tests check the site's method constants against them.
COPY docs /app/docs
COPY site/index.html site/tsconfig.json site/vite.config.ts site/vitest.config.ts ./
COPY site/public ./public
COPY site/src ./src
COPY tools/csp.mjs /app/tools/csp.mjs

ARG VITE_DATA_BASE_URL=""
ARG VITE_SOURCE_REPO_URL=""
ARG RUN_TESTS=1
ENV VITE_DATA_BASE_URL=${VITE_DATA_BASE_URL} \
    VITE_SOURCE_REPO_URL=${VITE_SOURCE_REPO_URL}

RUN if [ "$RUN_TESTS" = "1" ]; then npm test; fi \
 && npm run build \
 && test -f dist/index.html && test -f dist/data/manifest.json \
 && node /app/tools/csp.mjs dist/index.html /app/csp.caddy

# ---------------------------------------------------------------- serve
FROM caddy:2.8.4-alpine AS serve
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/csp.caddy /etc/caddy/csp.caddy
COPY --from=build /app/site/dist /srv
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# Railway sets PORT; 8080 when run elsewhere. Caddy needs no writable state here (no TLS, no admin API);
# its data/config dirs point at /tmp so it can run unprivileged.
ENV PORT=8080 \
    XDG_DATA_HOME=/tmp/caddy-data \
    XDG_CONFIG_HOME=/tmp/caddy-config
EXPOSE 8080
USER 1000:1000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
