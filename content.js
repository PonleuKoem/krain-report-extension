// Floating report panel: re-reads the stake lists whenever the page changes,
// sends every row to be saved and shows the saved totals, which keep rows
// that have since left the lists.
(() => {
  if (window.__krainReportLoaded) return;
  window.__krainReportLoaded = true;

  const P = window.KRainParser;
  const PANEL_ID = 'krain-report-panel';
  let panel = null;
  let collapsed = false;
  let last = null;
  let lastSaved = '';
  let queued = null;
  let saving = false;
  const saved = new Map(); // label -> sides with the saved totals
  const status = { error: null, saveError: null, recording: true };

  const fmt = n => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const cents = n => Math.round(n * 100) / 100;
  const slotIdOf = rowId => (/_(\d+)_\d+$/.exec(rowId) || [])[1];

  // Notices: a row whose stake went down, or that left the list, so it's clear
  // why the site's numbers dropped while the saved totals didn't (or did).
  // Only what this tab sees since it loaded is compared.
  const NOTICE_MAX = 40;
  const REMOVE_AFTER = 1500; // a row must stay gone this long, so a redraw isn't a removal
  const GROUP_OVER = 3; // more rows than this leaving a slot at once make one notice
  const notices = []; // newest first: { at, label, kind, side, odds, from, to, count }
  let unseen = 0;
  const tracked = new Map(); // label -> { slotId, known: Map(id -> row), present: Set(id) }
  const leaving = new Map(); // label|id -> { label, id, row, at }
  let leavingTimer = null;

  function notice(n) {
    notices.unshift({ at: new Date(), ...n });
    notices.length = Math.min(notices.length, NOTICE_MAX);
    unseen++;
  }

  function track(slots, now) {
    const labels = new Set(slots.map(s => s.label));
    for (const slot of slots) {
      const rows = new Map();
      for (const side of slot.sides) for (const r of side.rows) rows.set(r.id, { side: side.name, odds: r.odds, stake: r.stake });
      const ids = new Set([...rows.keys()].map(slotIdOf).filter(Boolean));
      let t = tracked.get(slot.label);
      // Rows of another slot under this title mean the page is mid-redraw.
      if (ids.size > 1 || t && t.slotId && ids.size && !ids.has(t.slotId)) continue;
      if (!t) {
        // First read of this slot: nothing to compare with yet.
        tracked.set(slot.label, { slotId: [...ids][0], known: rows, present: new Set(rows.keys()) });
        continue;
      }
      t.slotId = t.slotId || [...ids][0];
      for (const [id, row] of rows) {
        // Back within REMOVE_AFTER: it never left. `known` still has its last stake.
        leaving.delete(slot.label + '|' + id);
        const was = t.known.get(id);
        if (was && row.stake < was.stake) {
          notice({ label: slot.label, kind: was.gone ? 'back' : 'down', side: row.side, odds: row.odds, from: was.stake, to: row.stake });
        }
        t.known.set(id, row);
      }
      for (const id of t.present) {
        if (!rows.has(id) && !leaving.has(slot.label + '|' + id)) {
          leaving.set(slot.label + '|' + id, { label: slot.label, id, row: t.known.get(id), at: now });
        }
      }
      t.present = new Set(rows.keys());
    }
    // A slot that left the page takes its rows with it: not a removal.
    for (const [key, l] of leaving) if (!labels.has(l.label)) leaving.delete(key);
    confirmLeaving(now);
  }

  // Rows still gone after REMOVE_AFTER have left the list.
  function confirmLeaving(now) {
    const bySlot = new Map();
    for (const [key, l] of leaving) {
      if (now - l.at < REMOVE_AFTER) continue;
      leaving.delete(key);
      const t = tracked.get(l.label);
      if (t) t.known.set(l.id, { ...l.row, gone: true });
      if (!bySlot.has(l.label)) bySlot.set(l.label, []);
      bySlot.get(l.label).push(l.row);
    }
    for (const [label, rows] of bySlot) {
      if (rows.length > GROUP_OVER) {
        notice({ label, kind: 'many', count: rows.length, from: cents(rows.reduce((a, r) => a + r.stake, 0)),
          side: [...new Set(rows.map(r => r.side))].join(' + ') });
      } else {
        for (const r of rows) notice({ label, kind: 'gone', side: r.side, odds: r.odds, from: r.stake });
      }
    }
    clearTimeout(leavingTimer);
    leavingTimer = leaving.size ? setTimeout(() => { confirmLeaving(Date.now()); render(); }, 300) : null;
  }
  // Saved totals once the background has answered, what the page shows until then.
  const sidesOf = slot => saved.get(slot.label) || slot.sides;
  const grand = sides => sides.reduce((a, s) => a + s.total, 0);
  // Slots saved before stake sums were kept have none.
  const grandStake = sides => sides.some(s => s.stake == null) ? null : sides.reduce((a, s) => a + s.stake, 0);

  // The background worker files the rows in IndexedDB, one record per day and slot.
  // While a save is in flight only the newest snapshot is kept, so fast updates coalesce.
  function save(slots) {
    const snapshot = slots.map(s => ({ label: s.label, sides: s.sides.map(x => ({ name: x.name, rows: x.rows })) }));
    const key = JSON.stringify(snapshot);
    if (key === lastSaved) return;
    lastSaved = key;
    queued = snapshot;
    if (!saving) flush();
  }

  async function flush() {
    saving = true;
    while (queued) {
      const slots = queued;
      queued = null;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'saveSlots', slots });
        if (!res || !res.ok) throw new Error(res ? res.error : 'no reply');
        for (const s of res.slots) if (s.sides.length) saved.set(s.label, s.sides);
        status.recording = res.recording;
        status.saveError = null;
      } catch (e) {
        lastSaved = ''; // retry on the next read
        status.saveError = e.message;
      }
    }
    saving = false;
    render();
  }

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    Object.assign(el, props || {});
    for (const c of children.flat()) if (c != null) el.append(c);
    return el;
  }

  function reportText(label, sides) {
    const line = (name, stake, total) => `${name}: stake ${fmt(stake)}, × odds ${fmt(total)}`;
    return [label, ...sides.map(s => line(s.name, s.stake, s.total)), line('Total', grandStake(sides), grand(sides))].join('\n');
  }

  // Totals shown last time, so a total that just changed can flash.
  const prevTotals = new Map();
  const changed = (label, side) => {
    const prev = prevTotals.get(label + '|' + side.name);
    return prev != null && prev !== side.total;
  };

  function slotTable(slot) {
    return h('table', { className: 'kr-table' + (slot.visible ? '' : ' kr-hidden') },
      h('tr', { className: 'kr-slot' },
        h('td', { textContent: slot.label + (slot.visible ? '' : ' (other page)') }),
        h('td', { className: 'kr-col', textContent: 'Stake' }),
        h('td', { className: 'kr-col', textContent: '× odds' }),
        h('td'),
      ),
      sidesOf(slot).map((s, i) => h('tr', { className: i === 0 ? 'kr-a' : 'kr-b' },
        h('td', { textContent: s.name }),
        h('td', { className: 'kr-num kr-stake', textContent: fmt(s.stake) }),
        h('td', { className: 'kr-num kr-total' + (changed(slot.label, s) ? ' kr-flash' : ''), textContent: fmt(s.total) }),
        h('td', { className: 'kr-cnt', textContent: `${s.count} rows` }),
      )),
      h('tr', { className: 'kr-sum' },
        h('td', { textContent: 'Total' }),
        h('td', { className: 'kr-num kr-stake', textContent: fmt(grandStake(sidesOf(slot))) }),
        h('td', { className: 'kr-num kr-total', textContent: fmt(grand(sidesOf(slot))) }),
        h('td'),
      ),
    );
  }

  const signed = n => (n < 0 ? '−' : '+') + fmt(Math.abs(n));
  function noticeText(n) {
    const row = `${n.side} ${n.odds}`;
    const hit = n.to != null && ` (stake ${signed(n.to - n.from)}, × odds ${signed(cents((n.to - n.from) * Math.abs(n.odds) / 100))})`;
    switch (n.kind) {
      case 'down': return `${row} went down ${fmt(n.from)} → ${fmt(n.to)}${hit}`;
      case 'back': return `${row} came back lower ${fmt(n.from)} → ${fmt(n.to)}${hit}`;
      case 'gone': return `${row} left the list at ${fmt(n.from)}, still counted`;
      case 'many': return `${n.count} rows left the list (${n.side}), stake ${fmt(n.from)}, still counted`;
    }
  }

  function noticeList(fresh) {
    return h('div', { className: 'kr-notes' },
      h('div', { className: 'kr-notes-head' },
        h('span', { textContent: `Changes (${notices.length})` }),
        h('button', { className: 'kr-clear', textContent: 'Clear', onclick: () => { notices.length = 0; unseen = 0; render(); } }),
      ),
      h('div', { className: 'kr-notes-list' }, notices.map((n, i) => h('div', {
        className: 'kr-note kr-note-' + n.kind + (i < fresh ? ' kr-flash' : ''),
        title: n.label,
      },
        h('span', { className: 'kr-note-time', textContent: n.at.toLocaleTimeString('en-GB') + ' ' + n.label.replace(/^\S+ \S+ /, '') }),
        ' ', noticeText(n),
      ))),
    );
  }

  // Shown on member pages while no slot is found, since the site blocks DevTools.
  function statusText() {
    if (!/\/member\//.test(location.pathname) || window !== window.top && !document.getElementById('ticket_list')) return null;
    if (status.error) return 'Error: ' + status.error;
    return document.getElementById('ticket_list')
      ? `Waiting for slots (${document.querySelectorAll('.ticket_list__title').length} titles found)`
      : 'Waiting for the stake list…';
  }

  let rendered = '';
  let renderedData = '';
  let changedAt = null;
  let alertedAt = null;
  function render(force) {
    const message = last && last.slots.length ? null : statusText();
    const data = JSON.stringify(last && last.slots.map(s => [s.label, s.visible, sidesOf(s).map(x => [x.stake, x.total, x.count])]));
    const key = JSON.stringify([collapsed, message, data, status.saveError, status.recording, notices.length, notices[0] && +notices[0].at, collapsed && unseen]);
    if (key === rendered && !force) return;
    rendered = key;
    if (data !== renderedData) {
      renderedData = data;
      changedAt = new Date();
    }

    if (!message && !(last && last.slots.length)) {
      if (panel) panel.remove();
      panel = null;
      return;
    }
    if (!panel || !panel.isConnected) {
      panel = h('div', { id: PANEL_ID });
      document.body.append(panel);
    }
    const head = h('div', { className: 'kr-head' },
      h('span', { className: 'kr-title', textContent: 'Stake Report' }),
      message ? null : h('span', { className: 'kr-live', textContent: '● ' + changedAt.toLocaleTimeString('en-GB'), title: 'Live: last change' }),
      collapsed && unseen ? h('span', { className: 'kr-badge', textContent: '▼ ' + unseen, title: 'Rows that went down or left the list' }) : null,
      h('button', { className: 'kr-min', textContent: collapsed ? '+' : '−', title: 'Collapse', onclick: () => { collapsed = !collapsed; render(); } }),
    );
    panel.replaceChildren(head);
    // A new notice flashes the panel's border, even while it's collapsed.
    if (unseen && notices[0] && notices[0].at !== alertedAt) {
      alertedAt = notices[0].at;
      panel.classList.remove('kr-alert');
      void panel.offsetWidth; // restart the animation
      panel.classList.add('kr-alert');
    }
    if (collapsed) return;
    if (message) {
      panel.append(h('div', { className: 'kr-status', textContent: message }));
      return;
    }

    // Slots on the open page first, then the ones on the other page tab.
    const slots = [...last.slots].sort((a, b) => b.visible - a.visible);
    panel.append(...slots.map(slotTable));
    if (status.saveError) panel.append(h('div', { className: 'kr-status', textContent: 'Not saved: ' + status.saveError }));
    else if (!status.recording) panel.append(h('div', { className: 'kr-status', textContent: 'Another tab is recording; totals shown are what it saved.' }));
    if (notices.length) panel.append(noticeList(unseen));
    unseen = 0;
    panel.append(h('div', { className: 'kr-actions' },
      h('button', { textContent: 'Copy', onclick: e => copy(e.target) }),
      h('button', { textContent: 'Download', title: 'Save every row of the lists as an Excel file', onclick: e => download(e.target) }),
    ));
    for (const s of last.slots) for (const x of sidesOf(s)) prevTotals.set(s.label + '|' + x.name, x.total);
  }

  async function copy(btn) {
    const text = last.slots.map(s => reportText(s.label, sidesOf(s))).join('\n\n');
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
  }

  // One Excel sheet per slot (day and time) with Rain and No Rain side by side:
  // the rows on the lists now plus the saved rows that have left them, which
  // the totals still count, so the Total lines match the panel.
  const SHEET_COLS = ['Odds', 'Stake', 'Stake x odds / 100', 'On list'];
  const SIDE_WIDTH = SHEET_COLS.length + 1; // an empty column between the sides
  const letter = i => String.fromCharCode(65 + i);
  const timesOdds = r => cents(r.stake * Math.abs(r.odds) / 100);

  function slotSheet(slot, savedRows) {
    const sides = slot.sides.map(s => ({ name: s.name, rows: new Map() }));
    const sideOf = name => sides.find(s => s.name === name);
    for (const [id, r] of Object.entries(savedRows || {})) {
      if (sideOf(r.side)) sideOf(r.side).rows.set(id, { odds: r.odds, stake: r.stake, onList: false });
    }
    for (const side of slot.sides) {
      for (const r of side.rows) sideOf(side.name).rows.set(r.id, { odds: r.odds, stake: r.stake, onList: true });
    }
    const lists = sides.map(s => [...s.rows.values()].sort((a, b) => a.odds - b.odds));

    const bold = v => ({ v, s: 'bold' });
    const put = (row, k, j, v) => { row[k * SIDE_WIDTH + j] = v; };
    const [, day, time] = /^(.*) (\d{1,2}-\d{1,2})$/.exec(slot.label) || [null, slot.label, ''];
    const rows = [[bold('Day'), day, bold('Time'), time], [], []];
    sides.forEach((s, k) => {
      put(rows[1], k, 0, { v: s.name, s: s.name === 'Rain' ? 'rain' : 'noRain' });
      SHEET_COLS.forEach((c, j) => put(rows[2], k, j, bold(c)));
    });

    const first = rows.length + 1; // Excel row number of the first row of stakes
    const height = Math.max(0, ...lists.map(l => l.length));
    for (let n = 0; n < height; n++) {
      const row = [];
      lists.forEach((list, k) => {
        const r = list[n];
        if (!r) return;
        put(row, k, 0, r.odds);
        put(row, k, 1, { v: r.stake, s: 'num' });
        put(row, k, 2, { v: timesOdds(r), s: 'num' });
        put(row, k, 3, r.onList ? 'yes' : 'no');
      });
      rows.push(row);
    }

    // Totals as formulas, so they follow edits made in Excel.
    const end = first + height - 1;
    const range = c => `${letter(c)}${first}:${letter(c)}${end}`;
    const total = [], onList = [];
    const totalRow = rows.length + 2;
    lists.forEach((list, k) => {
      const c = j => k * SIDE_WIDTH + j;
      const sum = (pick, only) => cents(list.filter(r => !only || r.onList).reduce((a, r) => a + pick(r), 0));
      const cellOf = (j, pick, only) => ({
        f: !height ? null : only ? `SUMIF(${range(c(3))},"yes",${range(c(j))})` : `SUM(${range(c(j))})`,
        v: sum(pick, only), s: 'boldNum',
      });
      put(total, k, 0, bold('Total'));
      put(total, k, 1, cellOf(1, r => r.stake));
      put(total, k, 2, cellOf(2, timesOdds));
      put(onList, k, 0, bold('On list now'));
      put(onList, k, 1, cellOf(1, r => r.stake, true));
      put(onList, k, 2, cellOf(2, timesOdds, true));
    });
    // Rain + No Rain, the panel's Total line.
    const both = j => ({
      f: sides.map((_, k) => letter(k * SIDE_WIDTH + j) + totalRow).join('+'),
      v: cents(sides.reduce((a, _, k) => a + total[k * SIDE_WIDTH + j].v, 0)), s: 'boldNum',
    });
    rows.push([], total, onList, [], [bold(sides.map(s => s.name).join(' + ')), both(1), both(2)]);

    return { name: slot.label, rows, widths: [14, 14, 18, 8, 3, 14, 14, 18, 8], freezeRows: 3 };
  }

  async function download(btn) {
    const slots = last.slots;
    let saved = [];
    try {
      const res = await chrome.runtime.sendMessage({ type: 'getRows', labels: slots.map(s => s.label) });
      if (res && res.ok) saved = res.rows;
    } catch (e) { /* the rows on the page are still worth saving */ }

    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const name = `krain-list_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
    const blob = window.KRainXlsx.build(slots.map((slot, i) => slotSheet(slot, saved[i])));
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Download'; }, 1200);
  }

  function update() {
    try {
      last = P.read(document);
      status.error = null;
      if (last) {
        track(last.slots, Date.now());
        save(last.slots);
      }
    } catch (e) {
      last = null;
      status.error = e.message;
    }
    render();
  }

  // The site streams odds over a websocket, so the page rarely goes quiet:
  // read at most every 100 ms instead of waiting for a pause.
  let pending = null;
  const schedule = () => { if (!pending) pending = setTimeout(() => { pending = null; update(); }, 100); };
  new MutationObserver(muts => {
    if (muts.every(m => panel && panel.contains(m.target))) return;
    schedule();
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style'] });

  update();
})();
