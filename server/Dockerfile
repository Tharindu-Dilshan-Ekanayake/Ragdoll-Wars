# The Floppy Front game server, as Bloxity Legion runs it. Build from the repo root,
# since the server runs the game's own battle simulation from the client's source:
#   docker build -f server/Dockerfile .
FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app
# The battle simulation and maps (plain ESM, no dependencies), shared with the client.
COPY client/src/battle/sim ./client/src/battle/sim
COPY client/src/battle/maps ./client/src/battle/maps
# The profile rules cloud saves share with the game.
COPY client/src/shared ./client/src/shared
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev && npm cache clean --force
COPY server/src ./server/src

WORKDIR /app/server
# Legion requires a non-root user; the official Node image ships one called node.
USER node
# Legion injects PORT (2567); HTTP and the game's WebSocket share it.
EXPOSE 2567
CMD ["node", "src/server.js"]
