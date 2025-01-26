# Partyrock2api

### 对你有用的话麻烦给个stars谢谢

## 支持模型
- claude-3-5-haiku
- claude-3-5-sonnet
- nova-lite-v1-0
- nova-pro-v1-0
- llama3-1-7b
- llama3-1-70b
- mistral-small
- mistral-large

## 请求格式
和openai的请求格式相同支非流和流

## Docker部署
### 拉取
```bash
docker pull mtxyt/partyrock-api:1.1
```
### 运行
```bash
docker run -d -p 8803:8803 mtxyt/partyrock-api:1.1
```
## 获取请求key获取方式
### 准备步骤
访问:[partyrock](https://partyrock.aws "https://partyrock.aws")
点击Generate app按钮创建app
![image](https://github.com/user-attachments/assets/847748e6-896f-471d-8048-de3379cdbf70)
创建app后按f12打开开发者工具点击网络随便发起提问
### 1.在标头里拿到anti-csrftoken-a2z和cookie
找到对应请求
![屏幕截图 2025-01-26 204042](https://github.com/user-attachments/assets/e8c27ce9-0a0d-468c-89aa-8c61e64b990e)
### 2.在负载里拿到appid
![屏幕截图 2025-01-26 204209](https://github.com/user-attachments/assets/37c6707f-ad98-4cad-af35-b37d6c4d1ef7)

## 注
不支持大陆地区好像
key的格式为appid|||anti-csrftoken-a2z|||cookie组合
如果你的appid=abab1,anti-csrftoken-a2z=132hdwqo,cookie=sdakvfjdijvdiv
那你的key就是abab1|||132hdwqo|||sdakvfjdijvdiv

## 更多
有位朋友提供了ts版本
大家自己部署只需要部署单个版本即可docker部署的是py版本的

## 声明
本项目仅供学术交流使用，请勿用于商业用途。
