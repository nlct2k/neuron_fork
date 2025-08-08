ARG BUILD_TYPE
ARG CUDA_VERSION=12.9.0
ARG UBUNTU_VERSION=22.04


# NON-CUDA base
FROM python:3.10-slim AS base-nocuda


# CUDA base
FROM nvidia/cuda:${CUDA_VERSION}-runtime-ubuntu${UBUNTU_VERSION} AS base-cuda
# Nvidia container toolkit
RUN apt-get update && apt-get install -y \
    curl gpg
RUN curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
    && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
RUN apt-get update && apt-get install -y \
    nvidia-container-toolkit
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3.10-venv \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3.10 /usr/bin/python


# Main build stage
FROM base-${BUILD_TYPE:-nocuda} AS final


# Set working directory
WORKDIR /app


ENV HOST=0.0.0.0


# Ignore hash sum mismatch for apt-get
RUN echo "Acquire::http::Pipeline-Depth 0;" > /etc/apt/apt.conf.d/99custom && \
    echo "Acquire::http::No-Cache true;" >> /etc/apt/apt.conf.d/99custom && \
    echo "Acquire::BrokenProxy    true;" >> /etc/apt/apt.conf.d/99custom


# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    gcc \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*


# Upgrade pip and install poetry
RUN pip install --upgrade pip
RUN pip install --upgrade --force-reinstall attrs
RUN pip install poetry


ENV POETRY_VIRTUALENVS_CREATE=false
RUN poetry config virtualenvs.create false


# Copy the client package first
COPY packages/python/neuronpedia-inference-client /app/packages/python/neuronpedia-inference-client/


# Copy only poetry files
COPY apps/inference/pyproject.toml apps/inference/poetry.lock* apps/inference/
WORKDIR /app/apps/inference


# Clear pip cache and install dependencies with no cache
ENV POETRY_REQUESTS_TIMEOUT=30
ENV PIP_NO_CACHE_DIR=1
ENV POETRY_INSTALLER_PARALLEL=false


RUN pip install --upgrade --force-reinstall requests urllib3 && \
    poetry install --only main --no-cache


# Install PyTorch nightly AFTER poetry to prevent downgrade
RUN pip install --force-reinstall --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu129


# Now copy the rest of the application code
COPY apps/inference /app/apps/inference/


EXPOSE 5002


CMD ["python", "start.py"]

