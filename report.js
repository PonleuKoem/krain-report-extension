import { query, remove, channel, isoDate, stakeOf } from './db.js';

const $ = id => document.getElementById(id);
const fmt = n => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const SIDES = [['Rain', 'rain'], ['No Rain', 'norain']];
const side = (r, name) => (r.sides.find(s => s.name === name) || { stake: 0, total: 0, count: 0 });
// A sum with any unknown part is unknown.
const sum = (list, f) => list.reduce((a, x) => { const v = f(x); return a == null || v == null ? null : a + v; }, 0);
const dayName = date => new Date(date + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
let shown = [];

function el(tag, props, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  for (const c of children.flat(Infinity)) if (c != null) e.append(c);
  return e;
}
const td = (text, className = '') => el('td', { className, textContent: text });

// The site lists tomorrow's morning slots in advance, so ranges up to today stay open-ended.
function quickRange(kind) {
  const today = new Date();
  if (kind === 'today') return [isoDate(today), isoDate(today)];
  if (kind === '7') return [isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), ''];
  if (kind === 'month') return [isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), ''];
  return ['', ''];
}

// Filters live in the URL, so a filtered view can be bookmarked or reloaded. Without any, every report is shown.
function readFilters() {
  const p = new URLSearchParams(location.search);
  $('from').value = p.get('from') || '';
  $('to').value = p.get('to') || '';
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

// Totals of a list of slot records: per side and overall, stake and × odds.
function totals(list) {
  const out = {};
  for (const [name] of SIDES) out[name] = { stake: sum(list, r => stakeOf(r, name)), total: list.reduce((a, r) => a + side(r, name).total, 0) };
  out.all = { stake: sum(SIDES, ([n]) => out[n].stake), total: SIDES.reduce((a, [n]) => a + out[n].total, 0) };
  return out;
}

function card(name, cls, t) {
  return el('div', { className: 'card ' + cls },
    el('div', { className: 'name', textContent: name + ' · × odds' }),
    el('div', { className: 'big', textContent: fmt(t.total) }),
    el('div', { className: 'small', textContent: 'Stake ' + fmt(t.stake) }));
}

function rangeText() {
  const [f, t] = [$('from').value, $('to').value];
  const slot = $('session').value ? ` · slot ${$('session').value.replace('-', ' - ')}` : '';
  const span = !f && !t ? 'All saved days' : f && t && f === t ? dayName(f) : `${f ? dayName(f) : 'First day'} – ${t ? dayName(t) : 'latest'}`;
  return span + slot;
}

// One table row: label, then stake / × odds / rows for each side, then the total stake / × odds.
function row(cls, label, labelCls, t, counts, when) {
  return el('tr', { className: cls },
    td(label, labelCls),
    SIDES.map(([name, c], i) => [
      td(fmt(t[name].stake), `${c} stake split`),
      td(fmt(t[name].total), c),
      td(counts ? counts[i] : '', 'rows'),
    ]),
    td(fmt(t.all.stake), 'stake split'),
    td(fmt(t.all.total), 'total'),
    td(when || '', 'when'));
}

async function load() {
  writeFilters();
  $('range').textContent = rangeText();
  const session = $('session').value;
  shown = (await query({ from: $('from').value, to: $('to').value })).filter(r => !session || r.session === session);

  const all = totals(shown);
  $('summary').replaceChildren(card('Rain', 'rain', all.Rain), card('No Rain', 'norain', all['No Rain']), card('Total', '', all.all));

  const days = new Map();
  for (const r of shown) (days.get(r.date) || days.set(r.date, []).get(r.date)).push(r);
  $('count').textContent = `${days.size} day${days.size === 1 ? '' : 's'} · ${shown.length} slot${shown.length === 1 ? '' : 's'}`;
  for (const id of ['csv', 'print', 'delete']) $(id).disabled = !shown.length;

  if (!shown.length) {
    $('out').replaceChildren(el('div', { className: 'empty', textContent: 'No reports for this filter. Open the krain88 betting page and slots are saved as you watch.' }));
    return;
  }

  const head = el('thead', null,
    el('tr', { className: 'group' },
      el('th'),
      SIDES.map(([name, c]) => el('th', { className: c + ' split', colSpan: 3, textContent: name })),
      el('th', { className: 'split', colSpan: 2, textContent: 'Total' }),
      el('th')),
    el('tr', null,
      el('th', { textContent: 'Day / slot' }),
      SIDES.map(() => [el('th', { className: 'split', textContent: 'Stake' }), el('th', { textContent: '× odds' }), el('th', { textContent: 'Rows' })]),
      el('th', { className: 'split', textContent: 'Stake' }), el('th', { textContent: '× odds' }),
      el('th', { textContent: 'Updated' })));

  const body = [];
  for (const [date, list] of days) {
    body.push(row('day', dayName(date), '', totals(list)));
    for (const r of list) {
      body.push(row('slot', r.session.replace('-', ' - '), 'slotname', totals([r]),
        SIDES.map(([n]) => side(r, n).count),
        new Date(r.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
    }
  }
  const foot = el('tfoot', null, row('', 'Total', '', all));
  $('out').replaceChildren(el('table', null, head, el('tbody', null, body), foot));
}

$('quick').onclick = e => {
  const range = e.target.dataset && e.target.dataset.range;
  if (!range) return;
  [$('from').value, $('to').value] = quickRange(range);
  load();
};
for (const id of ['from', 'to', 'session']) $(id).onchange = load;

// CSV with one line per slot; the BOM makes Excel read it as UTF-8.
function download(list, name) {
  const csv = n => n == null ? '' : n;
  const lines = [['Date', 'Slot', 'Rain stake', 'Rain x odds', 'Rain rows', 'No Rain stake', 'No Rain x odds', 'No Rain rows', 'Total stake', 'Total x odds', 'Updated'].join(',')];
  for (const r of list) {
    const a = side(r, 'Rain'), b = side(r, 'No Rain');
    const aStake = stakeOf(r, 'Rain'), bStake = stakeOf(r, 'No Rain');
    lines.push([r.date, r.session, csv(aStake), a.total, a.count, csv(bStake), b.total, b.count, csv(sum([aStake, bStake], x => x)), r.total, `"${new Date(r.updatedAt).toLocaleString('en-GB')}"`].join(','));
  }
  const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
  el('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('csv').onclick = () => {
  if (!shown.length) return;
  const slot = $('session').value ? '_' + $('session').value : '';
  download(shown, `krain-report_${$('from').value || 'start'}_${$('to').value || 'latest'}${slot}.csv`);
};

$('csv-all').onclick = async () => {
  const list = await query();
  if (!list.length) return alert('No reports saved yet.');
  download(list, `krain-report_all_${isoDate(new Date())}.csv`);
};

$('print').onclick = () => window.print();

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
