FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev

WORKDIR /app

# Copy the backend code
COPY backend/ ./backend/

# Copy the frontend code into /app/html so it can be volume-mapped
COPY assets/ ./html/assets/
COPY index.html ./html/
COPY manifest.json ./html/
COPY sw.js ./html/
COPY setup.html ./html/

# Create the data directory
RUN mkdir -p /app/data && chown -R node:node /app/data /app/html

# Use a non-root user
USER node

EXPOSE 3000

CMD ["node", "backend/server.js"]
