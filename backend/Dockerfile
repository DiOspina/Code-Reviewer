FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema para tree-sitter y compilación
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    git \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements primero para aprovechar cache de Docker
COPY requirements.txt .

# Instalar dependencias Python
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Descargar modelos de tree-sitter para lenguajes soportados
RUN python -c "
from tree_sitter import Language
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
import tree_sitter_go as tsgo
import tree_sitter_rust as tsrust
import tree_sitter_java as tsjava
print('Tree-sitter languages loaded successfully')
"

# Copiar código de la aplicación
COPY . .

# Crear directorio para archivos temporales
RUN mkdir -p /tmp/agent_reviewer

# Usuario no root para seguridad
RUN useradd --create-home --shell /bin/bash app && \
    chown -R app:app /app /tmp/agent_reviewer
USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]