// Reads the Rain / No Rain stake lists from the krain88 betting page.
// The page keeps every time slot in the DOM at once, hidden ones too:
//   .ticket_list__title (n-th)        -> date + "18 - 06" of slot n
//   #ticket_list table[name=rainN]    -> Rain rows of slot n
//   #ticket_list table[name=noRainN]  -> No Rain rows of slot n
// Each row is <tr id><td><span>stake</span><span>odds</span></td></tr>;
// a row counts stake * |odds| / 100.
// Exposed as window.KRainParser.
(function (root) {
  const SIDES = [
    { key: 'rain', name: 'Rain' },
    { key: 'noRain', name: 'No Rain' },
  ];

  const norm = s => s.replace(/\s+/g, ' ').trim();
  const toNumber = s => parseFloat(s.replace(/,/g, ''));

  // "Oct 24" + "18 - 06" -> "OCT 24 18-06"; blank titles (unused slots) -> null.
  function slotLabel(title) {
    const date = norm((title.querySelector('.date') || {}).textContent || '');
    const time = norm((title.querySelector('.time-session') || {}).textContent || '').replace(/\s*[-–]\s*/, '-');
    if (!date || !/^\d{1,2}-\d{1,2}$/.test(time)) return null;
    return `${date.toUpperCase()} ${time}`;
  }

  // Each row is a price level: its id ("-7_5_25045_1" = odds, slot, side) stays
  // the same while other players add to or take from its stake.
  function readSide(list, key, i, name) {
    const table = list.querySelector(`table[name="${key}${i}"]`);
    const rows = [];
    if (table) {
      for (const tr of table.querySelectorAll('tr')) {
        const [stake, odds] = [...tr.querySelectorAll('td > span')].map(c => toNumber(c.textContent));
        if (tr.id && !isNaN(stake) && !isNaN(odds)) rows.push({ id: tr.id, stake, odds });
      }
    }
    // What the list shows right now; the saved total also keeps rows that have left it.
    const total = Math.round(rows.reduce((a, r) => a + r.stake * Math.abs(r.odds) / 100, 0) * 100) / 100;
    return { name, count: rows.length, total, rows };
  }

  function read(doc) {
    doc = doc || document;
    const list = doc.getElementById('ticket_list');
    if (!list) return null;
    const titles = [...doc.querySelectorAll('.ticket_list__title')];
    const slots = [];
    titles.forEach((title, i) => {
      const label = slotLabel(title);
      if (!label) return;
      slots.push({
        label,
        visible: getComputedStyle(title).display !== 'none',
        sides: SIDES.map(s => readSide(list, s.key, i, s.name)),
      });
    });
    return { slots };
  }

  root.KRainParser = { read, toNumber };
})(window);
