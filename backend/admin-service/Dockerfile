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

# admin-service listens on 5000 (src/config/env.js default, and compose sets
# PORT=5000). The previous 4000 matched neither.
EXPOSE 5000

CMD ["node", "src/server.js"]
