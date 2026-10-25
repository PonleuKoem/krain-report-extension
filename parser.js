// Reads the Rain / No Rain stake lists from the krain88 betting page.
// The page keeps every time slot in the DOM at once, hidden ones too:
//   .ticket_list__title (n-th)        -> date + "18 - 06" of slot n
//   #ticket_list table[name=rainN]    -> Rain rows of slot n
//   #ticket_list table[name=noRainN]  -> No Rain rows of slot n
// Each row is <tr><td><span>stake</span><span>odds</span></td></tr>.
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

  function readSide(list, key, i, name) {
    const table = list.querySelector(`table[name="${key}${i}"]`);
    const values = [];
    if (table) {
      for (const tr of table.querySelectorAll('tr')) {
        const cell = tr.querySelector('td > span');
        if (!cell) continue;
        const n = toNumber(cell.textContent);
        if (!isNaN(n)) values.push(n);
      }
    }
    return { name, count: values.length, total: values.reduce((a, b) => a + b, 0), values };
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
