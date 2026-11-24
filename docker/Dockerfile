FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["npm", "run", "start"]
