# ── Stage 1: build React frontend ─────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python backend + React dist ──────────────────────────────────
FROM python:3.12-slim
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./dist

EXPOSE 7860

CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860} --proxy-headers"
