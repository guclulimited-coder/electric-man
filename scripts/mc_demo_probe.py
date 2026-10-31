#!/usr/bin/env python3
"""MASTERCITY 1.0.46 device sign-in probe with the App Review demo account (31 Oct 2026).
Runs the real phone flow in a browser: device start -> account page (English) -> 'review account' ->
tusneldax.com review form -> back to the account page -> approve -> app poll returns a session token.
Android and iPhone user agents. Prints only stage names, booleans and visible button texts; never the
username, password, device id, verifier or token. DEMO_USER / DEMO_PASS come from the environment."""
import hashlib, json, os, secrets, sys, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
O = 'https://oyun.tusneldax.com'
UA = {'android': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'ios': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}
TURKISH = ('Onayla ve uygulamaya', 'Test hesabıyla giriş', 'Google ile devam', 'E-posta koduyla', 'Giriş yap')
def post(path, body, token=None, method='POST', ua=None):
    h = {'Origin': O, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': ua or UA['android']}
    if token: h['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(O + path, method=method, data=None if method == 'GET' else json.dumps(body).encode(), headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b'{}')
        except Exception: return e.code, {}
def run(p, platform, out):
    verifier = secrets.token_hex(32); challenge = hashlib.sha256(verifier.encode()).hexdigest()
    st, b = post('/api/auth/device/start', {'challenge': challenge})
    if st != 200: out(f'{platform}: device start {st} {str(b)[:120]}'); return False
    did = b['id']; native = 'a' if platform == 'android' else '3'
    try: browser = p.chromium.launch(channel='chrome')  # Google Chrome preinstalled on GitHub runners
    except Exception: browser = p.chromium.launch()
    ctx = browser.new_context(user_agent=UA[platform], locale='en-US', viewport={'width': 412, 'height': 860}, is_mobile=True, has_touch=True)
    page = ctx.new_page(); dialogs = []
    page.on('dialog', lambda d: (dialogs.append(d.message[:80]), d.dismiss()))
    try:
        page.goto(f"{b['url']}&native={native}", wait_until='domcontentloaded', timeout=60000)
        page.wait_for_selector('#review-login', state='attached', timeout=30000); page.wait_for_timeout(4000)
        rl = page.locator('#review-login'); txt = rl.inner_text().strip()
        tr_left = [w for w in TURKISH if w in page.locator('body').inner_text()]
        out(f'{platform}: account page review button="{txt}" turkish_left={tr_left}')
        rl.click(); page.wait_for_url('https://tusneldax.com/**', timeout=30000); page.wait_for_selector('#review summary', timeout=30000)
        page.locator('#review summary').click(); page.fill('#reviewUser', os.environ['DEMO_USER']); page.fill('#reviewPass', os.environ['DEMO_PASS'])
        if os.environ.get('PROBE_DRY'): out(f'{platform}: dry run stops at the review form'); return True
        page.click('#reviewSubmit')
        for _ in range(60):
            if page.url.startswith(O + '/hesap.html'): break
            c = page.locator('#continue')
            if c.count() and c.is_visible() and c.is_enabled(): c.click()
            page.wait_for_timeout(1000)
        if not page.url.startswith(O + '/hesap.html'): out(f'{platform}: did not return to account page ({page.url.split("?")[0]})'); return False
        page.wait_for_selector('#approve', state='visible', timeout=30000)
        out(f'{platform}: back on account page, approve button="{page.locator("#approve").inner_text().strip()}"')
        try: page.click('#approve', timeout=10000)
        except Exception as e: out(f'{platform}: approve click note {type(e).__name__}')
        token = None
        for _ in range(30):
            st, r = post('/api/auth/device/poll', {'id': did, 'verifier': verifier})
            if r.get('token'): token = r['token']; break
            time.sleep(1)
        if not token: out(f'{platform}: no token after approve (last {st})'); return False
        st, s = post('/api/session', {}, token, 'GET')
        ok = st == 200 and s.get('authenticated') is True
        out(f'{platform}: app session authenticated={ok} dialogs={dialogs}')
        post('/api/auth/logout', {}, token)  # ends only this probe session; no player data changes
        return ok
    finally:
        browser.close()
def main(out=print):
    res = {}
    with sync_playwright() as p:
        for platform in ('android', 'ios'):
            try: res[platform] = run(p, platform, out)
            except Exception as e: out(f'{platform}: error {type(e).__name__}: {str(e).splitlines()[0][:160]}'); res[platform] = False
    out('DEMO PROBE ' + json.dumps(res))
    return all(res.values())
if __name__ == '__main__':
    sys.exit(0 if main() else 1)
