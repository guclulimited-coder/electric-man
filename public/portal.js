/* Tarayıcı oyun siteleri ve Telegram için ince reklam katmanı — 22 Kasım 2026.
   Yalnız "portal paketi"nde çalışır (scripts/bundle-portal.mjs window.TSNX_PORTAL değerini ve sağlayıcı betiğini ekler).
   Desteklenenler: 'crazygames' (CrazyGames SDK v3), 'gamedistribution' (GD SDK; window.TSNX_GD_ID),
   'telegram' (Telegram oyun penceresi + Adsgram; window.TSNX_ADSGRAM_BLOCK).
   Normal internet sürümünde ve telefon uygulamalarında hiçbir şey yapmaz.
   Kullanım: await Portal.init(); Portal.show('interstitial'|'rewarded') -> {shown, earned, dismissed}; Portal.play(true|false) */
(function(){
  const name = window.TSNX_PORTAL || '';
  let sdk = null, ready = false, playing = false, gdReward = false, gdResolve = null;
  const pause = () => { try { P.onPause && P.onPause(); } catch (e) {} };
  const resume = () => { try { P.onResume && P.onResume(); } catch (e) {} };
  const P = {
    name, get on(){ return !!name; }, get ready(){ return ready; },
    onPause: null, onResume: null,
    async init(){
      try {
        if (name === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK){
          await window.CrazyGames.SDK.init(); sdk = window.CrazyGames.SDK; ready = sdk.environment !== 'disabled';
        } else if (name === 'gamedistribution'){
          ready = await new Promise(ok => {
            const t = setTimeout(() => ok(!!window.gdsdk), 8000);
            P._gdReady = () => { clearTimeout(t); ok(true); };
            if (window.gdsdk && window.__gdReady) P._gdReady();
          });
          sdk = window.gdsdk || null; ready = ready && !!sdk;
        } else if (name === 'telegram'){
          const tg = window.Telegram && window.Telegram.WebApp;
          if (tg){ try { tg.ready(); tg.expand(); } catch (e) {} }
          if (window.Adsgram && window.TSNX_ADSGRAM_BLOCK){ sdk = window.Adsgram.init({blockId: String(window.TSNX_ADSGRAM_BLOCK)}); ready = true; }
        }
      } catch (e) { ready = false; }
    },
    // GameDistribution SDK olayları (bundle-portal.mjs GD_OPTIONS.onEvent'i buraya bağlar)
    gdEvent(ev){
      const n = ev && ev.name;
      if (n === 'SDK_READY'){ window.__gdReady = true; P._gdReady && P._gdReady(); }
      else if (n === 'SDK_GAME_PAUSE') pause();
      else if (n === 'SDK_GAME_START'){ resume(); if (gdResolve){ const r = gdResolve; gdResolve = null; r(); } }
      else if (n === 'SDK_REWARDED_WATCH_COMPLETE') gdReward = true;
    },
    loading(on){ if (!ready || name !== 'crazygames') return; try { on ? sdk.game.loadingStart() : sdk.game.loadingStop(); } catch (e) {} },
    play(on){ if (!ready || playing === on) return; playing = on; if (name !== 'crazygames') return; try { on ? sdk.game.gameplayStart() : sdk.game.gameplayStop(); } catch (e) {} },
    show(kind){
      if (!ready || (kind !== 'interstitial' && kind !== 'rewarded')) return Promise.resolve({shown: false});
      const reward = kind === 'rewarded';
      if (name === 'crazygames') return new Promise(done => {
        let started = false, settled = false;
        const end = r => { if (settled) return; settled = true; resume(); done(r); };
        try {
          sdk.ad.requestAd(reward ? 'rewarded' : 'midgame', {
            adStarted(){ started = true; pause(); },
            adFinished(){ end({shown: true, earned: reward, dismissed: true}); },
            adError(){ end({shown: started, earned: false, dismissed: started}); }
          });
        } catch (e) { end({shown: false}); }
      });
      if (name === 'gamedistribution') return new Promise(done => {
        gdReward = false;
        const finish = shown => done({shown, earned: reward && gdReward, dismissed: shown && !(reward && gdReward)});
        const guard = setTimeout(() => { gdResolve = null; finish(false); }, 60000);
        try {
          const p = reward ? sdk.showAd('rewarded') : sdk.showAd();
          gdResolve = () => { clearTimeout(guard); finish(true); };
          if (p && p.then) p.then(() => { if (gdResolve){ gdResolve(); } }).catch(() => { clearTimeout(guard); gdResolve = null; finish(false); });
        } catch (e) { clearTimeout(guard); gdResolve = null; finish(false); }
      });
      if (name === 'telegram') return sdk.show().then(r => ({shown: true, earned: reward && !!(r && r.done), dismissed: !(r && r.done)}))
        .catch(r => ({shown: !!(r && r.state === 'playing'), earned: false, dismissed: true}));
      return Promise.resolve({shown: false});
    }
  };
  window.Portal = P;
})();
