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

  // 🔄-Button: neueste App-Version aus dem Netz laden (gespeicherte Daten bleiben erhalten)
  async function appUpdate(btn) {
    const show = (t) => { if (btn) btn.textContent = t; };
    if (btn) btn.disabled = true;
    show('⏳');
    try { // erst prüfen, ob Internet da ist – sonst nichts löschen, damit die App offline weiterläuft
      const r = await fetch('manifest.webmanifest?check=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error();
    } catch (e) {
      show('⚠️ offline');
      setTimeout(() => { show('🔄'); if (btn) btn.disabled = false; }, 2500);
      return;
    }
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update().catch(() => {});
      }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
    } catch (e) {}
    location.replace(location.pathname + '?v=' + Date.now());
  }
  document.addEventListener('DOMContentLoaded', () => {
    const h1 = document.querySelector('header h1');
    if (!h1) return;
    const st = document.createElement('style');
    st.textContent = '.lc-upd{font:inherit;font-size:15px;line-height:1;margin-left:10px;padding:6px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.6);color:inherit;cursor:pointer;vertical-align:middle}.lc-upd:disabled{opacity:.7}';
    document.head.appendChild(st);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lc-upd'; b.textContent = '🔄';
    b.title = 'App aktualisieren'; b.setAttribute('aria-label', 'App aktualisieren');
    b.addEventListener('click', () => appUpdate(b));
    h1.style.display = 'inline-block'; h1.style.verticalAlign = 'middle';
    h1.after(b);
  });

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

  window.LC = { ls, deliver, pickFile, call, appUpdate,
    kv: {
      load: (name) => ls.get('f_' + String(name).replace(/[^a-z0-9_-]/g, '')) || '',
      save: (name, data) => ls.set('f_' + String(name).replace(/[^a-z0-9_-]/g, ''), String(data))
    }
  };
})();
