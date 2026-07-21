FROM python:3.11-slim

ARG APP_VERSION=0.1.0
ARG BUILD_COMMIT=unknown
ARG BUILD_TIME

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV MEDIZINHUB_APP_VERSION=$APP_VERSION
ENV MEDIZINHUB_BUILD_COMMIT=$BUILD_COMMIT
ENV MEDIZINHUB_BUILD_TIME=$BUILD_TIME

LABEL org.opencontainers.image.title="MedizinHub HMS API"
LABEL org.opencontainers.image.version=$APP_VERSION
LABEL org.opencontainers.image.revision=$BUILD_COMMIT
LABEL org.opencontainers.image.created=$BUILD_TIME

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

RUN addgroup --system app && adduser --system --ingroup app app
COPY --chown=app:app . .
RUN mkdir -p uploads && chown -R app:app uploads

USER app

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
