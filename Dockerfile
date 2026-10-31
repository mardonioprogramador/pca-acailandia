# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

WORKDIR /app
ENV TZ=America/Sao_Paulo

# Prisma usa OpenSSL. A verificação das assinaturas dos pacotes é preservada.
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared/package.json ./packages/shared/package.json

# Em ambientes com proxy TLS, passar --secret id=proxy_ca,src=... no build.
# O certificado é montado somente neste passo; nunca entra nas camadas.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true

COPY --chown=node:node . .
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm run db:generate && npm run build \
    && chown -R node:node packages/shared/dist apps/api/dist apps/web/dist

# tsx e Prisma CLI permanecem disponíveis para migração, seed e criação do admin.
ENV NODE_ENV=production
ENV API_PORT=3001
USER node
EXPOSE 3001
CMD ["npm", "start"]
