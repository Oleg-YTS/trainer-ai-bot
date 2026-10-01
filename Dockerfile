# Stage 1: Build React Frontend (Vite)
FROM node:22-alpine AS frontend-builder
WORKDIR /app/webapp
COPY webapp/package.json ./
RUN npm install
COPY webapp/ ./
RUN npm run build

# Stage 2: Python FastAPI Backend + Aiogram Bot + WebApp Static
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
COPY --from=frontend-builder /app/webapp/dist ./webapp/dist
COPY . .
ENV PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["python", "-m", "app.main"]
