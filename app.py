from flask import Flask, request, Response, stream_with_context
import requests
import json
import uuid
import time
import os

app = Flask(__name__)

MODELS = {
  'claude-3-5-haiku': 'bedrock-anthropic.claude-3-5-haiku',
  'claude-3-5-sonnet': 'bedrock-anthropic.claude-3-5-sonnet-v2-0', 
  'nova-lite-v1-0': 'bedrock-amazon.nova-lite-v1-0',
  'nova-pro-v1-0': 'bedrock-amazon.nova-pro-v1-0',
  'llama3-1-7b': 'bedrock-meta.llama3-1-8b-instruct-v1',
  'llama3-1-70b': 'bedrock-meta.llama3-1-70b-instruct-v1',
  'mistral-small': 'bedrock-mistral.mistral-small-2402-v1-0',
  'mistral-large': 'bedrock-mistral.mistral-large-2407-v1-0'
}

def validate_key(key):
  try:
      parts = key.split('|||', 3)
      if len(parts) != 3:
          return None, None, None
      return parts[0], parts[2], parts[1]
  except:
      return None, None, None

def transform_messages(messages):
   return [
       {
           "role": "user",
           "content": [{"text": f"Here is the system prompt to use: {msg['content']}"}]
       } if msg["role"] == "system" else {
           "role": msg["role"],
           "content": [{"text": msg["content"]}]
       }
       for msg in messages
   ]

def create_partyrock_request(openai_req, app_id):
  return {
      "messages": transform_messages(openai_req['messages']),
      "modelName": MODELS.get(openai_req.get('model', 'claude-3-5-haiku')),
      "context": {"type": "chat-widget", "appId": app_id},
      "options": {"temperature": 0},
      "apiVersion": 3
  }

@app.route('/', methods=['GET'])
def home():
  return {"status": "PartyRock API Service Running", "port": 8803}

@app.route('/v1/chat/completions', methods=['POST']) 
def chat():
  try:
      api_key = request.headers.get('Authorization', '').replace('Bearer ', '')
      app_id, cookie, csrf_token = validate_key(api_key)
      
      print(f"App ID: {app_id}")
      print(f"Cookie length: {len(cookie) if cookie else 'None'}")
      print(f"CSRF Token: {csrf_token}")
      
      if not app_id or not cookie or not csrf_token:
          return Response("Invalid API key format. Use: appId|||csrf_token|||cookies", status=401)

      headers = {
          'accept': 'text/event-stream',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'anti-csrftoken-a2z': csrf_token,
          'content-type': 'application/json',
          'origin': 'https://partyrock.aws',
          'referer': f'https://partyrock.aws/u/chatyt/{app_id}',
          'cookie': cookie,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }

      response = requests.post(
          'https://partyrock.aws/stream/getCompletion',
          headers=headers,
          json=create_partyrock_request(request.json, app_id),
          stream=True
      )
      
      if response.status_code != 200:
          return Response(f"PartyRock API error: {response.text}", status=response.status_code)

      if not request.json.get('stream', False):
          try:
              full_content = ""
              buffer = ""
              for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
                  if chunk:
                      buffer += chunk
                      while '\n' in buffer:
                          line, buffer = buffer.split('\n', 1)
                          if line.startswith('data: '):
                              try:
                                  data = json.loads(line[6:])
                                  if data["type"] == "text":
                                      content = data["text"]
                                      if isinstance(content, str):
                                          content = content.encode('latin1').decode('utf-8')
                                      if content and content != " ":
                                          full_content += content
                              except:
                                  continue

              return {
                  "id": str(uuid.uuid4()),
                  "object": "chat.completion",
                  "created": int(time.time()),
                  "model": request.json.get('model', 'claude-3-haiku'),
                  "choices": [{
                      "message": {
                          "role": "assistant",
                          "content": full_content
                      },
                      "finish_reason": "stop",
                      "index": 0
                  }]
              }
          except Exception as e:
              print(f"Error processing response: {str(e)}")
              return Response("Failed to process response", status=500)

      def generate():
          try:
              buffer = ""
              for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
                  if chunk:
                      buffer += chunk
                      while '\n' in buffer:
                          line, buffer = buffer.split('\n', 1)
                          if line.startswith('data: '):
                              try:
                                  data = json.loads(line[6:])
                                  if data["type"] == "text":
                                      content = data["text"]
                                      if isinstance(content, str):
                                          content = content.encode('latin1').decode('utf-8')
                                      chunk_resp = {
                                          "id": str(uuid.uuid4()),
                                          "object": "chat.completion.chunk",
                                          "created": int(time.time()),
                                          "model": request.json.get('model', 'claude-3-haiku'),
                                          "choices": [{
                                              "delta": {"content": content},
                                              "index": 0,
                                              "finish_reason": None
                                          }]
                                      }
                                      yield f"data: {json.dumps(chunk_resp, ensure_ascii=False)}\n\n"
                              except:
                                  continue

              yield f"data: {json.dumps({'choices':[{'delta':{'content':''},'index':0,'finish_reason':'stop'}]})}\n\n"
              yield "data: [DONE]\n\n"
          except Exception as e:
              print(f"Error in generate: {str(e)}")
              return

      return Response(
          stream_with_context(generate()),
          content_type='text/event-stream'
      )

  except Exception as e:
      print(f"Error: {str(e)}")
      return Response(f"Internal server error: {str(e)}", status=500)

if __name__ == '__main__':
  app.run(host='0.0.0.0', port=8803, debug=True)
