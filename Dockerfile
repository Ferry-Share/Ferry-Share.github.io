# Relay-only image. The front end is a static export; serve it from Pages,
# any CDN, or `npm run lan`.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
ENV PORT=8081
EXPOSE 8081
CMD ["node", "server/relay.js"]
