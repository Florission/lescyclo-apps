// iPad-Ersatz für die Android-Bridge: Reservierung
window.Android = {
  load: (name) => LC.kv.load(name),
  save: (name, data) => LC.kv.save(name, data),
  exportBackup: (filename, data) => {
    LC.deliver(new Blob([String(data)], { type: 'application/json' }), filename || 'reservierungen.json', 'Sicherung Reservierungen')
      .then((r) => { if (r !== 'aborted') LC.call('onMsg', 'ok:Sicherung erstellt.'); })
      .catch(() => LC.call('onMsg', 'err:Sicherung konnte nicht gespeichert werden.'));
  },
  importBackup: () => {
    LC.pickFile('.json,application/json,text/plain').then((f) => {
      if (!f) return;
      f.text().then((txt) => LC.call('onImport', txt)).catch(() => LC.call('onMsg', 'err:Datei konnte nicht gelesen werden.'));
    });
  }
};
