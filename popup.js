import { query, channel } from './db.js';

const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const out = document.getElementById('out');
const side = (r, name) => (r.sides.find(s => s.name === name) || { total: 0 });

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
  const head = document.createElement('tr');
  head.append(cell('th', 'Slot'), cell('th', 'Rain'), cell('th', 'No Rain'), cell('th', 'Total'));
  table.append(head);
  for (const r of list) {
    const tr = document.createElement('tr');
    tr.append(cell('td', r.label), cell('td', fmt(side(r, 'Rain').total), 'rain'), cell('td', fmt(side(r, 'No Rain').total), 'norain'), cell('td', fmt(r.total)));
    table.append(tr);
  }
  out.append(table);
  return list;
}

document.getElementById('copy').onclick = async e => {
  const list = await load();
  const text = list.map(r => [r.label, ...r.sides.map(s => `${s.name}: ${fmt(s.total)}`), `Total: ${fmt(r.total)}`].join('\n')).join('\n\n');
  await navigator.clipboard.writeText(text);
  e.target.textContent = 'Copied';
  setTimeout(() => { e.target.textContent = 'Copy'; }, 1200);
};

document.getElementById('reports').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });

channel.onmessage = load;
load();
