# Dockerfile for UniGrade CGPA App
# Builds the Node.js backend along with Puppeteer/Chromium dependencies.
FROM node:20-bullseye-slim

WORKDIR /usr/src/app

# Install Chromium dependencies required by Puppeteer.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    libgbm1 \
    libasound2 \
    wget \
  && rm -rf /var/lib/apt/lists/*

# Copy package metadata and install server dependencies.
COPY ./server/package*.json ./server/
RUN npm ci --prefix ./server

# Copy the full workspace into the image.
COPY . .

WORKDIR /usr/src/app/server

EXPOSE 3000

ENV NODE_ENV=production
ENV USE_MOCK=false
ENV PORT=3000

CMD ["node", "index.js"]
