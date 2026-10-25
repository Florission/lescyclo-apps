// Gemeinsame Helfer für die iPad-Version (läuft vor der eigentlichen App)
(function () {
  const PFX = document.currentScript.dataset.app + ':';
  const ls = {
    get(k) { try { return localStorage.getItem(PFX + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(PFX + k, v); return true; } catch (e) { return false; } }
  };
  // Daten möglichst dauerhaft behalten
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  // Offline-Fähigkeit
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  // Datei an den Nutzer geben: Teilen-Menü (iPad) oder Download
  async function deliver(blob, filename, title, text) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: title || filename, text: text || '' }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return 'downloaded';
  }
  function pickFile(accept) {
    return new Promise((resolve) => {
      const i = document.createElement('input');
      i.type = 'file'; if (accept) i.accept = accept; i.style.display = 'none';
      i.onchange = () => { resolve(i.files && i.files[0]); i.remove(); };
      document.body.appendChild(i); i.click();
    });
  }
  const call = (fn, ...args) => setTimeout(() => { if (typeof window[fn] === 'function') window[fn](...args); }, 0);

  window.LC = { ls, deliver, pickFile, call,
    kv: {
      load: (name) => ls.get('f_' + String(name).replace(/[^a-z0-9_-]/g, '')) || '',
      save: (name, data) => ls.set('f_' + String(name).replace(/[^a-z0-9_-]/g, ''), String(data))
    }
  };
})();
