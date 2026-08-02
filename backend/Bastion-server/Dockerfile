FROM node:22-alpine
WORKDIR /app

# npm ci installs exactly what package-lock.json pins and fails if the two are
# out of sync — npm install would silently resolve newer transitive versions,
# so the image you tested is not the image you ship.
# --omit=dev drops nodemon and other dev-only packages from the runtime image.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# curl is required by the compose healthcheck; node:alpine does not ship it.
RUN apk add --no-cache curl

ENV NODE_ENV=production

# Run as non-root. The base image provides an unprivileged `node` user; a
# container compromise should not start out with root in the filesystem.
USER node

EXPOSE 8000

# MUST match package.json's start script. --import ./instrument.mjs initialises
# Sentry BEFORE express loads; without it Sentry cannot instrument express and
# production errors go unreported (the process still boots, so the omission is
# invisible until you need the error data).
CMD ["node", "--import", "./instrument.mjs", "index.js"]
