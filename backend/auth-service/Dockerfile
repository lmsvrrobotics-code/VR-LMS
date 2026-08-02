FROM node:22-alpine
WORKDIR /app

# npm ci: install exactly the locked versions rather than re-resolving them.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# curl is required by the compose healthcheck; node:alpine does not ship it.
RUN apk add --no-cache curl

ENV NODE_ENV=production

USER node

# auth-service listens on 8001 (compose sets PORT=8001). The previous 8002 was
# documentation-only drift — EXPOSE does not publish a port, so it never broke
# anything, but it misleads anyone reading the image.
EXPOSE 8001

# MUST match package.json's start script — see the Bastion Dockerfile comment:
# dropping --import ./instrument.mjs silently disables Sentry reporting.
CMD ["node", "--import", "./instrument.mjs", "index.js"]
