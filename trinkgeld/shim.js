// iPad-Ersatz für die Android-Bridge: Trinkgeldliste
// - Einträge im Gerätespeicher
// - PDF wie auf dem Tablet (jsPDF), Weitergabe über das Teilen-Menü (Mail, Dateien …)
// - Erinnerung am letzten Öffnungstag des Monats (Montag Ruhetag) + Kalender-Erinnerung
(function () {
  const TO = 'kontakt@lescyclo.de';
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const label = (k) => MONTHS[parseInt(k.substring(5, 7), 10) - 1] + ' ' + k.substring(0, 4);
  const msg = (m) => LC.call('onMsg', m);

  /* ---------- Speicher ---------- */
  const load = () => { try { const a = JSON.parse(LC.ls.get('eintraege') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  const save = (a) => LC.ls.set('eintraege', JSON.stringify(a));
  const month = (m) => load().filter((o) => o && o.monat === m).sort((x, y) =>
    String(x.datum || '').localeCompare(String(y.datum || '')) || String(x.erstellt || '').localeCompare(String(y.erstellt || '')));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  /* ---------- PDF (Layout wie Android-App) ---------- */
  const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur = (c) => nf.format((Number(c) || 0) / 100) + ' €';
  function buildPdf(monat) {
    const rows = month(monat);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = 595, H = 842, L = 57, R = 538, X = [57, 128, 255, 397, 538];
    doc.setLineWidth(0.8);
    const txt = (s, x, y, size, bold, align) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
      doc.text(String(s), x, y, align ? { align } : undefined);
    };
    const header = (y) => {
      doc.rect(X[0], y, X[4] - X[0], 20);
      txt('Tag', X[0] + 6, y + 14, 10, true); txt('Betrag', X[2] - 6, y + 14, 10, true, 'right');
      txt('Name', X[2] + 6, y + 14, 10, true); txt('Unterschrift', X[3] + 6, y + 14, 10, true);
      return y + 20;
    };
    let y = 62;
    txt("Trinkgeldbarentnahme Le's Cyclo GmbH", W / 2, y, 16, true, 'center');
    y += 28; txt('Monat: ' + monat.substring(5, 7) + '/' + monat.substring(0, 4), L, y, 11);
    y += 16; y = header(y);
    let sum = 0; const rowH = 34;
    for (const r of rows) {
      if (y + rowH > H - 60) { doc.addPage(); y = header(50); }
      const b = Number(r.betrag) || 0; sum += b;
      doc.rect(L, y, R - L, rowH);
      for (let i = 1; i < 4; i++) doc.line(X[i], y, X[i], y + rowH);
      const d = String(r.datum || ''); const ty = y + rowH / 2 + 4;
      if (d.length >= 10) txt(d.substring(8, 10) + '.' + d.substring(5, 7) + '.', X[0] + 6, ty, 11);
      txt(eur(b).replace(' €', ' EUR'), X[2] - 6, ty, 11, false, 'right');
      txt(String(r.name || '').substring(0, 26), X[2] + 6, ty, 11);
      if (r.sig) {
        try {
          const p = doc.getImageProperties(r.sig);
          const sc = Math.min((X[4] - X[3] - 8) / p.width, (rowH - 4) / p.height);
          doc.addImage(r.sig, 'PNG', X[3] + 4, y + 2, p.width * sc, p.height * sc);
        } catch (e) { /* Unterschrift nicht lesbar */ }
      }
      y += rowH;
    }
    if (!rows.length) { txt('Keine Entnahmen in diesem Monat.', L + 6, y + 20, 11); y += 30; }
    y += 22;
    txt('Summe: ' + eur(sum).replace(' €', ' EUR') + '   (' + rows.length + ' Entnahmen)', L, y, 11, true);
    txt('Erstellt am ' + new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }), L, H - 30, 8);
    return { blob: doc.output('blob'), count: rows.length, sum };
  }

  /* ---------- Versand über Teilen-Menü ---------- */
  async function sendMonth(m) {
    let p;
    try { p = buildPdf(m); } catch (e) { msg('err:PDF konnte nicht erstellt werden.'); return; }
    const mm = m.substring(5, 7) + '/' + m.substring(0, 4);
    const r = await LC.deliver(p.blob, 'Trinkgeld_' + m + '.pdf', 'Trinkgeldbarentnahme ' + mm,
      'Hallo,\n\nanbei die Trinkgeldbarentnahme-Liste für ' + mm + '.\n' + p.count + ' Entnahmen, Summe ' + eur(p.sum) + '.\n\nBitte an ' + TO + ' senden.');
    if (r === 'aborted') return;
    if (confirm('Wurde die Liste für ' + label(m) + ' an ' + TO + ' verschickt?')) {
      LC.ls.set('sent_' + m, new Date().toISOString());
      msg('ok:Liste ' + label(m) + ' als verschickt markiert.');
      renderBanner();
    }
  }

  /* ---------- Bridge ---------- */
  window.Android = {
    list: () => JSON.stringify(load()),
    add: (json) => { try { const o = JSON.parse(json); const a = load(); o.id = uuid(); a.push(o); return save(a) ? o.id : ''; } catch (e) { return ''; } },
    remove: (id) => { save(load().filter((o) => String(o.id) !== String(id))); return true; },
    savePdf: (m) => {
      let p; try { p = buildPdf(m); } catch (e) { return msg('err:PDF konnte nicht erstellt werden.'); }
      LC.deliver(p.blob, 'Trinkgeld_' + m + '.pdf', 'Trinkgeld ' + m).then((r) => { if (r !== 'aborted') msg('ok:PDF erstellt.'); });
    },
    getSettings: () => JSON.stringify({ host: '', port: '', user: '', from: '', to: TO, hasPass: false, status: '' }),
    saveSettings: () => {},
    sendNow: (m) => sendMonth(m),
    exitApp: () => {}
  };

  /* ---------- Letzter Öffnungstag (Mo Ruhetag) ---------- */
  function lastBizDay(y, m) { // m: 0-11
    const d = new Date(y, m + 1, 0);
    while (d.getDay() === 1) d.setDate(d.getDate() - 1);
    return d;
  }
  function dueMonth() {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const cur = key(now);
    if (now >= lastBizDay(now.getFullYear(), now.getMonth()) && !LC.ls.get('sent_' + cur)) return { m: cur, today: true };
    const prev = key(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    if (!LC.ls.get('sent_' + prev) && month(prev).length) return { m: prev, today: false };
    return null;
  }

  /* ---------- Kalender-Erinnerung (.ics, jeden letzten Di–So im Monat, 20:00) ---------- */
  function calendarFile() {
    const now = new Date();
    let d = lastBizDay(now.getFullYear(), now.getMonth());
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = lastBizDay(now.getFullYear(), now.getMonth() + 1);
    const ds = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    const st = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Les Cyclo//Trinkgeld//DE', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT', 'UID:trinkgeld-monatsversand@lescyclo.de', 'DTSTAMP:' + st,
      'DTSTART:' + ds + 'T200000', 'DURATION:PT15M',
      'RRULE:FREQ=MONTHLY;BYDAY=TU,WE,TH,FR,SA,SU;BYSETPOS=-1',
      'SUMMARY:Trinkgeldliste an ' + TO + ' schicken',
      'DESCRIPTION:Letzter Öffnungstag im Monat: In der Trinkgeld-App auf "Jetzt senden" tippen.',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Trinkgeldliste versenden', 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    return new Blob([ics], { type: 'text/calendar' });
  }

  /* ---------- Oberfläche ergänzen ---------- */
  let banner;
  function renderBanner() {
    const due = dueMonth();
    if (!due) { if (banner) banner.hidden = true; return; }
    banner.hidden = false;
    banner.querySelector('span').textContent = due.today
      ? 'Heute ist der letzte Öffnungstag im ' + label(due.m) + ': Trinkgeldliste per Mail an ' + TO + ' schicken.'
      : 'Die Trinkgeldliste für ' + label(due.m) + ' wurde noch nicht verschickt.';
    banner.dataset.m = due.m;
  }
  function addUi() {
    const css = document.createElement('style');
    css.textContent = '#lcBanner{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:8px;align-items:center;' +
      'padding:12px 16px;background:#fff4d6;border-bottom:2px solid #e0b84a;color:#3d2f00;font-weight:600}' +
      '#lcBanner span{flex:1 1 260px}#lcBanner button{min-height:40px}#setBtn{display:none!important}' +
      '.lcRow{display:flex;gap:8px;flex-wrap:wrap}';
    document.head.appendChild(css);
    banner = document.createElement('div');
    banner.id = 'lcBanner'; banner.hidden = true;
    banner.innerHTML = '<span></span><button type="button" id="lcSend">Jetzt senden</button><button type="button" class="ghost" id="lcDone">Schon erledigt</button>';
    document.body.prepend(banner);
    banner.querySelector('#lcSend').onclick = () => sendMonth(banner.dataset.m);
    banner.querySelector('#lcDone').onclick = () => { LC.ls.set('sent_' + banner.dataset.m, new Date().toISOString()); renderBanner(); };

    const info = document.getElementById('sendInfo');
    if (info) {
      info.textContent = 'Am letzten Öffnungstag des Monats erinnert dich die App, die Liste als PDF an ' + TO + ' zu schicken. ';
      const cal = document.createElement('button');
      cal.type = 'button'; cal.className = 'ghost'; cal.textContent = 'Erinnerung in den Kalender';
      cal.onclick = () => LC.deliver(calendarFile(), 'Trinkgeld-Erinnerung.ics', 'Trinkgeld-Erinnerung');
      info.after(cal);
    }
    const pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) {
      const mail = document.createElement('button');
      mail.type = 'button'; mail.textContent = 'Per Mail senden';
      mail.onclick = () => { let m; try { m = monthKey(); } catch (e) { m = key(new Date()); } sendMonth(m); };
      const wrap = document.createElement('div'); wrap.className = 'lcRow';
      pdfBtn.replaceWith(wrap); wrap.append(pdfBtn, mail);
    }
    renderBanner();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderBanner(); });
    setInterval(renderBanner, 30 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addUi); else addUi();
})();
