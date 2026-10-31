#!/usr/bin/env python3
"""Tiny Chrome DevTools helper for the emulator sign-in test (app WebView or Chrome Custom Tab).
  cdp.py PORT eval URLPART JS            -> prints the JSON value of JS in the first page whose URL contains URLPART
  cdp.py PORT review URLPART [blockSec]  -> on the sign-in page: demo-account sign-in (or 'continue' when already signed
                                            in); with blockSec > 0 the jump back to the app (/native/handoff) is blocked
                                            for that many seconds, so the app must finish by polling.
Demo credentials come from DEMO_USER / DEMO_PASS (never printed)."""
import json, os, sys, time, urllib.request
import websocket

port, cmd, part = sys.argv[1], sys.argv[2], sys.argv[3]

def target():
    for _ in range(30):
        try:
            for t in json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json', timeout=5)):
                if t.get('type') == 'page' and part in t.get('url', '') and t.get('webSocketDebuggerUrl'): return t
        except Exception: pass
        time.sleep(1)
    print(json.dumps({'error': 'no page with ' + part})); sys.exit(2)

t = target()
ws = websocket.create_connection(t['webSocketDebuggerUrl'], timeout=10, suppress_origin=True)
n = [0]
def send(method, params=None):
    n[0] += 1; ws.send(json.dumps({'id': n[0], 'method': method, 'params': params or {}})); return n[0]
def wait(i, events=None):
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == i: return m
        if events is not None and 'method' in m: events.append(m)
def ev(js):
    r = wait(send('Runtime.evaluate', {'expression': js, 'returnByValue': True, 'awaitPromise': True}))
    return (r.get('result', {}).get('result') or {}).get('value')

if cmd == 'eval':
    print(json.dumps(ev(sys.argv[4]), ensure_ascii=False)); sys.exit(0)

if cmd == 'review':
    block = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    events, seen = [], {'ticket': 0, 'handoff_blocked': 0, 'claimable': False}
    wait(send('Network.enable'))
    if block: wait(send('Fetch.enable', {'patterns': [{'urlPattern': '*native/handoff*'}]}))
    time.sleep(2)
    state = ev("JSON.stringify({signedIn: !document.getElementById('signedIn').hidden, review: !document.getElementById('review').hidden, lang: document.documentElement.lang, title: document.getElementById('title').textContent})")
    print('page', state)
    st = json.loads(state or '{}')
    if st.get('signedIn'):
        ev("document.getElementById('continue').click(); 1")
    else:
        u, p = json.dumps(os.environ.get('DEMO_USER', '')), json.dumps(os.environ.get('DEMO_PASS', ''))
        ev(f"document.getElementById('review').open = true; document.getElementById('reviewUser').value = {u}; document.getElementById('reviewPass').value = {p}; document.getElementById('reviewGo').click(); 1")
    end = time.time() + max(block, 12)
    ws.settimeout(2)
    while time.time() < end:
        try: m = json.loads(ws.recv())
        except Exception: continue
        meth = m.get('method', '')
        if meth == 'Network.requestWillBeSent' and '/native/ticket' in m['params']['request']['url']: seen['ticket'] += 1
        if meth == 'Fetch.requestPaused':
            seen['handoff_blocked'] += 1
            ws.send(json.dumps({'id': 9000 + seen['handoff_blocked'], 'method': 'Fetch.failRequest', 'params': {'requestId': m['params']['requestId'], 'errorReason': 'BlockedByClient'}}))
    try: print('after', ev("JSON.stringify({signedIn: !document.getElementById('signedIn').hidden, err: document.getElementById('err').textContent, intro: document.getElementById('intro').textContent})"))
    except Exception as e: print('after: page gone', e)
    print(json.dumps(seen))
