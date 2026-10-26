# KRain Stake Report

Adds up **stake × odds / 100** for every row on the Rain and No Rain sides of the krain88 betting page, for each time slot (18 - 06, 06 - 12, 06 - 18).

## Install (desktop Chrome)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `krain-report-extension` folder
4. Log in to krain88 and open the betting page

## Use

- A small panel appears at the bottom right with the Rain total, No Rain total and grand total for every slot. It updates on its own when the numbers change.
- Totals keep rows that have left the lists (see *How rows are counted*). With the betting page open in two tabs, only one records; the other shows its totals.
- Slots on the other page tab (e.g. 06 - 18 while "18:00-06:00 & 06:00-12:00" is open) are read too, without clicking; they are shown dimmed.
- **Copy** copies a text report of the slots on the page.
- Every slot is saved day by day in the extension's IndexedDB (one record per day and slot, kept up to date while you watch).
- The toolbar icon opens a popup with the latest day's slots. **All reports** opens the report page, where you can filter by date range (Today, Last 7 days, This month, All, or any From / To) and slot, see day subtotals, **Export CSV** and **Delete shown**.

## How rows are counted

Each row on the site is a price level with a fixed id (`-7_5_25045_1` = odds -7.5, slot 25045, Rain). Other players add to and take from its stake, and the row can leave the list and come back. The extension remembers every id it has seen in a slot with the **last stake it showed**:

| The row… | It counts |
|---|---|
| appears (10,000) | 10,000 |
| changes to 15,000 | 15,000 |
| changes to 12,000 | 12,000 |
| leaves the list | still 12,000 (nothing deducted) |
| comes back (3,000) | 3,000 |

(each stake then × odds / 100). The "rows" count is how many ids the slot has had.

- Only what the extension sees is counted: a change made while the page is closed is picked up the next time the row shows, but a row that leaves while the page is closed keeps the stake it last showed.
- The row ids are only kept while a slot is live: a day after a slot last changed they are deleted and its totals are final. The report keeps those totals.

## Notes

- The extension reads the site's slot lists (`#ticket_list` tables `rainN` / `noRainN`) directly, so any page language works. If the site changes that markup, `parser.js` needs updating.
- Each row counts `stake × odds / 100`, with the odds' minus sign dropped (e.g. 22,100 at -7.5 → 1,657.50).
- Rows hidden below the scroll in a list are counted too.
- Only the order book (top stake lists) is counted, not Pending Order, Bet Order or Confirm Transaction.
- The site shows slot dates without a year ("Oct 24"); the year closest to today is used. The 18 - 06 slot is filed under the day it starts.
- Removing the extension deletes its saved reports. Export a CSV first if you need them.
