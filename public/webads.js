/* TUSNELDAX internet reklamları — Google AdSense oyun reklamları (bölüm arası ve ödüllü).
   20 Kasım 2026. Varsayılan KAPALI: aynı klasördeki webads.json {"on": true} olunca açılır (askı kalkıp site onaylanınca).
   Telefon uygulamalarında hiç çalışmaz (onlar AdMob kullanır).
   Test modu: adrese ?reklamtest=1 eklenince o tarayıcıda yalnız Google'ın deneme reklamı çıkar (ekip bilgisayarları için);
   ?reklamtest=0 kapatır. Kullanım: WebAds.init({base, app}); await WebAds.show('interstitial' | 'rewarded') -> {shown, earned, dismissed} */
(function(){
  const PUB = 'ca-pub-9761452561911202';
  let test = false, on = false, loaded = false, busy = false;
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('reklamtest')) localStorage.setItem('tsnxAdTest', q.get('reklamtest') === '0' ? '0' : '1');
    test = localStorage.getItem('tsnxAdTest') === '1';
  } catch (e) {}
  const W = {
    get on(){ return on && loaded; },
    test,
    onPause: null, onResume: null,
    async init(opt = {}){
      if (opt.app || loaded) return;
      try {
        const r = await fetch((opt.base || '') + 'webads.json', {cache: 'no-store'});
        on = !!(r.ok && (await r.json()).on);
      } catch (e) { on = false; }
      if (!on) return;
      window.adsbygoogle = window.adsbygoogle || [];
      window.adBreak = window.adConfig = o => window.adsbygoogle.push(o);
      const s = document.createElement('script');
      s.async = true; s.crossOrigin = 'anonymous';
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + PUB;
      s.setAttribute('data-ad-client', PUB);
      s.setAttribute('data-ad-frequency-hint', '90s');
      if (test) s.setAttribute('data-adbreak-test', 'on');
      s.onload = () => { loaded = true; window.adConfig({preloadAdBreaks: 'on', sound: 'on'}); };
      document.head.appendChild(s);
    },
    show(kind){
      if (!W.on || busy || (kind !== 'interstitial' && kind !== 'rewarded')) return Promise.resolve({shown: false});
      busy = true;
      return new Promise(done => {
        let shown = false, earned = false, finished = false;
        const end = extra => { if (finished) return; finished = true; busy = false; clearTimeout(guard); done({shown, earned, dismissed: shown && !earned, ...extra}); };
        const guard = setTimeout(() => end({}), kind === 'rewarded' ? 90000 : 30000);
        const o = {
          name: kind,
          beforeAd(){ shown = true; try { W.onPause && W.onPause(); } catch (e) {} },
          afterAd(){ try { W.onResume && W.onResume(); } catch (e) {} },
          adBreakDone(){ end({}); }
        };
        if (kind === 'rewarded'){
          o.type = 'reward';
          o.beforeReward = showAdFn => showAdFn();
          o.adViewed = () => { earned = true; };
          o.adDismissed = () => {};
        } else o.type = 'next';
        try { window.adBreak(o); } catch (e) { end({error: e.message}); }
      });
    }
  };
  window.WebAds = W;
})();
