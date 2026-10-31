#!/usr/bin/env python3
"""Native-app sign-in screens of Electric Man and Electric Hunter, in a real browser (Playwright, Chromium).
The app shell (window.EMNative) and the game API are simulated; nothing touches the live site.

  python3 tests/native-signin.playwright.py          (serves public/ on a local port)
  THREE_DIR=dir1:dir2 ...                            (optional: serve three.js from local copies instead of the CDN)

Checks, for Android and iPhone user agents, in English and Bengali (device language, no saved choice):
  * first launch shows the sign-in screen with the sign-in methods in the device language, nothing in Turkish,
    and no other window (Electric Man: character select) on top of it;
  * tapping a method asks the app to sign in with exactly that method (no question in between);
  * once the app reports success the game opens directly (Electric Man: board, then character select;
    Electric Hunter: the portal starts); a sign-in finished in the background (app hook) does the same;
  * a sign-in left over from a closed app is finished at start-up (loginCheck);
  * the browser sign-in page (app-login) opens with only the chosen method, in the device language, and mints
    the claim ticket right after sign-in.
"""
import functools, http.server, json, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent / 'public'
UA = {'android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
      'ios': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'}
TURKISH = ['Giriş', 'giriş', 'Tarayıcı', 'Vazgeç', 'devam et', 'Hesab', 'Telefon']
fails, passes = [], 0

def check(cond, what):
    global passes
    if cond: passes += 1
    else: fails.append(what); print('FAIL', what, flush=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}'

# simulated app shell: answers the bridge like the Android/iOS code does
SHELL = r"""
(() => {
  const S = window.__shell = {calls: [], signed: false, pendingAtStart: %(pending)s, loginDelay: 300};
  const player = {name: 'Rahim', code: 'EM77AB12'};
  const api = (path, method, body) => {
    const q = path.split('?')[0];
    if (q === '/config') return {googleClientId: 'g', appleClientId: 'a', email: true, review: true, maxLevel: 300};
    if (q === '/me') return {player: S.signed ? player : null};
    if (!S.signed) return {status: 401, body: {error: 'LOGIN_REQUIRED'}};
    if (q === '/progress' || q === '/eh/progress') return method === 'POST' ? {revision: 1} : {save: null, revision: 0};
    if (q === '/badges') return {requests: 0, unread: 0};
    return {};
  };
  window.EMNative = Object.freeze({platform: '%(platform)s', call: o => new Promise((res, rej) => {
    S.calls.push(o.action === 'api' ? o.action + ' ' + o.path : o.action + (o.method !== undefined ? ':' + o.method : ''));
    if (o.action === 'api'){ const r = api(o.path, o.method, o.body); return res(r && r.status ? r : {status: 200, body: r}); }
    if (o.action === 'loginCheck'){ if (S.pendingAtStart){ S.pendingAtStart = false; S.signed = true; return res({ok: true}); } return res({pending: false}); }
    if (o.action === 'login'){ S.loginLang = o.lang; return setTimeout(() => { S.signed = true; res({ok: true}); }, S.loginDelay); }
    if (o.action === 'persist') return res({ok: true});
    if (o.action === 'ad') return res({shown: false});
    if (o.action === 'products' || o.action === 'pending') return res([]);
    rej(new Error('INVALID_ACTION'));
  })});
})();
"""

THREE = [Path(d) for d in os.environ.get('THREE_DIR', '').split(':') if d]
def offline(ctx):
    # fonts, analytics and Google's script are not needed here; three.js from local copies when given
    ctx.route(lambda u: any(h in u for h in ('fonts.googleapis', 'fonts.gstatic', 'cloudflareinsights', 'accounts.google.com', 'googletagmanager')), lambda r: r.abort())
    if THREE:
        def three(route):
            rel = route.request.url.split('three@0.170.0/', 1)[1]
            for d in THREE:
                if (d / rel).is_file(): return route.fulfill(body=(d / rel).read_bytes(), content_type='text/javascript')
            route.abort()
        ctx.route('https://cdn.jsdelivr.net/npm/three@0.170.0/**', three)

def page_for(browser, platform, locale, pending=False):
    ctx = browser.new_context(user_agent=UA[platform], locale=locale, viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    offline(ctx)
    ctx.add_init_script(SHELL % {'platform': platform, 'pending': 'true' if pending else 'false'})
    return ctx, ctx.new_page()

def visible_text(page, sel):
    return page.eval_on_selector(sel, 'e => e.innerText')

def em(browser, platform, locale):
    tag = f'EM {platform} {locale}'
    lang = locale.split('-')[0]
    words = json.loads((ROOT / 'i18n' / f'{lang}.json').read_text())
    ctx, page = page_for(browser, platform, locale)
    page.goto(BASE + '/index.html'); page.wait_for_timeout(3500)
    check(page.is_visible('#sheet') and page.eval_on_selector('#sheet', 'e => e.classList.contains("gate")'), f'{tag}: sign-in screen at first launch')
    check(page.is_hidden('#modal'), f'{tag}: no character select on top of the sign-in screen')
    txt = visible_text(page, '#sheetBody')
    for k in ('google', 'apple', 'emailLogin', 'reviewLogin', 'gateNeed'):
        check(words[k] in txt, f'{tag}: shows "{words[k]}"')
    if lang != 'tr': check(not any(w in txt for w in TURKISH), f'{tag}: no Turkish text on the sign-in screen: {txt[:200]!r}')
    page.click('[data-login="google"]'); page.wait_for_timeout(1800)
    calls = page.evaluate('__shell.calls')
    check('login:google' in calls, f'{tag}: Google tap asks the app for Google sign-in directly ({calls})')
    check(page.evaluate('__shell.loginLang') == lang, f'{tag}: sign-in page language = device language')
    check(page.is_hidden('#sheet'), f'{tag}: back in the game after sign-in')
    check(page.is_visible('#modal') and words['genderTitle'] in visible_text(page, '#modal'), f'{tag}: character select only after sign-in')
    ctx.close()
    # background completion (app hook) and a sign-in left over from a killed app
    ctx, page = page_for(browser, platform, locale)
    page.goto(BASE + '/index.html'); page.wait_for_timeout(3000)
    page.evaluate('__shell.signed = true; window.__emLoginDone()'); page.wait_for_timeout(1200)
    check(page.is_hidden('#sheet'), f'{tag}: background sign-in (app hook) opens the game')
    ctx.close()
    ctx, page = page_for(browser, platform, locale, pending=True)
    page.goto(BASE + '/index.html'); page.wait_for_timeout(3500)
    check('loginCheck' in page.evaluate('__shell.calls') and page.is_hidden('#sheet'), f'{tag}: unfinished sign-in completed at start-up')
    ctx.close()

def eh(browser, platform, locale):
    tag = f'EH {platform} {locale}'
    lang = locale.split('-')[0]
    words = json.loads((ROOT / 'hunter' / 'i18n' / f'{lang}.json').read_text())
    ctx, page = page_for(browser, platform, locale)
    page.goto(BASE + '/hunter/index.html'); page.wait_for_timeout(4000)
    check(page.is_visible('#gateBox') and page.is_hidden('#startBtn'), f'{tag}: sign-in on the title screen, portal button hidden')
    txt = visible_text(page, '#gateBox')
    for k in ('google', 'apple', 'emailLogin', 'reviewLogin', 'o_gateNeed'):
        check(words[k] in txt, f'{tag}: shows "{words[k]}"')
    if lang != 'tr': check(not any(w in txt for w in TURKISH), f'{tag}: no Turkish text on the sign-in screen: {txt[:200]!r}')
    page.click('[data-login="email"]'); page.wait_for_timeout(2500)
    calls = page.evaluate('__shell.calls')
    check('login:email' in calls, f'{tag}: e-mail tap asks the app for e-mail sign-in directly ({calls})')
    check(page.is_hidden('#gateBox'), f'{tag}: sign-in screen gone after sign-in')
    check(page.is_hidden('#title') or page.evaluate('typeof running !== "undefined" && running') or page.is_visible('#story, .story-screen, canvas'), f'{tag}: game starts after sign-in')
    ctx.close()
    ctx, page = page_for(browser, platform, locale, pending=True)
    page.goto(BASE + '/hunter/index.html'); page.wait_for_timeout(4000)
    check('loginCheck' in page.evaluate('__shell.calls') and page.is_hidden('#gateBox'), f'{tag}: unfinished sign-in completed at start-up')
    ctx.close()

def app_login(browser, platform, locale):
    tag = f'app-login {platform} {locale}'
    lang = locale.split('-')[0]
    words = json.loads((ROOT / 'i18n' / f'{lang}.json').read_text())
    ch, st = 'c' * 64, 'd' * 32
    for method in ('google', 'email', 'review', 'apple', ''):
        ctx = browser.new_context(user_agent=UA[platform], locale=locale, viewport={'width': 390, 'height': 844}, is_mobile=True)
        offline(ctx); page = ctx.new_page(); seen = {'ticket': 0, 'apple': 0, 'handoff': 0}; signed = {'v': False}
        def api(route):
            u = route.request.url.split('/api/em', 1)[1].split('?')[0]
            if u == '/config': return route.fulfill(json={'googleClientId': 'g', 'appleClientId': 'a', 'email': True, 'review': True})
            if u == '/me': return route.fulfill(json={'player': {'name': 'Rahim', 'code': 'EM1'} if signed['v'] else None})
            if u == '/auth/nonce': return route.fulfill(json={'nonce': 'n'})
            if u == '/auth/review': signed['v'] = True; return route.fulfill(json={'ok': True})
            if u == '/native/ticket': seen['ticket'] += 1; return route.fulfill(json={'ticket': 'e' * 64})
            if u == '/auth/apple/start': seen['apple'] += 1; return route.fulfill(body='apple', content_type='text/plain')
            if u == '/native/handoff': seen['handoff'] += 1; return route.fulfill(body='back to app', content_type='text/plain')
            return route.fulfill(json={})
        page.route('**/api/em/**', api)
        q = f'challenge={ch}&state={st}&platform={platform}' + (f'&lang={lang}' if method != '' else '') + (f'&method={method}' if method else '')
        page.goto(BASE + '/app-login.html?' + q); page.wait_for_timeout(1500)
        m = method or 'all'
        if method == 'apple':
            check(seen['apple'] == 1, f'{tag}: Apple chosen in the app opens Apple directly')
        else:
            txt = page.inner_text('main')
            check(words['loginTitle'] in txt, f'{tag} [{m}]: page in the device language')
            if lang != 'tr': check(not any(w in txt for w in TURKISH), f'{tag} [{m}]: no Turkish text: {txt[:160]!r}')
            check(page.is_visible('#gbtn') == (method in ('google', '')), f'{tag} [{m}]: Google button only when chosen')
            check(page.is_visible('#emailGo') == (method in ('email', '')), f'{tag} [{m}]: e-mail only when chosen')
            check(page.is_visible('#applebtn') == (method == ''), f'{tag} [{m}]: Apple button only in the full list')
            check(page.is_visible('#reviewSum'), f'{tag} [{m}]: demo account entry stays reachable (App Review)')
        if method == 'review':
            page.fill('#reviewUser', 'demo'); page.fill('#reviewPass', 'x'); page.click('#reviewGo'); page.wait_for_timeout(2500)
            check(seen['ticket'] >= 1, f'{tag}: claim ticket minted right after sign-in')
            check(seen['handoff'] == 1, f'{tag}: hands back to the app after demo sign-in')
        ctx.close()

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    for platform in ('android', 'ios'):
        for locale in ('en-US', 'bn-BD'):
            em(browser, platform, locale)
            eh(browser, platform, locale)
            app_login(browser, platform, locale)
    browser.close()
srv.shutdown()
print(f'{passes} checks passed, {len(fails)} failed')
sys.exit(1 if fails else 0)
