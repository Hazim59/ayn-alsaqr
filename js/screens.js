/* Screens controller: runs before (and independently of) the 3D engine module,
   so the splash, the games hub and any loading error always show. */
(function () {
  var el = function (id) {
    return document.getElementById(id);
  };
  var SH = (window.SH = { scr: 'splash', ready: false, onShow: null, goHome: null, introT: 0 });
  SH.show = function (name) {
    SH.scr = name;
    el('splash').hidden = name !== 'splash';
    el('hub').hidden = name !== 'hub';
    el('intro').hidden = name !== 'intro';
    var pages = ['home', 'camp', 'arsenal', 'mp'];
    el('app').hidden = pages.indexOf(name) < 0;
    pages.forEach(function (p) {
      el(p).hidden = p !== name;
    });
    var stg = el('stage');
    stg.classList.toggle('game', name === 'game');
    stg.hidden = !(name === 'game' || name === 'home' || name === 'camp' || name === 'mp');
    el('btns').hidden = name !== 'game';
    if (name !== 'game') el('pause').hidden = true;
    if (SH.onShow) SH.onShow(name);
    window.scrollTo(0, 0);
  };
  SH.progress = function (p) {
    el('loadFill').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
  };
  SH.fail = function (t) {
    var f = el('failBox');
    f.textContent = t;
    f.hidden = false;
    el('playAyn').disabled = true;
    el('playAyn').style.opacity = '.5';
  };
  var spT = setTimeout(goHub, 3400);
  function goHub() {
    clearTimeout(spT);
    if (SH.scr !== 'splash') return;
    el('splash').classList.add('out');
    setTimeout(function () {
      SH.show('hub');
    }, 450);
  }
  el('splash').addEventListener('pointerdown', goHub);
  function playIntro() {
    SH.show('intro');
    var it = el('intro');
    it.className = 'screen';
    [
      [80, 'open'],
      [800, 'dilate'],
      [1300, 'scope'],
      [2000, 'zoom']
    ].forEach(function (q) {
      setTimeout(function () {
        if (SH.scr === 'intro') it.classList.add(q[1]);
      }, q[0]);
    });
    clearTimeout(SH.introT);
    SH.introT = setTimeout(function () {
      if (SH.scr === 'intro' && SH.goHome) SH.goHome();
    }, 2900);
  }
  el('intro').addEventListener('pointerdown', function () {
    clearTimeout(SH.introT);
    if (SH.goHome) SH.goHome();
  });
  el('playAyn').addEventListener('click', function () {
    if (SH.ready) playIntro();
    else {
      el('failBox').hidden = false;
      el('failBox').textContent = 'اللعبة تتحمّل… ثواني وتجهز.';
    }
  });
  // watchdog: if the engine never arrives (no connection, old browser), say so instead of hanging
  setTimeout(function () {
    if (!SH.ready)
      SH.fail(
        'ما قدرت أحمّل محرك الرسم. تأكد من الاتصال بالإنترنت وأعد فتح الصفحة. وإذا تكررت، افتحها من متصفح حديث.'
      );
  }, 20000);
  window.addEventListener('error', function (e) {
    if (!SH.ready && e && e.message)
      SH.fail('صار خطأ أثناء تحميل اللعبة: ' + String(e.message).slice(0, 120));
  });
})();
