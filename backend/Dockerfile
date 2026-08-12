FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma
COPY . .

EXPOSE 3005 8080 1935
CMD ["sh", "-c", "npx prisma db push --schema prisma/schema.prisma && node server.js"]

