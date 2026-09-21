FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir .
COPY . .
ENV PYTHONUNBUFFERED=1
EXPOSE 10000
CMD ["python", "-m", "app.main"]
