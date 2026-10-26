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

  const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  // Saved totals once the background has answered, what the page shows until then.
  const sidesOf = slot => saved.get(slot.label) || slot.sides;
  const grand = sides => sides.reduce((a, s) => a + s.total, 0);

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
    return [label, ...sides.map(s => `${s.name}: ${fmt(s.total)}`), `Total: ${fmt(grand(sides))}`].join('\n');
  }

  // Totals shown last time, so a total that just changed can flash.
  const prevTotals = new Map();
  const changed = (label, side) => {
    const prev = prevTotals.get(label + '|' + side.name);
    return prev != null && prev !== side.total;
  };

  function slotTable(slot) {
    return h('table', { className: 'kr-table' + (slot.visible ? '' : ' kr-hidden') },
      h('tr', { className: 'kr-slot' }, h('td', { colSpan: 3, textContent: slot.label + (slot.visible ? '' : ' (other page)') })),
      sidesOf(slot).map((s, i) => h('tr', { className: i === 0 ? 'kr-a' : 'kr-b' },
        h('td', { textContent: s.name }),
        h('td', { className: 'kr-num' + (changed(slot.label, s) ? ' kr-flash' : ''), textContent: fmt(s.total) }),
        h('td', { className: 'kr-cnt', textContent: `${s.count} rows` }),
      )),
      h('tr', { className: 'kr-sum' },
        h('td', { textContent: 'Total' }),
        h('td', { className: 'kr-num', textContent: fmt(grand(sidesOf(slot))) }),
        h('td'),
      ),
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
  function render(force) {
    const message = last && last.slots.length ? null : statusText();
    const data = JSON.stringify(last && last.slots.map(s => [s.label, s.visible, sidesOf(s).map(x => [x.total, x.count])]));
    const key = JSON.stringify([collapsed, message, data, status.saveError, status.recording]);
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
      h('button', { className: 'kr-min', textContent: collapsed ? '+' : '−', title: 'Collapse', onclick: () => { collapsed = !collapsed; render(); } }),
    );
    panel.replaceChildren(head);
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
    panel.append(h('div', { className: 'kr-actions' }, h('button', { textContent: 'Copy', onclick: e => copy(e.target) })));
    for (const s of last.slots) for (const x of sidesOf(s)) prevTotals.set(s.label + '|' + x.name, x.total);
  }

  async function copy(btn) {
    const text = last.slots.map(s => reportText(s.label, sidesOf(s))).join('\n\n');
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
  }

  function update() {
    try {
      last = P.read(document);
      status.error = null;
      if (last) save(last.slots);
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
