import { query, channel, stakeOf } from './db.js';

const fmt = n => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const out = document.getElementById('out');
const SIDES = ['Rain', 'No Rain'];
const side = (r, name) => (r.sides.find(s => s.name === name) || { total: 0 });
const plus = (a, b) => a == null || b == null ? null : a + b;
const totalStake = r => SIDES.map(n => stakeOf(r, n)).reduce(plus, 0);

function cell(tag, text, cls) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

// Slots from the latest read of the betting page: every read saves all slots
// on the page with the same timestamp, so they are the ones with the newest updatedAt.
async function current() {
  const all = await query();
  const latest = Math.max(...all.map(r => r.updatedAt));
  return all.filter(r => r.updatedAt === latest).sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session));
}

async function load() {
  const list = await current();
  out.replaceChildren();
  if (!list.length) {
    out.append(cell('div', 'No data yet. Open the krain88 betting page and the totals will appear here.', 'empty'));
    return list;
  }
  out.append(cell('div', 'Last seen ' + new Date(list[0].updatedAt).toLocaleString('en-GB'), 'day'));
  const table = document.createElement('table');
  const row = (cls, ...cells) => {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    tr.append(...cells);
    table.append(tr);
  };
  for (const r of list) {
    row('slot', cell('th', r.label), cell('th', 'Stake'), cell('th', '× odds'));
    for (const [name, cls] of [['Rain', 'rain'], ['No Rain', 'norain']])
      row(cls, cell('td', name), cell('td', fmt(stakeOf(r, name)), 'stake'), cell('td', fmt(side(r, name).total)));
    row('sum', cell('td', 'Total'), cell('td', fmt(totalStake(r)), 'stake'), cell('td', fmt(r.total)));
  }
  out.append(table);
  return list;
}

document.getElementById('copy').onclick = async e => {
  const list = await load();
  const line = (name, stake, total) => `${name}: stake ${fmt(stake)}, × odds ${fmt(total)}`;
  const text = list.map(r => [r.label, ...r.sides.map(s => line(s.name, stakeOf(r, s.name), s.total)), line('Total', totalStake(r), r.total)].join('\n')).join('\n\n');
  await navigator.clipboard.writeText(text);
  e.target.textContent = 'Copied';
  setTimeout(() => { e.target.textContent = 'Copy'; }, 1200);
};

document.getElementById('reports').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });

channel.onmessage = load;
load();
