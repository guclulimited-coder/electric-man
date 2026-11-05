// 6 Kasım 2026 sahip: "insanlar oyunları indirdikten sonra neden oynayamıyor, nerede takılıyor — sayaç kuralım".
// Electric Man (g=em) ve Electric Hunter (g=eh) için aynı açılış hunisi; MASTERCITY'deki 652 hunisiyle aynı ilke:
// yalnız GÜNLÜK SAYAÇ (gün + oyun + aşama + ayrıntı + platform + sürüm + ülke + yeni/eski kurulum). Kimlik, hesap, IP, ad,
// e-posta hiçbir satırda yok; istemci kimlik göndermez, aynı gün aynı aşamayı bir kez göndermeyi cihazda kendisi ayıklar.
// Süreler yalnız kova sayacıdır. Okuma yalnız FUNNEL_KEY_SHA256 ile eşleşen anahtarla (yoksa 404).
export const GAMES = ['em', 'eh'];
// app_open: uygulama/sayfa açıldı · first_paint: ilk görüntü · play_ready: oynanabilir ekran (menü/oyun hazır)
// level_start / level_done: bölüm başladı / bitti (ayrıntı: bölüm kovası 1,2,3,4-5,6-10,11-20,21+)
// d1_return: kurulumdan sonraki gün açtı · d7_return: 2-7. gün açtı · boot_error: açılışta hata · stall: 20 sn'de oynanabilir olmadı
export const STAGES = ['app_open', 'first_paint', 'play_ready', 'level_start', 'level_done', 'level_fail', 'd1_return', 'd7_return', 'boot_error', 'stall', 'signin_tap', 'signin_success'];
export const TIMING = ['first_paint', 'play_ready'];
export const BUCKETS = [500, 1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000, 20000, 30000, 45000, 60000, 90000, 120000];
const KEEP_DAYS = 120;
const clean = (v, re, fb) => { const s = String(v ?? ''); return re.test(s) ? s : fb; };
export const cleanVersion = v => clean(v, /^[0-9A-Za-z][0-9A-Za-z.\-]{0,23}$/, 'unknown');
export const cleanDetail = v => clean(v, /^[a-z0-9_\-]{0,24}$/, '');
export const dayOf = now => new Date(now).toISOString().slice(0, 10);
export function bucketOf(ms){ const v = Math.max(0, Number(ms) || 0); for (const b of BUCKETS) if (v <= b) return b; return 999999; }
export function levelBucket(n){ n = Math.floor(Number(n) || 0); if (n <= 0) return ''; if (n <= 3) return 'l' + n; if (n <= 5) return 'l4-5'; if (n <= 10) return 'l6-10'; if (n <= 20) return 'l11-20'; return 'l21p'; }
export function countryOf(req){
  const c = String(req.cf?.country || req.headers.get('cf-ipcountry') || '').toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : 'XX';
}
export function platformOf(req, hint){
  const h = String(hint || '');
  if (h === 'android' || h === 'ios') return h + '-app';
  const ua = String(req.headers.get('user-agent') || '');
  if (/\bDalvik\//.test(ua)) return 'android-app';
  if (!/Mozilla\//.test(ua) && /CFNetwork|Darwin\//.test(ua)) return 'ios-app';
  if (/Mozilla\//.test(ua)) return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? 'web-mobile' : 'web-desktop';
  return 'other';
}
let ready = null;
export function ensureFunnelSchema(db){
  if (ready) return ready;
  ready = (async () => {
    await db.prepare('CREATE TABLE IF NOT EXISTS em_funnel (day TEXT NOT NULL, game TEXT NOT NULL, stage TEXT NOT NULL, detail TEXT NOT NULL, platform TEXT NOT NULL, version TEXT NOT NULL, country TEXT NOT NULL, cohort TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day,game,stage,detail,platform,version,country,cohort))').run();
    await db.prepare('CREATE TABLE IF NOT EXISTS em_funnel_timing (day TEXT NOT NULL, game TEXT NOT NULL, metric TEXT NOT NULL, platform TEXT NOT NULL, cohort TEXT NOT NULL, bucket INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day,game,metric,platform,cohort,bucket))').run();
  })().catch(e => { ready = null; throw e; });
  return ready;
}
export function resetFunnelForTests(){ ready = null; }
const countSQL = 'INSERT INTO em_funnel (day,game,stage,detail,platform,version,country,cohort,n) VALUES (?,?,?,?,?,?,?,?,1) ON CONFLICT(day,game,stage,detail,platform,version,country,cohort) DO UPDATE SET n=n+1';
const timeSQL = 'INSERT INTO em_funnel_timing (day,game,metric,platform,cohort,bucket,n) VALUES (?,?,?,?,?,?,1) ON CONFLICT(day,game,metric,platform,cohort,bucket) DO UPDATE SET n=n+1';

/** POST /funnel {g:'em'|'eh', v, p, c:'new'|'old', e:[{s, d, ms}]} — en çok 12 olay; bilinmeyen alanlar yok sayılır. */
export async function funnelEvent(req, db, input, now = Date.now()){
  const game = GAMES.includes(input?.g) ? input.g : null;
  const events = Array.isArray(input?.e) ? input.e.slice(0, 12) : [];
  if (!game || !events.length) return null;
  await ensureFunnelSchema(db);
  const day = dayOf(now), platform = platformOf(req, input.p), country = countryOf(req), version = cleanVersion(input.v), cohort = input.c === 'new' ? 'new' : 'old';
  const st = [], seen = new Set();
  for (const e of events){
    const stage = String(e?.s || ''); if (!STAGES.includes(stage)) continue;
    const detail = cleanDetail(e.d), key = stage + '|' + detail; if (seen.has(key)) continue; seen.add(key);
    st.push(db.prepare(countSQL).bind(day, game, stage, detail, platform, version, country, cohort));
    if (TIMING.includes(stage) && Number.isFinite(Number(e.ms)) && Number(e.ms) >= 0 && Number(e.ms) < 36e5)
      st.push(db.prepare(timeSQL).bind(day, game, stage, platform, cohort, bucketOf(e.ms)));
  }
  if (!st.length) return null;
  await db.batch(st);
  if (Math.random() < 0.01){ const cut = dayOf(now - KEEP_DAYS * 864e5); await db.batch([db.prepare('DELETE FROM em_funnel WHERE day<?').bind(cut), db.prepare('DELETE FROM em_funnel_timing WHERE day<?').bind(cut)]).catch(() => {}); }
  return st.length;
}
export function percentile(rows, p){
  const s = [...rows].sort((a, b) => a.bucket - b.bucket), total = s.reduce((t, r) => t + Number(r.n), 0);
  if (!total) return null; const want = Math.ceil(total * p); let run = 0;
  for (const r of s){ run += Number(r.n); if (run >= want) return Number(r.bucket); }
  return Number(s.at(-1).bucket);
}
async function sha256hex(s){ const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function keyOk(env, got){
  const want = String(env.FUNNEL_KEY_SHA256 || '').toLowerCase(); got = String(got || '');
  if (!/^[a-f0-9]{64}$/.test(want) || got.length < 32) return false;
  const h = await sha256hex('em-funnel:' + got); let diff = 0; for (let i = 0; i < 64; i++) diff |= h.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
/** GET /admin/funnel?days=14 — gün → oyun → aşama/platform/ülke/sürüm/kova sayaçları. */
export async function funnelStats(db, url, now = Date.now()){
  await ensureFunnelSchema(db);
  const days = Math.max(1, Math.min(60, Number(url.searchParams.get('days')) || 14)), from = dayOf(now - (days - 1) * 864e5);
  const counts = await db.prepare('SELECT day,game,stage,detail,platform,version,country,cohort,n FROM em_funnel WHERE day>=? ORDER BY day').bind(from).all();
  const times = await db.prepare('SELECT day,game,metric,platform,cohort,bucket,n FROM em_funnel_timing WHERE day>=?').bind(from).all();
  const out = {}, add = (o, k, n) => { o[k] = (o[k] || 0) + n; };
  const at = (day, g) => ((out[day] ??= {})[g] ??= {stages: {}, newInstalls: {}, byPlatform: {}, details: {}, countries: {}, versions: {}, timing: {}});
  for (const r of counts.results || []){
    const d = at(r.day, r.game), n = Number(r.n);
    add(d.stages, r.stage, n); add(d.byPlatform[r.platform] ??= {}, r.stage, n);
    if (r.cohort === 'new') add(d.newInstalls, r.stage, n);
    if (r.detail) add(d.details[r.stage] ??= {}, r.detail, n);
    if (r.stage === 'app_open'){ add(d.countries, r.country, n); add(d.versions, r.platform + ' ' + r.version, n); }
  }
  const groups = {};
  for (const r of times.results || []) (groups[r.day + '|' + r.game + '|' + r.metric] ??= []).push(r);
  for (const [k, rows] of Object.entries(groups)){ const [day, g, m] = k.split('|'); at(day, g).timing[m] = {n: rows.reduce((s, r) => s + Number(r.n), 0), p50: percentile(rows, .5), p90: percentile(rows, .9)}; }
  return {at: new Date(now).toISOString(), days: out};
}
