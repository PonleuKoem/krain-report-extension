// Receives each read of the betting page from the content script and files it in IndexedDB.
import { saveSlots, getSlots, clearOldRows } from './db.js';

// Only one tab records at a time. Two tabs of the betting page update a moment
// apart, and taking turns would keep putting back stakes that already changed.
// Another tab takes over once the recording tab has been quiet for a while.
const TAKE_OVER_AFTER = 30000;
let recorder = null; // { key, at }

// Row ids are only needed while a slot is live: drop them a day after it last
// changed. Checked when the worker starts and then hourly while it's busy.
const CLEAR_EVERY = 3600000;
let clearedAt = 0;
function clear(now = Date.now()) {
  clearedAt = now;
  clearOldRows(now).catch(e => console.warn('clearOldRows', e));
}
clear();

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'saveSlots') {
    const key = `${sender.tab && sender.tab.id}:${sender.frameId}`;
    const now = Date.now();
    const recording = !recorder || recorder.key === key || now - recorder.at > TAKE_OVER_AFTER;
    if (recording) recorder = { key, at: now };
    if (now - clearedAt > CLEAR_EVERY) clear(now);
    (recording ? saveSlots(msg.slots, now) : getSlots(msg.slots, now))
      .then(slots => reply({ ok: true, recording, slots }), e => reply({ ok: false, error: e.message }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  if (recorder && recorder.key.startsWith(tabId + ':')) recorder = null;
});
