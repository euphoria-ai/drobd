# rembg supports >=3.11,<3.14.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    NUMBA_CACHE_DIR=/tmp \
    U2NET_HOME=/opt/rembg-models

WORKDIR /srv

# onnxruntime needs libgomp; Pillow needs the image codecs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libjpeg62-turbo libpng16-16 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the segmentation weights into the image. Without this the container
# downloads ~200MB on its first request, which reads as a broken app.
ARG REMBG_MODEL=birefnet-general
RUN python -c "from rembg import new_session; new_session('${REMBG_MODEL}')"

COPY drobe ./drobe

EXPOSE 8000
CMD ["uvicorn", "drobe.main:app", "--host", "0.0.0.0", "--port", "8000"]
