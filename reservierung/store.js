// Gemeinsame Helfer für die Web-Version (iPad/Handy) – läuft vor der eigentlichen App
(function () {
  const APP = document.currentScript.dataset.app;
  const PFX = APP + ':';
  const ls = {
    get(k) { try { return localStorage.getItem(PFX + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(PFX + k, v); return true; } catch (e) { return false; } }
  };
  // Daten möglichst dauerhaft behalten
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  // Offline-Fähigkeit
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  /* ======================================================================
     Geräte-Abgleich (Handy / iPad / Tablet) über ein privates GitHub-Repo
     – gleiche Zugangsdaten wie die Einkauf-App
     – Datei <app>.json im Repo, Drei-Wege-Abgleich mit dem Stand vom letzten Mal
     ====================================================================== */
  const CFG_KEY = 'lescyclo_einkauf_sync';
  const S = { setup: null, busy: false, again: false, state: 'off', msg: '', last: '', timer: null, waiters: [] };
  const J = (v) => JSON.stringify(v);
  const eq = (a, b) => J(a) === J(b);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isIdArr = (v) => Array.isArray(v) && v.every((e) => isObj(e) && e.id != null);
  const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64d = (s) => decodeURIComponent(escape(atob(String(s).replace(/\s/g, ''))));
  function syncCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null') || {}; } catch (e) { return {}; } }
  const syncOn = () => { const c = syncCfg(); return !!(S.setup && c.repo && c.token); };
  function gh(path, opt) {
    const c = syncCfg(); opt = opt || {};
    return fetch('https://api.github.com/repos/' + c.repo + '/contents/' + path, Object.assign({ cache: 'no-store' }, opt, {
      headers: Object.assign({ 'Authorization': 'Bearer ' + c.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opt.headers || {})
    }));
  }

  // b = Stand beim letzten Abgleich, l = dieses Gerät, r = GitHub
  function mergeVal(b, l, r) {
    if (eq(l, r)) return l;
    if (eq(l, b)) return r;
    if (eq(r, b)) return l;
    if (l === undefined) return r;            // gelöscht vs. geändert → Änderung behalten
    if (r === undefined) return l;
    if (isIdArr(l) && isIdArr(r) && (b === undefined || isIdArr(b))) return mergeById(b || [], l, r);
    if (isObj(l) && isObj(r)) {
      const bo = isObj(b) ? b : {}, out = {};
      for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
        const v = mergeVal(bo[k], l[k], r[k]);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    return l;                                 // echter Konflikt: dieses Gerät gewinnt
  }
  function mergeById(b, l, r) {
    const m = (a) => new Map(a.map((e) => [String(e.id), e]));
    const bm = m(b), lm = m(l), rm = m(r), out = [];
    const ids = [...new Set([...r.map((e) => String(e.id)), ...l.map((e) => String(e.id))])];
    for (const id of ids) { const v = mergeVal(bm.get(id), lm.get(id), rm.get(id)); if (v !== undefined) out.push(v); }
    return out;
  }
  const readJ = (k) => { const s = ls.get(k); if (!s) return undefined; try { return JSON.parse(s); } catch (e) { return undefined; } };
  function readLocal() { const o = {}; for (const k of S.setup.keys) { const v = readJ('f_' + k); if (v !== undefined) o[k] = v; } return o; }
  function writeLocal(d) { for (const k of S.setup.keys) ls.set('f_' + k, d[k] === undefined ? '' : J(d[k])); }

  function setState(st, msg) {
    S.state = st; S.msg = msg || '';
    if (st === 'ok') { const d = new Date(); S.last = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    const el = document.querySelector('.lc-sync');
    if (el) { el.textContent = syncLabel(); el.classList.toggle('err', st === 'err'); }
  }
  function syncLabel() {
    if (!syncOn()) return 'Abgleich einrichten';
    if (S.state === 'busy') return '⏳ gleicht ab …';
    if (S.state === 'err') return '⚠️ ' + (S.msg || 'Fehler');
    if (S.state === 'wait') return '… wartet';
    return S.last ? '✓ abgeglichen ' + S.last : '✓ verbunden';
  }
  function schedule(ms) { clearTimeout(S.timer); S.timer = setTimeout(() => syncNow(), ms); }

  async function syncNow() {
    if (!syncOn()) return false;
    if (S.busy) { S.again = true; return new Promise((res) => S.waiters.push(res)); }
    if (S.setup.canSync && !S.setup.canSync()) { setState('wait'); schedule(4000); return false; }
    S.busy = true; setState('busy');
    let ok = false;
    try {
      for (let attempt = 0; attempt < 3 && !ok; attempt++) {
        const r = await gh(APP + '.json');
        let remote = null, sha = null;
        if (r.status !== 404) {
          if (!r.ok) throw new Error(r.status === 401 ? 'Token ungültig' : r.status === 404 ? 'Repo nicht gefunden' : 'GitHub ' + r.status);
          const j = await r.json(); sha = j.sha; remote = (JSON.parse(b64d(j.content)) || {}).data || {};
        }
        if (S.setup.canSync && !S.setup.canSync()) { setState('wait'); schedule(4000); return false; }
        // ab hier ohne Unterbrechung: frischen lokalen Stand lesen, zusammenführen, zurückschreiben
        const baseRaw = ls.get('sync_base'), first = !baseRaw;
        const base = first ? {} : JSON.parse(baseRaw), local = readLocal(), merged = {};
        for (const k of S.setup.keys) {
          const sp = S.setup.special && S.setup.special[k];
          // Erster Abgleich auf einem neuen Gerät: Einstellungen/Speisekarte von GitHub übernehmen, Listen zusammenführen
          const b = first && remote ? (sp || isIdArr(local[k]) ? undefined : local[k]) : base[k];
          const rv = remote ? remote[k] : local[k];
          const v = sp ? sp(b, local[k], rv) : mergeVal(b, local[k], rv);
          if (v !== undefined) merged[k] = v;
        }
        if (!eq(merged, local)) { writeLocal(merged); try { S.setup.onChange && S.setup.onChange(); } catch (e) { console.error(e); } }
        if (remote && eq(merged, remote)) { ls.set('sync_base', J(merged)); ok = true; break; }
        const body = { message: APP + ' – Abgleich', content: b64e(J({ app: APP, v: 1, updated: new Date().toISOString(), data: merged })) };
        if (sha) body.sha = sha;
        const p = await gh(APP + '.json', { method: 'PUT', body: J(body) });
        if (p.status === 409 || p.status === 422) continue;   // anderes Gerät war schneller → neu abgleichen
        if (!p.ok) throw new Error(p.status === 403 || p.status === 401 ? 'kein Schreibrecht' : 'GitHub ' + p.status);
        ls.set('sync_base', J(merged)); ok = true;
      }
      setState(ok ? 'ok' : 'err', ok ? '' : 'Konflikt – gleich nochmal');
      if (!ok) schedule(3000);
    } catch (e) {
      setState('err', e && e.message === 'Failed to fetch' || e instanceof TypeError ? 'offline' : (e && e.message) || 'Fehler');
    } finally {
      S.busy = false;
      const w = S.waiters.splice(0); w.forEach((f) => f(ok));
      if (S.again) { S.again = false; schedule(300); }
    }
    return ok;
  }
  function setupSync(opts) {
    S.setup = opts;
    setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, opts.every || 20000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
    window.addEventListener('online', () => syncNow());
    window.addEventListener('load', () => setTimeout(syncNow, 400));
  }

  // Einrichten-Dialog: Repo + Token oder Verbindungscode vom anderen Gerät
  function openSyncDialog() {
    const c = syncCfg(), on = !!(c.repo && c.token);
    const code = on ? 'LC1:' + btoa(J({ repo: c.repo, token: c.token })) : '';
    const ov = document.createElement('div'); ov.className = 'lc-ov';
    ov.innerHTML = `<div class="lc-dlg"><h3>Abgleich zwischen Geräten</h3>
      <p>Daten werden über dein privates GitHub-Repo zwischen Handy, iPad und Tablet abgeglichen (automatisch alle 20 Sek. und nach jeder Änderung).</p>
      ${on ? `<p><b>✓ Verbunden mit ${c.repo.replace(/[<>&"]/g, '')}</b></p>
        <p>Anderes Gerät verbinden: Code kopieren und dort einfügen.</p>
        <div class="lc-row"><button type="button" data-a="copy">Verbindungscode kopieren</button><button type="button" data-a="off" class="lc-sec">Trennen</button></div><hr>` : ''}
      <label>Verbindungscode <small>(vom anderen Gerät)</small></label><input data-f="code" placeholder="LC1:…" autocomplete="off">
      <p class="lc-or">– oder –</p>
      <label>Repo</label><input data-f="repo" placeholder="Florission/…" value="${on ? c.repo.replace(/"/g, '') : ''}" autocomplete="off">
      <label>Zugangs-Token</label><input data-f="token" type="password" placeholder="github_pat_…" autocomplete="off">
      <p class="lc-m"></p>
      <div class="lc-row"><button type="button" data-a="close" class="lc-sec">Schließen</button><button type="button" data-a="save">Verbinden</button></div></div>`;
    const q = (s) => ov.querySelector(s), msg = (t) => { q('.lc-m').textContent = t; };
    ov.addEventListener('click', async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (e.target === ov || a === 'close') return ov.remove();
      if (a === 'copy') {
        try { await navigator.clipboard.writeText(code); msg('✓ Code kopiert – auf dem anderen Gerät einfügen.'); }
        catch (x) { q('[data-f=code]').value = code; q('[data-f=code]').select(); msg('Code steht im Feld oben – markieren und kopieren.'); }
      }
      if (a === 'off') { localStorage.removeItem(CFG_KEY); setState('off'); ov.remove(); }
      if (a === 'save') {
        let repo = q('[data-f=repo]').value.trim().replace(/^https:\/\/github.com\//, '').replace(/\/$/, ''), token = q('[data-f=token]').value.trim();
        const cd = q('[data-f=code]').value.trim();
        if (cd) { try { const o = JSON.parse(atob(cd.replace(/^LC1:/, ''))); repo = o.repo; token = o.token; } catch (x) { return msg('Code ungültig – bitte komplett kopieren.'); } }
        if (!token && on && repo === c.repo) token = c.token;
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '') || !token) return msg('Bitte Code einfügen oder Repo und Token angeben.');
        localStorage.setItem(CFG_KEY, J({ repo, token }));
        msg('⏳ Verbinde …');
        const ok = await syncNow();
        if (ok) { ov.remove(); } else msg('✗ ' + (S.msg || 'Verbindung fehlgeschlagen'));
      }
    });
    document.body.appendChild(ov);
  }

  // 🔄-Button: abgleichen + neueste App-Version aus dem Netz laden (gespeicherte Daten bleiben erhalten)
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
    if (syncOn()) {
      if (S.setup.canSync && !S.setup.canSync()) { show('🔄'); if (btn) btn.disabled = false; setState('err', 'erst Abrechnung/Bearbeitung beenden'); return; }
      await syncNow();
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
    st.textContent = '.lc-upd{font:inherit;font-size:15px;line-height:1;margin-left:10px;padding:6px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.6);color:inherit;cursor:pointer;vertical-align:middle}.lc-upd:disabled{opacity:.7}'
      + '.lc-sync{font:inherit;font-size:12px;margin-left:8px;padding:4px 8px;border:0;border-radius:8px;background:transparent;color:#5f6b63;cursor:pointer;vertical-align:middle;text-decoration:underline dotted}.lc-sync.err{color:#b3261e}'
      + '.lc-ov{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}'
      + '.lc-dlg{background:#fff;color:#1d2420;border-radius:16px;padding:18px;max-width:440px;width:100%;max-height:90vh;overflow:auto;font:15px/1.4 -apple-system,system-ui,sans-serif}'
      + '.lc-dlg h3{margin:0 0 8px;font-size:19px}.lc-dlg p{margin:6px 0;color:#4a554e}.lc-dlg label{display:block;margin:10px 0 4px;font-weight:600}'
      + '.lc-dlg input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px;border:1px solid #cfd6cf;border-radius:10px}'
      + '.lc-dlg .lc-row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}.lc-dlg button{font:inherit;padding:10px 14px;border-radius:10px;border:0;background:#2f6f4f;color:#fff;cursor:pointer}'
      + '.lc-dlg button.lc-sec{background:#e7ebe6;color:#1d2420}.lc-dlg .lc-or{text-align:center;color:#8a948d;font-size:13px}.lc-dlg .lc-m{min-height:1.2em;font-weight:600}.lc-dlg hr{border:0;border-top:1px solid #e2e6e1;margin:14px 0}';
    document.head.appendChild(st);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'lc-upd'; b.textContent = '🔄';
    b.title = 'Abgleichen und App aktualisieren'; b.setAttribute('aria-label', 'Abgleichen und App aktualisieren');
    b.addEventListener('click', () => appUpdate(b));
    h1.style.display = 'inline-block'; h1.style.verticalAlign = 'middle';
    h1.after(b);
    if (S.setup) {
      const s = document.createElement('button');
      s.type = 'button'; s.className = 'lc-sync'; s.textContent = syncLabel();
      s.addEventListener('click', openSyncDialog);
      b.after(s);
    }
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
  const clean = (name) => String(name).replace(/[^a-z0-9_-]/g, '');

  window.LC = { ls, deliver, pickFile, call, appUpdate, setupSync, syncNow, mergeVal,
    kv: {
      load: (name) => ls.get('f_' + clean(name)) || '',
      save: (name, data) => {
        const ok = ls.set('f_' + clean(name), String(data));
        if (S.setup && S.setup.keys.includes(clean(name)) && syncOn()) schedule(1500);   // Änderung bald hochladen
        return ok;
      }
    }
  };
})();
