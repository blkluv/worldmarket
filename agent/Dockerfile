FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Railway sets PORT automatically; we expose it for the XMTP relay HTTP server
EXPOSE 3002

CMD ["node", "dist/index.js"]
