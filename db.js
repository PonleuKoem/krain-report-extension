// IndexedDB store of slot totals, one record per day and time slot.
// Lives in the extension's own origin: the background worker writes it,
// the popup and report page read it. Content scripts can't open it directly
// (their IndexedDB would belong to krain88.com), so they message the worker.
//
// Record: { id: '2026-10-24 18-06', date: '2026-10-24', session: '18-06', label,
//           sides: [{ name, total, count }], total, firstSeen, updatedAt,
//           slotId: '25045', rows: { [tr id]: { side, odds, stake } } }
// rows remembers every price level seen, with the stake it last showed.
// A day after a slot last changed its rows are dropped (rowsCleared: true)
// and its totals are final.

const DB_NAME = 'krain-report';
const STORE = 'slots';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY = 24 * 3600 * 1000;
const HALF_YEAR = 183 * DAY;

// Tells open extension pages that records changed.
export const channel = new BroadcastChannel('krain-report');

let dbPromise = null;
function open() {
  dbPromise = dbPromise || new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('date', 'date');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const pad = n => String(n).padStart(2, '0');
export const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "OCT 24 18-06" has no year: take the one that puts the date closest to `now`,
// so a December slot read in early January lands in the previous year.
export function parseLabel(label, now = Date.now()) {
  const m = /^([A-Z]{3}) (\d{1,2}) (\d{1,2})-(\d{1,2})$/.exec(label);
  const month = m && MONTHS.indexOf(m[1]);
  if (!m || month < 0) return null;
  let year = new Date(now).getFullYear();
  const at = y => new Date(y, month, +m[2]).getTime();
  if (at(year) - now > HALF_YEAR) year--;
  else if (now - at(year) > HALF_YEAR) year++;
  const date = isoDate(new Date(at(year)));
  const session = `${pad(m[3])}-${pad(m[4])}`;
  return { id: `${date} ${session}`, date, session };
}

const cents = n => Math.round(n * 100) / 100;
const slotIdOf = rowId => (/_(\d+)_\d+$/.exec(rowId) || [])[1];

// Folds one read of a slot into its saved rows. Each row counts the stake it
// showed on the latest read that had it: a changed stake, up or down, replaces
// the old one, and a row that left the list keeps counting its last stake.
// Returns null when the read doesn't belong to this record (see below).
export function mergeRows(prev, slot) {
  const ids = new Set(slot.sides.flatMap(s => s.rows.map(r => slotIdOf(r.id))).filter(Boolean));
  // Rows of another slot under this title mean the page is mid-redraw.
  if (ids.size > 1 || prev && prev.slotId && ids.size && !ids.has(prev.slotId)) return null;
  // Without its rows a finished slot would start again from zero.
  if (prev && prev.rowsCleared) return null;
  // Rows saved by version 1.2.0 counted added stake and have no `stake`; start those slots over.
  const kept = prev && prev.rows && Object.values(prev.rows).every(r => 'stake' in r);
  const rows = { ...(kept && prev.rows) };
  for (const side of slot.sides)
    for (const { id, stake, odds } of side.rows) rows[id] = { side: side.name, odds, stake };
  const sides = slot.sides.map(({ name }) => {
    const mine = Object.values(rows).filter(r => r.side === name);
    return { name, total: cents(mine.reduce((a, r) => a + r.stake * Math.abs(r.odds) / 100, 0)), count: mine.length };
  });
  return { slotId: (prev && prev.slotId) || [...ids][0], rows, sides, total: cents(sides.reduce((a, s) => a + s.total, 0)) };
}

const summary = (label, rec) => ({ label, sides: rec ? rec.sides : [] });

// slots: [{ label, sides: [{ name, rows: [{ id, stake, odds }] }] }] as read from the page.
// Returns the saved totals of those slots.
export async function saveSlots(slots, now = Date.now()) {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const out = [];
  for (const slot of slots) {
    const key = parseLabel(slot.label, now);
    if (!key) continue;
    const prev = await done(store.get(key.id));
    const merged = mergeRows(prev, slot);
    if (!merged) { out.push(summary(slot.label, prev)); continue; }
    const rec = { ...key, label: slot.label, ...merged, firstSeen: prev ? prev.firstSeen : now, updatedAt: now };
    store.put(rec);
    out.push(summary(slot.label, rec));
  }
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  channel.postMessage('changed');
  return out;
}

// Saved totals of these slots, without changing anything.
export async function getSlots(slots, now = Date.now()) {
  const store = (await open()).transaction(STORE).objectStore(STORE);
  return Promise.all(slots.map(async slot => {
    const key = parseLabel(slot.label, now);
    return summary(slot.label, key && await done(store.get(key.id)));
  }));
}

// Drops the rows of slots that haven't changed for a day, keeping their totals.
export async function clearOldRows(now = Date.now()) {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).openCursor().onsuccess = e => {
    const cursor = e.target.result;
    if (!cursor) return;
    const { rows, ...rec } = cursor.value;
    if (rows && now - rec.updatedAt > DAY) cursor.update({ ...rec, rowsCleared: true });
    cursor.continue();
  };
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

// Records with from <= date <= to (ISO strings, either may be empty), newest day first.
export async function query({ from = '', to = '' } = {}) {
  const db = await open();
  const range = from && to ? IDBKeyRange.bound(from, to) : from ? IDBKeyRange.lowerBound(from) : to ? IDBKeyRange.upperBound(to) : null;
  const rows = await done(db.transaction(STORE).objectStore(STORE).index('date').getAll(range));
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.session.localeCompare(b.session));
}

export async function remove(ids) {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  for (const id of ids) tx.objectStore(STORE).delete(id);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  channel.postMessage('changed');
}
