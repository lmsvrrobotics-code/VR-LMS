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

# assessment-service listens on 8003 (compose sets PORT=8003). The previous
# 8001 was auth-service's port — copy-paste drift.
EXPOSE 8003

CMD ["node", "index.js"]
