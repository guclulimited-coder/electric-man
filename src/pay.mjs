/* Web coin purchases through iyzico Checkout Form (the apps keep using App Store / Google Play billing).
   Flow: /pay/start creates a pending order and an iyzico payment page → iyzico POSTs the token to
   /pay/callback → we retrieve the result from iyzico ourselves and mark the order paid → the game
   calls /pay/claim, which atomically flips paid orders to claimed and returns the coins to add.
   Prices live here, never in the request. Disabled until IYZICO_API_KEY / IYZICO_SECRET_KEY are set. */
const payEnc = new TextEncoder();
const payHex = a => Array.from(new Uint8Array(a), v => v.toString(16).padStart(2, '0')).join('');

export const PACKS = {
  eh: {eh_coins_500: [500, '99.99'], eh_coins_1200: [1200, '149.99'], eh_coins_3000: [3000, '249.99'], eh_coins_7000: [7000, '499.99'], eh_coins_15000: [15000, '999.99']},
  em: {em_coins_500: [500, '99.99'], em_coins_1200: [1200, '149.99'], em_coins_3000: [3000, '249.99'], em_coins_7000: [7000, '499.99'], em_coins_15000: [15000, '999.99']},
};
export const PAY_SCHEMA = [
  "CREATE TABLE IF NOT EXISTS em_orders(id TEXT PRIMARY KEY, player TEXT NOT NULL, game TEXT NOT NULL, pack TEXT NOT NULL, coins INTEGER NOT NULL, price TEXT NOT NULL, status TEXT NOT NULL, back TEXT NOT NULL, payment TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)",
  'CREATE INDEX IF NOT EXISTS em_orders_player ON em_orders(player, game, status)',
];
export const payEnabled = env => !!(env.IYZICO_API_KEY && env.IYZICO_SECRET_KEY);
const base = env => env.IYZICO_BASE || (String(env.IYZICO_API_KEY).startsWith('sandbox-') ? 'https://sandbox-api.iyzipay.com' : 'https://api.iyzipay.com');

/* IYZWSv2: HMAC-SHA256(secret, randomKey + uriPath + body) in hex, wrapped as base64("apiKey:..&randomKey:..&signature:..") — as in iyzipay-node */
export async function iyziAuth(apiKey, secret, uri, bodyText, rnd){
  const key = await crypto.subtle.importKey('raw', payEnc.encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = payHex(await crypto.subtle.sign('HMAC', key, payEnc.encode(rnd + uri + bodyText)));
  return 'IYZWSv2 ' + btoa(`apiKey:${apiKey}&randomKey:${rnd}&signature:${sig}`);
}
async function iyzi(env, uri, body, fetcher){
  const text = JSON.stringify(body), rnd = Date.now() + Math.random().toString(36).slice(2, 10);
  const r = await fetcher(base(env) + uri, {method: 'POST', body: text, signal: AbortSignal.timeout(15000), headers: {
    'Content-Type': 'application/json', Accept: 'application/json', 'x-iyzi-rnd': rnd, Authorization: await iyziAuth(env.IYZICO_API_KEY, env.IYZICO_SECRET_KEY, uri, text, rnd)}});
  const j = await r.json().catch(() => ({}));
  return j;
}

export async function payStart({db, env, me, body, origin, ip, fetcher}){
  const game = body.game === 'em' ? 'em' : body.game === 'eh' ? 'eh' : null; if (!game) throw Object.assign(new Error('INVALID_PACK'), {status: 400});
  const p = PACKS[game][body.pack]; if (!p) throw Object.assign(new Error('INVALID_PACK'), {status: 400});
  const back = body.back === '/hunter/' ? '/hunter/' : '/';
  const id = payHex(crypto.getRandomValues(new Uint8Array(16))), now = Date.now();
  await db.prepare('INSERT INTO em_orders(id,player,game,pack,coins,price,status,back,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id, me.id, game, body.pack, p[0], p[1], 'pending', origin + back, now, now).run();
  const name = (me.name || 'Oyuncu').slice(0, 40), addr = {contactName: name, city: 'Istanbul', country: 'Turkey', address: 'Dijital ürün (teslimat yok)'};
  const r = await iyzi(env, '/payment/iyzipos/checkoutform/initialize/auth/ecom', {
    locale: body.lang === 'tr' ? 'tr' : 'en', conversationId: id, price: p[1], basketId: id, paymentGroup: 'PRODUCT',
    buyer: {id: me.code, name, surname: 'Oyuncu', identityNumber: '11111111111', email: me.code.toLowerCase() + '@oyuncu.tusneldax.com',
      registrationAddress: addr.address, city: addr.city, country: addr.country, ip},
    billingAddress: addr,
    basketItems: [{id: body.pack, name: `${p[0]} ${game === 'eh' ? 'Electric Hunter' : 'Electric Man'} jetonu`, category1: 'Oyun', itemType: 'VIRTUAL', price: p[1]}],
    callbackUrl: `${origin}/api/em/pay/callback?o=${id}`, currency: 'TRY', paidPrice: p[1], enabledInstallments: [1],
  }, fetcher);
  if (r.status !== 'success' || !r.paymentPageUrl){
    console.error('iyzico-init', r.errorCode, r.errorMessage);
    await db.prepare("UPDATE em_orders SET status='failed', updated=? WHERE id=?").bind(Date.now(), id).run();
    throw Object.assign(new Error('PAY_UNAVAILABLE'), {status: 503});
  }
  return {url: r.paymentPageUrl};
}

/* iyzico posts application/x-www-form-urlencoded {token} here (cross-site, so it sits before the origin check) */
export async function payCallback({db, env, req, url, fetcher}){
  const id = url.searchParams.get('o') || '';
  const order = /^[a-f0-9]{32}$/.test(id) ? await db.prepare('SELECT * FROM em_orders WHERE id=?').bind(id).first() : null;
  if (!order) return new Response('order not found', {status: 404});
  const go = ok => Response.redirect(order.back + '?pay=' + ok, 303);
  if (order.status !== 'pending') return go(order.status === 'failed' ? 'fail' : 'ok');
  let token = '';
  try { token = String((await req.formData()).get('token') || ''); } catch {}
  if (!/^[A-Za-z0-9-]{8,200}$/.test(token)) return go('fail');
  const r = await iyzi(env, '/payment/iyzipos/checkoutform/auth/ecom/detail', {locale: 'tr', conversationId: id, token}, fetcher);
  const ok = r.status === 'success' && r.paymentStatus === 'SUCCESS' && r.basketId === id && r.currency === 'TRY' && Number(r.paidPrice) >= Number(order.price) - 0.001;
  if (!ok){
    console.error('iyzico-result', id, r.paymentStatus, r.errorCode);
    await db.prepare("UPDATE em_orders SET status='failed', updated=? WHERE id=? AND status='pending'").bind(Date.now(), id).run();
    return go('fail');
  }
  await db.prepare("UPDATE em_orders SET status='paid', payment=?, updated=? WHERE id=? AND status='pending'").bind(String(r.paymentId || ''), Date.now(), id).run();
  return go('ok');
}

export async function payClaim({db, me, body}){
  const game = body.game === 'em' ? 'em' : 'eh';
  const got = (await db.prepare("UPDATE em_orders SET status='claimed', updated=? WHERE player=? AND game=? AND status='paid' RETURNING coins").bind(Date.now(), me.id, game).all()).results || [];
  return {coins: got.reduce((s, x) => s + x.coins, 0)};
}
