import { query, remove, channel, isoDate } from './db.js';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const side = (r, name) => (r.sides.find(s => s.name === name) || { total: 0, count: 0 });
let shown = [];

function el(tag, props, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
}

// The site lists tomorrow's morning slots in advance, so ranges up to today stay open-ended.
function quickRange(kind) {
  const today = new Date();
  if (kind === 'today') return [isoDate(today), isoDate(today)];
  if (kind === '7') return [isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), ''];
  if (kind === 'month') return [isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), ''];
  return ['', ''];
}

// Filters live in the URL, so a filtered view can be bookmarked or reloaded.
function readFilters() {
  const p = new URLSearchParams(location.search);
  if (!p.has('from') && !p.has('to')) [$('from').value, $('to').value] = quickRange('7');
  else { $('from').value = p.get('from') || ''; $('to').value = p.get('to') || ''; }
  $('session').value = p.get('session') || '';
}

function writeFilters() {
  const p = new URLSearchParams({ from: $('from').value, to: $('to').value, session: $('session').value });
  history.replaceState(null, '', '?' + p);
  for (const b of $('quick').children) {
    const [f, t] = quickRange(b.dataset.range);
    b.classList.toggle('on', f === $('from').value && t === $('to').value);
  }
}

function stat(label, value, cls) {
  return el('div', { className: 'stat ' + (cls || '') }, el('b', { textContent: value }), el('span', { textContent: label }));
}

async function load() {
  writeFilters();
  const session = $('session').value;
  shown = (await query({ from: $('from').value, to: $('to').value })).filter(r => !session || r.session === session);

  const rain = shown.reduce((a, r) => a + side(r, 'Rain').total, 0);
  const noRain = shown.reduce((a, r) => a + side(r, 'No Rain').total, 0);
  const days = new Map();
  for (const r of shown) (days.get(r.date) || days.set(r.date, []).get(r.date)).push(r);

  $('stats').replaceChildren(
    stat('Days', days.size),
    stat('Slots', shown.length),
    stat('Rain', fmt(rain), 'rain'),
    stat('No Rain', fmt(noRain), 'norain'),
    stat('Total', fmt(rain + noRain)),
  );

  if (!shown.length) {
    $('out').replaceChildren(el('div', { className: 'empty', textContent: 'No reports for this filter. Open the krain88 betting page and slots are saved as you watch.' }));
    return;
  }

  const head = el('tr', null, ['Day / slot', 'Rain', 'Rows', 'No Rain', 'Rows', 'Total', 'Last update'].map(t => el('th', { textContent: t })));
  const body = [];
  for (const [date, rows] of days) {
    const dRain = rows.reduce((a, r) => a + side(r, 'Rain').total, 0);
    const dNo = rows.reduce((a, r) => a + side(r, 'No Rain').total, 0);
    const day = new Date(date + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    body.push(el('tr', { className: 'day' },
      el('td', { textContent: day }), el('td', { className: 'rain', textContent: fmt(dRain) }), el('td'),
      el('td', { className: 'norain', textContent: fmt(dNo) }), el('td'), el('td', { textContent: fmt(dRain + dNo) }), el('td')));
    for (const r of rows) {
      const a = side(r, 'Rain'), b = side(r, 'No Rain');
      body.push(el('tr', null,
        el('td', { textContent: r.session.replace('-', ' - ') }),
        el('td', { className: 'rain', textContent: fmt(a.total) }), el('td', { className: 'muted', textContent: a.count }),
        el('td', { className: 'norain', textContent: fmt(b.total) }), el('td', { className: 'muted', textContent: b.count }),
        el('td', { textContent: fmt(r.total) }),
        el('td', { className: 'muted', textContent: new Date(r.updatedAt).toLocaleString('en-GB') })));
    }
  }
  $('out').replaceChildren(el('table', null, head, body));
}

$('quick').onclick = e => {
  const range = e.target.dataset && e.target.dataset.range;
  if (!range) return;
  [$('from').value, $('to').value] = quickRange(range);
  load();
};
for (const id of ['from', 'to', 'session']) $(id).onchange = load;

$('csv').onclick = () => {
  if (!shown.length) return;
  const lines = [['Date', 'Slot', 'Rain', 'Rain rows', 'No Rain', 'No Rain rows', 'Total', 'Updated'].join(',')];
  for (const r of shown) {
    const a = side(r, 'Rain'), b = side(r, 'No Rain');
    lines.push([r.date, r.session, a.total, a.count, b.total, b.count, r.total, `"${new Date(r.updatedAt).toLocaleString('en-GB')}"`].join(','));
  }
  const link = el('a', {
    href: URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })),
    download: `krain-report-${$('from').value || 'start'}_${$('to').value || 'end'}.csv`,
  });
  link.click();
};

$('delete').onclick = async () => {
  if (!shown.length || !confirm(`Delete the ${shown.length} slot report(s) shown? This cannot be undone.`)) return;
  await remove(shown.map(r => r.id));
  load();
};

// New totals arrive many times a second while the betting page is open; redraw at most twice a second.
let pending = null;
channel.onmessage = () => { if (!pending) pending = setTimeout(() => { pending = null; load(); }, 500); };

readFilters();
load();
