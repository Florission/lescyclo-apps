// iPad-Ersatz für die Android-Bridge: Reservierung
window.Android = {
  load: (name) => LC.kv.load(name),
  save: (name, data) => LC.kv.save(name, data),
  exportBackup: (filename, data) => {
    LC.deliver(new Blob([String(data)], { type: 'application/json' }), filename || 'reservierungen.json', 'Sicherung Reservierungen')
      .then((r) => { if (r !== 'aborted') LC.call('onMsg', 'ok:Sicherung erstellt.'); })
      .catch(() => LC.call('onMsg', 'err:Sicherung konnte nicht gespeichert werden.'));
  },
  autoBackup: (filename, data) => {
    // iPad: Kopie im Gerätespeicher (letzte 14 Tage) – schützt vor versehentlichem Löschen in der App
    try {
      LC.ls.set('auto_' + filename, String(data));
      const keys = Object.keys(localStorage).filter(k => k.startsWith('reservierung:auto_')).sort();
      keys.slice(0, Math.max(0, keys.length - 14)).forEach(k => localStorage.removeItem(k));
      return 'ok:iPad (interne Kopie)';
    } catch (e) { return 'err:' + e.message; }
  },
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
  },
  importBackup: () => {
    LC.pickFile('.json,application/json,text/plain').then((f) => {
      if (!f) return;
      f.text().then((txt) => LC.call('onImport', txt)).catch(() => LC.call('onMsg', 'err:Datei konnte nicht gelesen werden.'));
    });
  }
};

// Abgleich zwischen Geräten (Handy / iPad / Tablet)
LC.setupSync({
  keys: ['reservierungen', 'gaeste', 'einstellungen'],
  // nicht abgleichen, während Tischplan/Einstellungen bearbeitet werden
  canSync: () => typeof view === 'undefined' || view !== 'einst',
  onChange: () => {
    res = load('reservierungen', []); guests = load('gaeste', []);
    cfg = Object.assign({}, cfg, load('einstellungen', {}));
    if (editId && !res.some((r) => r.id === editId)) resetForm();
    show(view);
  }
});
