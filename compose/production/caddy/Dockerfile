# Caddy serving the built frontend.
# Build context: ./frontend, plus the Caddyfile from the "caddy" context.
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

# Empty: the API is on the same domain, so requests go to /api/...
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build


FROM caddy:2-alpine

COPY --from=caddy Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
