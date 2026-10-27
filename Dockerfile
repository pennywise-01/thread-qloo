# Pinned to the release that fixes CVE-2026-111497 (Node2Shell).
# Do not float this tag to `node:22` on a public host.
FROM node:22.23.4-bookworm-slim

WORKDIR /app

# The Qloo harness is a CLI the backend spawns; it never reaches the browser.
RUN npm install --global @qloo/qloo-harness@0.1.26

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Credentials are provided at runtime (docker run -e QLOO_API_KEY=...).
# Never bake them into the image — .dockerignore excludes .env for that reason.
CMD ["npm", "start"]
