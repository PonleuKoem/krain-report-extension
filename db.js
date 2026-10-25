// IndexedDB store of slot totals, one record per day and time slot.
// Lives in the extension's own origin: the background worker writes it,
// the popup and report page read it. Content scripts can't open it directly
// (their IndexedDB would belong to krain88.com), so they message the worker.
//
// Record: { id: '2026-10-24 18-06', date: '2026-10-24', session: '18-06', label,
//           sides: [{ name, total, count }], total, firstSeen, updatedAt }

const DB_NAME = 'krain-report';
const STORE = 'slots';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const HALF_YEAR = 183 * 24 * 3600 * 1000;

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

// slots: [{ label, sides: [{ name, total, count }] }] as read from the page.
export async function saveSlots(slots, now = Date.now()) {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const slot of slots) {
    const key = parseLabel(slot.label, now);
    if (!key) continue;
    const prev = await done(store.get(key.id));
    store.put({
      ...key,
      label: slot.label,
      sides: slot.sides.map(s => ({ name: s.name, total: s.total, count: s.count })),
      total: slot.sides.reduce((a, s) => a + s.total, 0),
      firstSeen: prev ? prev.firstSeen : now,
      updatedAt: now,
    });
  }
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  channel.postMessage('changed');
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
