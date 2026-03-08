FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev

WORKDIR /app

# Copy the backend code
COPY backend/ ./backend/

# Copy the frontend code into /app/frontend so it can be used to populate /app/html
COPY assets/ ./frontend/assets/
COPY index.html ./frontend/
COPY manifest.json ./frontend/
COPY sw.js ./frontend/
COPY setup.html ./frontend/

# Create the data and html directories
RUN mkdir -p /app/data /app/html && chown -R node:node /app/data /app/html /app/frontend

COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Use a non-root user
USER node

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "backend/server.js"]
