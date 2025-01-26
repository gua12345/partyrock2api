# Partyrock2api


## 声明
- 仅用于学术研究和交流学习

## 支持模型
- claude-3-5-haiku
- claude-3-5-opus
- nova-lite-v1-0
- nova-pro-v1-0
- llama3-1-7b
- llama3-1-70b
- mistral-small
- mistral-large

## Docker部署
### 拉取
```bash
docker pull mtxyt/partyrock-api:1.0
```
### 运行
```bash
docker run -d -p 8803:8803 mtxyt/partyrock-api:1.0
```
如果你想配置uuid或key可以用
```bash
docker run -d -p 8803:8803 mtxyt/partyrock-api:1.0
```

## 声明
本项目仅供学术交流使用，请勿用于商业用途。
