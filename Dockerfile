FROM node:20-alpine

WORKDIR /app/backend

COPY --chown=node:node backend/package*.json ./
RUN npm install --omit=dev

WORKDIR /app

# Copy the backend code
COPY --chown=node:node backend/ ./backend/

# Copy the frontend code into /app/frontend so it can be used to populate /app/html
COPY --chown=node:node assets/ ./frontend/assets/
COPY --chown=node:node index.html ./frontend/
COPY --chown=node:node manifest.json ./frontend/
COPY --chown=node:node sw.js ./frontend/
COPY --chown=node:node setup.html ./frontend/

# Create the directories and assign ownership to the bundled node user (UID 1000)
RUN mkdir -p /app/data /app/html /app/frontend && \
    chown -R node:node /app

COPY --chown=node:node docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Switch to the bundled node user (UID 1000) to match the documented host volume permissions
USER node

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "backend/server.js"]
