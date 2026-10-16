import json,os,sys,threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
sys.path.insert(0,os.environ['CJ_ROUTER_TEST_DIR'])
from server import Gateway
from service import ClawiQ
states=[]
class FakeOpenClaw(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  data=json.dumps(states).encode();self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def do_POST(self):
  payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  states.append({'route':self.headers.get('x-openclaw-model'),'model':payload['model'],'tools':len(payload.get('tools',[])),'user':payload.get('user')})
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  for delta,finish in [({'role':'assistant','content':'E2E mock reply: pong'},None),({},'stop')]:
   chunk={'id':'fixture','object':'chat.completion.chunk','created':1,'model':payload['model'],'choices':[{'index':0,'delta':delta,'finish_reason':finish}]}
   self.wfile.write(('data: '+json.dumps(chunk)+'\n\n').encode());self.wfile.flush()
  self.wfile.write(b'data: [DONE]\n\n')
up=ThreadingHTTPServer(('127.0.0.1',4129),FakeOpenClaw)
threading.Thread(target=up.serve_forever,daemon=True).start()
c=json.loads((Path(os.environ['CJ_ROUTER_TEST_DIR'])/'routing.example.json').read_text())
for category in c['categories'].values():
 category['fireworks']={'label':'Fireworks fixture','endpoint':'Fireworks','model':'fixture/kimi'}
 category['chatgpt']={'label':'ChatGPT fixture','endpoint':'openAI','model':'fixture/gpt'}
c['openclaw_models']={'local':'fixture/local','fireworks':'fixture/kimi','chatgpt':'fixture/gpt'}
c['local_history_envelope']=True
Gateway(('127.0.0.1',4119),ClawiQ(c,'s'*32,history_key='h'*40),'fixture-control-key'*3,'http://127.0.0.1:4129/v1','fake-upstream-key').serve_forever()
