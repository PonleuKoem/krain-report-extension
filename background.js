// Receives slot totals from the content script and files them in IndexedDB.
import { saveSlots } from './db.js';

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'saveSlots') {
    saveSlots(msg.slots).then(() => reply({ ok: true }), e => reply({ ok: false, error: e.message }));
    return true;
  }
});

// Reports saved by version 1.0 lived in chrome.storage; move them over once.
chrome.runtime.onInstalled.addListener(async () => {
  const { reports } = await chrome.storage.local.get('reports');
  if (!reports) return;
  for (const r of Object.values(reports)) await saveSlots([r], r.updatedAt || Date.now());
  await chrome.storage.local.remove('reports');
});
