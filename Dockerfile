# ---- Dockerfile (Node.js) ----
FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy app code
COPY . .

# Prod env + port Fly will hit
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Start (uses "start": "node index.js" from your package.json)
CMD ["npm", "start"]
