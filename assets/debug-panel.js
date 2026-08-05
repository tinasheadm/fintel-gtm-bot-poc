/**
 * FC Test Harness — on-page debug drawer.
 * Renders at the bottom of every page. Read-only: it reports state, it never
 * changes tracking behaviour. Toggle with the tab or press `d`.
 */
(function (window, document) {
  'use strict';

  var FCTest = window.FCTest;
  if (!FCTest) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function kvTable(obj, highlight) {
    var t = el('table', 'fcd-kv');
    Object.keys(obj).forEach(function (k) {
      var tr = el('tr');
      var val = String(obj[k]);
      if (highlight && highlight(k, val)) tr.className = 'fcd-flag';
      tr.appendChild(el('th', null, k));
      tr.appendChild(el('td', null, val));
      t.appendChild(tr);
    });
    return t;
  }

  function build() {
    var root = el('div', 'fcd');
    root.id = 'fc-debug';

    var tab = el('button', 'fcd-tab', 'FC Debug');
    tab.setAttribute('aria-expanded', 'false');
    root.appendChild(tab);

    var body = el('div', 'fcd-body');
    root.appendChild(body);

    tab.addEventListener('click', function () {
      var open = root.classList.toggle('fcd-open');
      tab.setAttribute('aria-expanded', String(open));
      if (open) render();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'd' && !/input|textarea|select/i.test(e.target.tagName)) {
        tab.click();
      }
    });

    function section(title, node, actions) {
      var s = el('section', 'fcd-sec');
      var h = el('h3', null, title);
      if (actions) h.appendChild(actions);
      s.appendChild(h);
      s.appendChild(node);
      return s;
    }

    function render() {
      body.innerHTML = '';

      // -- GTM status --------------------------------------------------------
      var gtmLoaded = !!(window.google_tag_manager && window.google_tag_manager['GTM-WFD2R889']);
      var status = {
        'GTM container': 'GTM-WFD2R889',
        'GTM loaded': gtmLoaded ? 'YES' : 'NO — check the container snippet / ad blocker',
        'fcpixel object': typeof window.fcpixel !== 'undefined' ? 'present' : 'not loaded on this page',
        'page': location.pathname.split('/').pop() || 'index.html',
        'hostname': location.hostname || '(file://)',
        'FcAtrId (pointer)': (function () {
          var a = FCTest.attribution();
          return a.pointerValue
            ? 'points to cookie "' + a.pointerValue + '"'
            : 'absent — attribution tag has not run (or was blocked)';
        })(),
        'click ID cookie': (function () {
          var a = FCTest.attribution();
          return a.clickId
            ? a.clickCookieName + ' = ' + a.clickId
            : 'absent — no click ID stored';
        })(),
        'attribution complete': FCTest.attribution().complete ? 'YES' : 'NO',
        'product (pid)': FCTest.getPid() || '(none supplied)',
        'pid source': FCTest.pidSource() === 'ad' ? 'the Fintel ad'
                    : FCTest.pidSource() === 'funnel' ? 'chosen in the funnel'
                    : '(unset)',
        'URL template': FCTest.templateDefect || 'ok',
        'finteltag (click ID)':
          new URLSearchParams(location.search).get('finteltag') ||
          '(none — direct/unattributed visit)',
        'referrer': document.referrer || '(none)',
        'order ID (session)': (function () {
          try { return sessionStorage.getItem('fc_test_order_id') || '(not yet generated)'; }
          catch (e) { return '(sessionStorage blocked)'; }
        })()
      };
      body.appendChild(section('Status', kvTable(status, function (k, v) {
        return /^(NO|not loaded)/.test(v);
      })));

      // -- Cookies -----------------------------------------------------------
      var fcCookies = FCTest.fcCookies();
      var all = FCTest.cookies();
      var cookieNode;
      if (all.length) {
        var ct = el('table', 'fcd-kv');
        all.forEach(function (c) {
          var tr = el('tr');
          if (/^(fc|fintel)/i.test(c.name)) tr.className = 'fcd-hit';
          tr.appendChild(el('th', null, c.name));
          tr.appendChild(el('td', null, decodeURIComponent(c.value)));
          ct.appendChild(tr);
        });
        cookieNode = ct;
      } else {
        cookieNode = el('p', 'fcd-empty',
          'No cookies on this document. If the attribution tag has fired, the cookie ' +
          'domain argument is probably scoped to a domain this page is not served from.');
      }
      var cookieTitle = 'Cookies (' + fcCookies.length + ' Fintel / ' + all.length + ' total)';
      body.appendChild(section(cookieTitle, cookieNode));

      // -- Network -----------------------------------------------------------
      var log = FCTest.getPersistedLog();
      var netNode;
      if (log.length) {
        var nt = el('table', 'fcd-net');
        log.slice().reverse().forEach(function (e) {
          var tr = el('tr');
          tr.appendChild(el('td', 'fcd-mono', e.t.slice(11, 23)));
          tr.appendChild(el('td', 'fcd-method', e.method));
          tr.appendChild(el('td', 'fcd-page', e.page));
          var u = el('td', 'fcd-url');
          u.appendChild(el('span', null, e.url));
          tr.appendChild(u);
          nt.appendChild(tr);
        });
        netNode = nt;
      } else {
        netNode = el('p', 'fcd-empty',
          'Nothing requested from fintelconnect.com yet this session.');
      }
      body.appendChild(section('Fintel network calls this session (' + log.length + ')', netNode));

      // -- dataLayer ---------------------------------------------------------
      var events = (window.dataLayer || []).filter(function (o) {
        return o && o.event && String(o.event).indexOf('gtm.') !== 0;
      });
      var dlNode = el('pre', 'fcd-pre', events.length
        ? JSON.stringify(events, null, 2)
        : 'No custom dataLayer events pushed on this page.');
      body.appendChild(section('dataLayer events (' + events.length + ')', dlNode));

      // -- Bot signals -------------------------------------------------------
      body.appendChild(section('Automation signals', kvTable(FCTest.botSignals(), function (k, v) {
        return v === 'YES' || v === 'true';
      })));

      // -- Actions -----------------------------------------------------------
      var bar = el('div', 'fcd-actions');
      var reset = el('button', 'fcd-btn fcd-btn-danger', 'Reset test (clear cookies + order ID)');
      reset.addEventListener('click', function () { FCTest.resetAll(); });
      var refresh = el('button', 'fcd-btn', 'Refresh panel');
      refresh.addEventListener('click', render);
      var copy = el('button', 'fcd-btn', 'Copy report');
      copy.addEventListener('click', function () {
        var report = {
          page: location.href,
          capturedAt: new Date().toISOString(),
          status: status,
          cookies: FCTest.cookies(),
          fintelNetworkCalls: FCTest.getPersistedLog(),
          dataLayerEvents: events,
          automationSignals: FCTest.botSignals()
        };
        var text = JSON.stringify(report, null, 2);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () {
            copy.textContent = 'Copied';
            setTimeout(function () { copy.textContent = 'Copy report'; }, 1500);
          });
        } else {
          console.log(text);
          copy.textContent = 'Logged to console';
        }
      });
      bar.appendChild(refresh);
      bar.appendChild(copy);
      bar.appendChild(reset);
      body.appendChild(bar);
    }

    // Live-update the badge as tags fire.
    document.addEventListener('fctest:network', function () {
      tab.textContent = 'FC Debug (' + FCTest.getPersistedLog().length + ')';
      if (root.classList.contains('fcd-open')) render();
    });

    document.body.appendChild(root);
    var n = FCTest.getPersistedLog().length;
    if (n) tab.textContent = 'FC Debug (' + n + ')';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})(window, document);
