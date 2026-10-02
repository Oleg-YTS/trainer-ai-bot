# Stage 1: Build React Frontend from Root Workspace
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Unified Node.js + Python 3.12 Production Runtime
FROM python:3.12-slim
RUN apt-get update && apt-get install -y nodejs npm curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .

COPY package.json ./
RUN npm install --omit=dev

COPY . .
COPY --from=frontend-builder /app/dist ./dist

ENV PYTHONUNBUFFERED=1
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]

