FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app
COPY . .

# Create volume for database persistence
VOLUME /app/data
RUN mkdir -p /app/data

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5001/api || exit 1

# Run
CMD ["node", "server.js"]
