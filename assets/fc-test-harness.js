/**
 * FC Test Harness
 * -----------------------------------------------------------------------------
 * Loaded in <head> on EVERY page, BEFORE the GTM container snippet.
 *
 * This file contains NO Fintel tracking code. The Fintel scripts live in GTM
 * Custom HTML tags — that is the whole point of the POC. This file only:
 *
 *   1. Creates window.dataLayer so pages can push events for GTM to trigger on.
 *   2. Generates + persists a random order ID for the application flow.
 *   3. Instruments the page so we can SEE what the GTM-injected scripts did:
 *      network calls to fintelconnect.com, cookies written, script tags added.
 *   4. Collects the automation/bot signals a detection script would look at.
 *   5. Renders the on-page debug drawer.
 *
 * Instrumentation is installed before GTM loads so nothing is missed.
 */
(function (window, document) {
  'use strict';

  window.dataLayer = window.dataLayer || [];

  var STORAGE_KEY = 'fc_test_order_id';
  var PID_KEY = 'fc_test_pid';
  var PID_SRC_KEY = 'fc_test_pid_src';   // 'ad' | 'funnel'
  var LOG_KEY = 'fc_test_netlog';
  var WATCH = /fintelconnect\.com/i;

  var FCTest = {
    netLog: [],
    scriptLog: []
  };

  // ---------------------------------------------------------------------------
  // 1. Order ID generation
  // ---------------------------------------------------------------------------

  /**
   * Random order ID, e.g. "FC-1754390122431-K3P9XQ".
   * Timestamp prefix keeps IDs sortable and collision-free across testers;
   * the random suffix stops two tabs in the same millisecond from colliding.
   */
  FCTest.generateOrderId = function () {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — avoids misreads
    var suffix = '';
    for (var i = 0; i < 6; i++) {
      suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return 'FC-' + Date.now() + '-' + suffix;
  };

  /** Order ID for the current application, created once and reused. */
  FCTest.getOrderId = function () {
    var id = null;
    try { id = window.sessionStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (!id) {
      id = FCTest.generateOrderId();
      try { window.sessionStorage.setItem(STORAGE_KEY, id); } catch (e) {}
    }
    return id;
  };

  /** Force a brand new order ID — used by the "Reset test" button. */
  FCTest.newOrderId = function () {
    var id = FCTest.generateOrderId();
    try { window.sessionStorage.setItem(STORAGE_KEY, id); } catch (e) {}
    return id;
  };

  FCTest.clearOrderId = function () {
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  };

  // ---------------------------------------------------------------------------
  // 1b. Product ID (pid)
  // ---------------------------------------------------------------------------

  /**
   * The pid reported by the conversion pixel is whatever product the Fintel ad
   * points at, so nothing about it is fixed here. Resolution order:
   *
   *   1. `mproduct` on the landing URL — the platform's own product parameter.
   *      Captured once and persisted, because it only appears on the first hop.
   *   2. `pid` on the current URL — a product chosen inside the funnel.
   *   3. Whatever was stored earlier this session.
   *   4. Empty. The pixel tag does not invent one.
   *
   * The only value fixed anywhere in this harness is the program ID, 24490.
   */
  FCTest.resolvePid = function () {
    var qs = new URLSearchParams(location.search);

    var fromAd = qs.get('mproduct');
    if (fromAd) return FCTest.setPid(fromAd, 'ad');

    // An ad-sourced product is sticky for the rest of the session. Without this,
    // an in-funnel link like apply.html?pid=Rewards would silently replace the
    // product the ad actually pointed at.
    if (FCTest.pidSource() === 'ad') return FCTest.getPid();

    var fromUrl = qs.get('pid');
    if (fromUrl) return FCTest.setPid(fromUrl, 'funnel');

    return FCTest.getPid();
  };

  FCTest.getPid = function () {
    try { return window.sessionStorage.getItem(PID_KEY) || ''; }
    catch (e) { return ''; }
  };

  FCTest.pidSource = function () {
    try { return window.sessionStorage.getItem(PID_SRC_KEY) || ''; }
    catch (e) { return ''; }
  };

  FCTest.setPid = function (v, src) {
    try {
      window.sessionStorage.setItem(PID_KEY, v);
      if (src) window.sessionStorage.setItem(PID_SRC_KEY, src);
    } catch (e) {}
    return v;
  };

  /** True when the current pid came from the Fintel ad, not a funnel selection. */
  FCTest.pidFromAd = function () {
    return FCTest.pidSource() === 'ad';
  };

  // ---------------------------------------------------------------------------
  // 2. dataLayer helper
  // ---------------------------------------------------------------------------

  FCTest.push = function (eventName, payload) {
    var obj = { event: eventName };
    for (var k in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, k)) obj[k] = payload[k];
    }
    window.dataLayer.push(obj);
    return obj;
  };

  // ---------------------------------------------------------------------------
  // 3. Network instrumentation — what did the GTM tags actually fire?
  // ---------------------------------------------------------------------------

  function record(method, url, extra) {
    if (!url || !WATCH.test(String(url))) return;
    var entry = {
      t: new Date().toISOString(),
      method: method,
      url: String(url),
      page: location.pathname.split('/').pop() || 'index.html'
    };
    if (extra) entry.note = extra;
    FCTest.netLog.push(entry);

    // Persist across navigations so the thank-you page can show the full journey.
    try {
      var stored = JSON.parse(window.sessionStorage.getItem(LOG_KEY) || '[]');
      stored.push(entry);
      window.sessionStorage.setItem(LOG_KEY, JSON.stringify(stored.slice(-60)));
    } catch (e) {}

    if (window.console && console.info) {
      console.info('[FCTest] ' + method + ' → ' + url);
    }
    document.dispatchEvent(new CustomEvent('fctest:network', { detail: entry }));
  }

  FCTest.getPersistedLog = function () {
    try { return JSON.parse(window.sessionStorage.getItem(LOG_KEY) || '[]'); }
    catch (e) { return []; }
  };

  // -- Image beacons (the classic 1x1 tracking pixel) -------------------------
  try {
    var imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (imgSrc && imgSrc.set) {
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        get: function () { return imgSrc.get.call(this); },
        set: function (v) { record('IMG', v); return imgSrc.set.call(this, v); },
        configurable: true
      });
    }
  } catch (e) {}

  // -- XHR --------------------------------------------------------------------
  if (window.XMLHttpRequest) {
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      record('XHR ' + method, url);
      return open.apply(this, arguments);
    };
  }

  // -- fetch ------------------------------------------------------------------
  if (window.fetch) {
    var nativeFetch = window.fetch;
    window.fetch = function (input) {
      var url = (input && input.url) ? input.url : input;
      record('FETCH', url);
      return nativeFetch.apply(this, arguments);
    };
  }

  // -- sendBeacon -------------------------------------------------------------
  if (navigator.sendBeacon) {
    var beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url) {
      record('BEACON', url);
      return beacon.apply(null, arguments);
    };
  }

  // -- <script> injection (how GTM Custom HTML tags load the FC libraries) ----
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (node) {
        if (node.tagName === 'SCRIPT' && node.src && WATCH.test(node.src)) {
          FCTest.scriptLog.push({ t: new Date().toISOString(), src: node.src });
          record('SCRIPT', node.src, 'injected by GTM');
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ---------------------------------------------------------------------------
  // 4. Bot / automation signals
  // ---------------------------------------------------------------------------

  /**
   * The surface a bot-detection script typically reads. Reported, never acted on
   * — this harness does not block anything, it just shows you what is visible.
   */
  FCTest.botSignals = function () {
    var nav = window.navigator;
    var ua = nav.userAgent || '';
    return {
      'navigator.webdriver': String(nav.webdriver),
      'headless in UA': /headless/i.test(ua) ? 'YES' : 'no',
      'phantom / selenium keys': (window.callPhantom || window._phantom ||
        window.__selenium_unwrapped || window.__webdriver_evaluate ||
        document.documentElement.getAttribute('webdriver')) ? 'YES' : 'no',
      'cdc_ chrome driver keys': Object.keys(window).filter(function (k) {
        return /^(cdc_|\$cdc|__driver|__webdriver|__fxdriver)/.test(k);
      }).join(', ') || 'none',
      'plugins': nav.plugins ? nav.plugins.length : 'n/a',
      'languages': (nav.languages || []).join(', ') || 'none',
      'hardwareConcurrency': nav.hardwareConcurrency || 'n/a',
      'deviceMemory': nav.deviceMemory || 'n/a',
      'maxTouchPoints': nav.maxTouchPoints,
      'screen': screen.width + '×' + screen.height + ' @' + window.devicePixelRatio + 'x',
      'viewport': window.innerWidth + '×' + window.innerHeight,
      'timezone': (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || 'n/a',
      'cookiesEnabled': String(nav.cookieEnabled),
      'doNotTrack': String(nav.doNotTrack),
      'referrer': document.referrer || '(none)',
      'userAgent': ua
    };
  };

  // ---------------------------------------------------------------------------
  // 5. Cookie readout
  // ---------------------------------------------------------------------------

  FCTest.cookies = function () {
    if (!document.cookie) return [];
    return document.cookie.split(';').map(function (c) {
      var i = c.indexOf('=');
      return { name: c.slice(0, i).trim(), value: c.slice(i + 1).trim() };
    }).filter(function (c) { return c.name; });
  };

  /** Cookies that look like they came from the Fintel attribution script. */
  FCTest.fcCookies = function () {
    return FCTest.cookies().filter(function (c) {
      return /^(fc|fintel)/i.test(c.name);
    });
  };

  FCTest.clearCookies = function () {
    FCTest.cookies().forEach(function (c) {
      var paths = ['/', location.pathname];
      var hosts = ['', location.hostname, '.' + location.hostname];
      paths.forEach(function (p) {
        hosts.forEach(function (h) {
          document.cookie = c.name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + p +
            (h ? '; domain=' + h : '');
        });
      });
    });
  };

  FCTest.resetAll = function () {
    FCTest.clearCookies();
    FCTest.clearOrderId();
    try {
      window.sessionStorage.removeItem(PID_KEY);
      window.sessionStorage.removeItem(PID_SRC_KEY);
    } catch (e) {}
    try { window.sessionStorage.removeItem(LOG_KEY); } catch (e) {}
    location.href = 'index.html';
  };

  window.FCTest = FCTest;
})(window, document);
