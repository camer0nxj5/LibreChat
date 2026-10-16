import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ['CJ_ROUTER_TEST_DIR'])
from server import Gateway
from routing import Routing

config = json.loads(Path(__file__).with_name('routing.json').read_text())
server = Gateway(('127.0.0.1', 4119), 'fixture-inference-key', 'http://127.0.0.1:1/v1', '', ['fixture'],
                 routing=Routing(config, 's' * 32), control_key='fixture-control-key')
server.serve_forever()
