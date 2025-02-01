# 使用官方Python轻量级镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖（确保curl可用于健康检查）
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# 复制应用文件
COPY . .

# 安装Python依赖
RUN pip install --no-cache-dir flask requests

# 设置运行参数
ENV FLASK_DEBUG=0 \
    FLASK_ENV=production \
    PORT=8803

# 暴露端口
EXPOSE ${PORT}

# 添加健康检查
HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:${PORT}/ || exit 1

# 使用非root用户运行
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# 启动命令
CMD ["python", "app.py"]
