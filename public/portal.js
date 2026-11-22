/* Tarayıcı oyun siteleri (şimdilik CrazyGames) için ince katman — 22 Kasım 2026.
   Yalnız "portal paketi"nde çalışır: scripts/bundle-portal.mjs, index.html'e window.TSNX_PORTAL='crazygames' ve site SDK'sını ekler.
   Normal internet sürümünde ve telefon uygulamalarında hiçbir şey yapmaz.
   Kullanım: await Portal.init(); Portal.show('interstitial'|'rewarded') -> {shown, earned, dismissed}; Portal.play(true|false) */
(function(){
  const name = window.TSNX_PORTAL || '';
  let sdk = null, ready = false, playing = false;
  const P = {
    name, get on(){ return !!name; }, get ready(){ return ready; },
    onPause: null, onResume: null,
    async init(){
      if (name !== 'crazygames' || !window.CrazyGames || !window.CrazyGames.SDK) return;
      try { await window.CrazyGames.SDK.init(); sdk = window.CrazyGames.SDK; ready = sdk.environment !== 'disabled'; } catch (e) { ready = false; }
    },
    loading(on){ if (!ready) return; try { on ? sdk.game.loadingStart() : sdk.game.loadingStop(); } catch (e) {} },
    play(on){ if (!ready || playing === on) return; playing = on; try { on ? sdk.game.gameplayStart() : sdk.game.gameplayStop(); } catch (e) {} },
    show(kind){
      if (!ready || (kind !== 'interstitial' && kind !== 'rewarded')) return Promise.resolve({shown: false});
      return new Promise(done => {
        let started = false, settled = false;
        const end = r => { if (settled) return; settled = true; try { P.onResume && P.onResume(); } catch (e) {} done(r); };
        try {
          sdk.ad.requestAd(kind === 'rewarded' ? 'rewarded' : 'midgame', {
            adStarted(){ started = true; try { P.onPause && P.onPause(); } catch (e) {} },
            adFinished(){ end({shown: true, earned: kind === 'rewarded', dismissed: true}); },
            adError(){ end({shown: started, earned: false, dismissed: started}); }
          });
        } catch (e) { end({shown: false}); }
      });
    }
  };
  window.Portal = P;
})();
