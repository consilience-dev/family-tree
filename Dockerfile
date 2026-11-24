FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 DEMO_MODE=false PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package*.json ./
RUN npm ci --omit=dev && mkdir .data && chown node:node .data
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
