#!/usr/bin/env python3
"""Read-only download statistics probe (Google Play + App Store Connect).

Only GET requests (plus the Apple Reporter read query). No changes to apps,
listings, tracks, reviews or ads. Writes stats/<LABEL>.json.
"""
import csv, datetime as dt, gzip, io, json, os, re, sys, time
import requests

LABEL = os.environ.get('LABEL', 'run')
OUT = {'label': LABEL, 'generated_utc': dt.datetime.utcnow().isoformat() + 'Z', 'play': {}, 'asc': {}}
PACKAGES = ['com.tusnelda.ustasehri', 'com.tusneldax.busrush',
            'com.tusneldax.electrichunter', 'com.tusneldax.electricman']
NOTES = []


def note(msg):
    msg = msg.replace('\n', ' ')[:900]
    NOTES.append(msg)
    print(msg)


def short(r):
    try:
        return f'{r.status_code} {r.text[:300]}'
    except Exception as e:  # noqa
        return str(e)


# ---------------------------------------------------------------- Google Play
def play():
    raw = os.environ.get('PLAY_SA_JSON', '').strip()
    if not raw:
        OUT['play']['skipped'] = 'no PLAY_SA_JSON'
        return
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    info = json.loads(raw)
    OUT['play']['sa_project'] = info.get('project_id')
    creds = service_account.Credentials.from_service_account_info(info, scopes=[
        'https://www.googleapis.com/auth/androidpublisher',
        'https://www.googleapis.com/auth/devstorage.read_only',
        'https://www.googleapis.com/auth/playdeveloperreporting'])
    creds.refresh(Request())
    H = {'Authorization': f'Bearer {creds.token}'}
    P = OUT['play']

    # app access check (read-only reviews list)
    P['access'] = {}
    for pkg in PACKAGES:
        r = requests.get(f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{pkg}/reviews',
                         headers=H, params={'maxResults': 1}, timeout=30)
        P['access'][pkg] = r.status_code
    # Reporting API: list apps visible
    r = requests.get('https://playdeveloperreporting.googleapis.com/v1beta1/apps:search', headers=H,
                     params={'pageSize': 50}, timeout=30)
    P['reporting_apps'] = r.json().get('apps', short(r)) if r.ok else short(r)
    # developer id candidates
    cands = set(x for x in os.environ.get('PLAY_DEV_IDS', '').split(',') if x)
    for pkg in PACKAGES:
        try:
            t = requests.get(f'https://play.google.com/store/apps/details?id={pkg}&hl=en', timeout=30).text
            for m in re.findall(r'dev\?id=(\d+)', t):
                cands.add(m)
            m = re.search(r'([\d,]+\+?) downloads', t, re.I) or re.search(r'"([\d,]+\+)"', t)
            P.setdefault('public_download_band', {})[pkg] = m.group(1) if m else None
        except Exception as e:
            P.setdefault('public_download_band', {})[pkg] = f'err {e}'
    for path in ['developers/-/users']:
        r = requests.get(f'https://androidpublisher.googleapis.com/androidpublisher/v3/{path}', headers=H, timeout=30)
        P[f'probe_{path}'] = short(r)
        for m in re.findall(r'developers/(\d+)', r.text):
            cands.add(m)
    # buckets in SA project
    if info.get('project_id'):
        r = requests.get('https://storage.googleapis.com/storage/v1/b', headers=H,
                         params={'project': info['project_id']}, timeout=30)
        names = [b['name'] for b in r.json().get('items', [])] if r.ok else short(r)
        P['project_buckets'] = names
        if isinstance(names, list):
            for n in names:
                m = re.match(r'pubsite_prod_(?:rev_)?(\d+)', n)
                if m:
                    cands.add(m.group(1))
    P['dev_id_candidates'] = sorted(cands)
    bucket = None
    P['bucket_probe'] = {}
    for c in sorted(cands):
        for b in (f'pubsite_prod_rev_{c}', f'pubsite_prod_{c}'):
            r = requests.get(f'https://storage.googleapis.com/storage/v1/b/{b}/o', headers=H,
                             params={'prefix': 'stats/installs/', 'maxResults': 1000}, timeout=30)
            P['bucket_probe'][b] = r.status_code if not r.ok else 'OK'
            if r.ok:
                bucket = b
                P['install_files'] = [o['name'] for o in r.json().get('items', [])][-40:]
                break
        if bucket:
            break
    if not bucket:
        note(f'::warning::[{LABEL}] Play: no readable stats bucket. access={P["access"]} cands={P["dev_id_candidates"]} probe={P["bucket_probe"]}')
        return
    P['bucket'] = bucket
    today = dt.date.today()
    months = sorted({(today - dt.timedelta(days=d)).strftime('%Y%m') for d in range(0, 45)})
    P['apps'] = {}
    for pkg in PACKAGES:
        rows = []
        for ym in months:
            obj = f'stats/installs/installs_{pkg}_{ym}_overview.csv'
            r = requests.get(f'https://storage.googleapis.com/storage/v1/b/{bucket}/o/{requests.utils.quote(obj, safe="")}',
                             headers=H, params={'alt': 'media'}, timeout=60)
            if not r.ok:
                continue
            data = r.content
            for enc in ('utf-16', 'utf-8-sig'):
                try:
                    txt = data.decode(enc)
                    if 'Date' in txt:
                        break
                except Exception:
                    pass
            rows += list(csv.DictReader(io.StringIO(txt)))
        if not rows:
            P['apps'][pkg] = 'no overview csv'
            continue
        P['apps'][pkg] = {'columns': list(rows[0].keys()),
                          'daily': [{k: v for k, v in rw.items()} for rw in rows][-14:]}
        last = rows[-7:]
        def col(name):
            return [rw.get(name) for rw in last]
        note(f'::notice::[{LABEL}] Play {pkg} last7 dates={col("Date")} daily_user_installs={col("Daily User Installs")} '
             f'daily_device_installs={col("Daily Device Installs")} install_events={col("Install events")} '
             f'total_user_installs={rows[-1].get("Total User Installs")} active_devices={rows[-1].get("Active Device Installs")}')


# -------------------------------------------------------------- App Store
def asc():
    key = os.environ.get('ASC_KEY_PATH')
    if not key or not os.path.exists(key):
        OUT['asc']['skipped'] = 'no key'
        return
    import jwt
    KID, ISS = os.environ['ASC_KEY_ID'], os.environ['ASC_ISSUER']
    pem = open(key).read()

    def tok():
        now = int(time.time())
        return jwt.encode({'iss': ISS, 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'}, pem,
                          algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'})

    def get(url, params=None, raw=False):
        if not url.startswith('http'):
            url = 'https://api.appstoreconnect.apple.com' + url
        r = requests.get(url, headers={'Authorization': f'Bearer {tok()}'}, params=params, timeout=60)
        return r if raw else (r.json() if r.ok else {'_err': short(r)})

    A = OUT['asc']
    apps = get('/v1/apps', {'limit': 200, 'fields[apps]': 'name,bundleId,sku'})
    if '_err' in apps:
        A['apps_err'] = apps['_err']
        note(f'::warning::[{LABEL}] ASC /v1/apps failed: {apps["_err"][:200]}')
        return
    A['apps'] = {a['id']: {'name': a['attributes']['name'], 'bundleId': a['attributes']['bundleId'],
                           'sku': a['attributes'].get('sku')} for a in apps['data']}
    note(f'::notice::[{LABEL}] ASC apps: ' + '; '.join(f'{k}={v["bundleId"]}' for k, v in A['apps'].items()))

    # --- Sales & Trends (needs vendor number)
    vendors = [v for v in os.environ.get('ASC_VENDORS', '').split(',') if v]
    # Reporter API vendor discovery attempt (read-only query)
    try:
        body = {'accesstoken': tok(), 'version': '2.4', 'mode': 'Robot.XML',
                'queryInput': '[p=Reporter.properties, Sales.getVendors]'}
        r = requests.post('https://reportingitc-reporter.apple.com/reportservice/sales/v1',
                          data={'jsonRequest': json.dumps(body)}, timeout=30)
        A['reporter_getVendors'] = short(r)
        vendors += re.findall(r'<Vendor>(\d+)</Vendor>', r.text)
    except Exception as e:
        A['reporter_getVendors'] = str(e)
    r = get('/v1/salesReports', {'filter[frequency]': 'DAILY', 'filter[reportType]': 'SALES',
                                 'filter[reportSubType]': 'SUMMARY', 'filter[version]': '1_0'}, raw=True)
    A['sales_no_vendor_probe'] = short(r)
    A['vendors'] = vendors
    if vendors:
        sales = {}
        for d in range(1, 16):
            day = (dt.date.today() - dt.timedelta(days=d)).isoformat()
            for v in vendors:
                r = get('/v1/salesReports', {'filter[frequency]': 'DAILY', 'filter[reportType]': 'SALES',
                                             'filter[reportSubType]': 'SUMMARY', 'filter[version]': '1_0',
                                             'filter[vendorNumber]': v, 'filter[reportDate]': day}, raw=True)
                if not r.ok:
                    sales.setdefault('_errors', {})[f'{v}/{day}'] = short(r)[:200]
                    continue
                txt = gzip.decompress(r.content).decode('utf-8')
                for rw in csv.DictReader(io.StringIO(txt), delimiter='\t'):
                    aid = rw.get('Apple Identifier')
                    pt = rw.get('Product Type Identifier', '')
                    kind = 'download' if pt in ('1', '1F', '1T', 'F1') else 'redownload' if pt in ('3', '3F', '3T', 'F3') \
                        else 'update' if pt in ('7', '7F', '7T', 'F7') else f'pt_{pt}'
                    k = sales.setdefault(aid, {}).setdefault(day, {})
                    k[kind] = k.get(kind, 0) + int(float(rw.get('Units') or 0))
        A['sales'] = sales
        for aid, days in sales.items():
            if aid.startswith('_'):
                continue
            seq = sorted(days.items())
            note(f'::notice::[{LABEL}] ASC sales {aid} ' + ' '.join(f'{d[5:]}:{v.get("download",0)}/{v.get("redownload",0)}' for d, v in seq[-8:]))
    else:
        note(f'::warning::[{LABEL}] ASC sales: vendor number unknown. reporter={A["reporter_getVendors"][:150]} probe={A["sales_no_vendor_probe"][:150]}')

    # --- App Analytics (only reads existing report requests)
    A['analytics'] = {}
    for aid, meta in A['apps'].items():
        res = {}
        rq = get(f'/v1/apps/{aid}/analyticsReportRequests', {'limit': 50})
        if '_err' in rq:
            res['err'] = rq['_err']
            A['analytics'][aid] = res
            continue
        res['requests'] = [{'id': x['id'], **x['attributes']} for x in rq.get('data', [])]
        daily = {}
        for req in rq.get('data', []):
            reps = get(f'/v1/analyticsReportRequests/{req["id"]}/reports', {'limit': 200})
            for rep in reps.get('data', []):
                nm = rep['attributes'].get('name', '')
                if nm not in ('App Downloads Standard', 'App Store Downloads Standard'):
                    continue
                inst = get(f'/v1/analyticsReports/{rep["id"]}/instances', {'filter[granularity]': 'DAILY', 'limit': 200})
                insts = sorted(inst.get('data', []), key=lambda x: x['attributes'].get('processingDate', ''))[-20:]
                res.setdefault('instances', []).append([i['attributes'].get('processingDate') for i in insts])
                for i in insts:
                    segs = get(f'/v1/analyticsReportInstances/{i["id"]}/segments', {'limit': 50})
                    for s in segs.get('data', []):
                        url = s['attributes'].get('url')
                        if not url:
                            continue
                        rr = requests.get(url, timeout=120)
                        if not rr.ok:
                            continue
                        try:
                            txt = gzip.decompress(rr.content).decode('utf-8')
                        except Exception:
                            txt = rr.content.decode('utf-8', 'replace')
                        for rw in csv.DictReader(io.StringIO(txt), delimiter='\t'):
                            d = rw.get('Date')
                            typ = rw.get('Download Type', 'all')
                            cnt = int(float(rw.get('Counts') or 0))
                            daily.setdefault(d, {}).setdefault(typ, 0)
                            daily[d][typ] += cnt
        if daily:
            res['daily'] = dict(sorted(daily.items()))
            seq = sorted(daily.items())
            note(f'::notice::[{LABEL}] ASC analytics {meta["bundleId"]} ' + ' '.join(
                f'{d[5:]}:' + ','.join(f'{t[:6]}={c}' for t, c in v.items()) for d, v in seq[-8:]))
        A['analytics'][aid] = res
    note(f'::notice::[{LABEL}] ASC analytics requests: ' + '; '.join(
        f'{A["apps"][k]["bundleId"]}={len(v.get("requests", []))}{"(err)" if "err" in v else ""}' for k, v in A['analytics'].items()))


for fn in (play, asc):
    try:
        fn()
    except Exception as e:
        import traceback
        traceback.print_exc()
        OUT[fn.__name__]['exception'] = repr(e)[:500]
        note(f'::warning::[{LABEL}] {fn.__name__} exception {repr(e)[:300]}')

OUT['notes'] = NOTES
os.makedirs('stats', exist_ok=True)
json.dump(OUT, open(f'stats/{LABEL}.json', 'w'), indent=1, default=str)
