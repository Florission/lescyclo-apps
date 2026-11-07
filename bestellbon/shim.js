// iPad-Ersatz für die Android-Bridge: Bestellbon
// Druck über Epson ePOS-Print (HTTPS direkt an den Drucker), ESC/POS-Daten unverändert.
window.Android = {
  load: (name) => LC.kv.load(name),
  save: (name, data) => LC.kv.save(name, data),
  print: (id, host, port, base64) => {
    const done = (ok, err) => LC.call('onPrinted', id, ok, ok ? '' : err);
    let hex = '';
    try {
      const bin = atob(String(base64));
      for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
    } catch (e) { return done(false, 'Bon-Daten fehlerhaft'); }
    const ip = String(host).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const body = '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
      '<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"><command>' + hex + '</command></epos-print>' +
      '</s:Body></s:Envelope>';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    fetch('https://' + ip + '/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000', {
      method: 'POST', body, signal: ctrl.signal,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '""' }
    }).then((r) => r.text()).then((txt) => {
      clearTimeout(timer);
      if (/success="true"/.test(txt)) return done(true);
      const code = (txt.match(/code="([^"]*)"/) || [])[1];
      done(false, 'Drucker meldet Fehler' + (code ? ' (' + code + ')' : '') + '. Papier/Deckel prüfen.');
    }).catch(() => {
      clearTimeout(timer);
      done(false, 'Drucker nicht erreichbar. Einmalig in Safari https://' + ip + ' öffnen und das Zertifikat bestätigen; ePOS-Print muss am Drucker aktiv sein.');
    });
  }
};

// Abgleich zwischen Geräten (Handy / iPad / Tablet)
(function () {
  const lineKey = (l) => JSON.stringify([l.name, l.nr, l.variant, l.option, l.price, l.note || '', l.gang || 1,
    typeof exKey === 'function' ? exKey(l) : '']);
  // Positionen am Tisch wie einen Zähler abgleichen: Menge = lokal + GitHub − letzter Stand
  // → auf zwei Geräten gleichzeitig boniert = beides auf der Rechnung, bezahlt/storniert = abgezogen
  function mergeTabs(b, l, r) {
    b = b || {}; l = l || {}; r = r || {};
    const out = {};
    for (const label of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const tb = b[label], tl = l[label], tr = r[label];
      const q = (t) => { const m = new Map(); for (const x of (t && t.lines) || []) { const k = lineKey(x); m.set(k, (m.get(k) || 0) + (x.qty || 0)); } return m; };
      const qb = q(tb), ql = q(tl), qr = q(tr), proto = new Map();
      for (const t of [tb, tr, tl]) for (const x of (t && t.lines) || []) proto.set(lineKey(x), x);
      const order = [...new Set([...((tl && tl.lines) || []), ...((tr && tr.lines) || [])].map(lineKey))];
      const lines = [];
      for (const k of order) {
        const n = (ql.get(k) || 0) + (qr.get(k) || 0) - (qb.get(k) || 0);
        if (n > 0) lines.push(Object.assign(JSON.parse(JSON.stringify(proto.get(k))), { qty: n }));
      }
      if (!lines.length) continue;
      const rest = (t) => { if (!t) return undefined; const o = Object.assign({}, t); delete o.lines; return o; };
      const meta = LC.mergeVal(rest(tb), rest(tl), rest(tr)) || rest(tl) || rest(tr) || {};
      const opened = [tl, tr].filter(Boolean).map((t) => t.opened).filter(Boolean).sort()[0];
      out[label] = Object.assign({}, meta, { label, lines }, opened ? { opened } : {});
    }
    return out;
  }
  // Abgerechnete Bons: alle behalten, neueste zuerst, max. 50
  function mergeHist(b, l, r) {
    const m = new Map();
    for (const h of [...(r || []), ...(l || [])]) m.set(h.at + '|' + h.label, h);
    return [...m.values()].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0)).slice(0, 50);
  }
  LC.setupSync({
    keys: ['tische', 'bons', 'speisekarte', 'einstellungen'],
    special: { tische: mergeTabs, bons: mergeHist },
    // nicht abgleichen, während abgerechnet, umgesetzt oder die Karte/Einstellungen bearbeitet werden
    canSync: () => {
      if (typeof view === 'undefined') return true;
      const hid = (id) => { const e = document.getElementById(id); return !e || e.hidden; };
      return !(view === 'tisch' && mode === 'pay') && view !== 'karte' && view !== 'einst' && hid('tpBox') && hid('chooser');
    },
    onChange: () => {
      hist = load('bons', []); tabs = load('tische', {});
      menu = load('speisekarte', null) || menu;
      cfg = Object.assign({}, cfg, load('einstellungen', {}));
      if (view === 'plan') renderPlan();
      else if (view === 'tisch') renderSide();
      else if (view === 'bons') renderHist();
    }
  });
})();
