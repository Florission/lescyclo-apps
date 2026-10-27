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
  importBackup: () => {
    LC.pickFile('.json,application/json,text/plain').then((f) => {
      if (!f) return;
      f.text().then((txt) => LC.call('onImport', txt)).catch(() => LC.call('onMsg', 'err:Datei konnte nicht gelesen werden.'));
    });
  }
};
