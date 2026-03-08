FROM node:20-alpine

WORKDIR /app/backend

COPY --chown=node:node backend/package*.json ./
RUN npm install --omit=dev

WORKDIR /app

# Copy the backend code
COPY --chown=node:node backend/ ./backend/

# Copy the frontend code into /app/html and keep a bundled seed copy for empty bind mounts
COPY --chown=node:node assets/ ./html/assets/
COPY --chown=node:node index.html ./html/
COPY --chown=node:node manifest.json ./html/
COPY --chown=node:node sw.js ./html/
COPY --chown=node:node setup.html ./html/

# Create the directories and assign ownership to the bundled node user (UID 1000)
RUN mkdir -p /app/data /app/html-seed && \
    cp -R /app/html/. /app/html-seed/ && \
    chown -R node:node /app

COPY --chown=node:node docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "backend/server.js"]
