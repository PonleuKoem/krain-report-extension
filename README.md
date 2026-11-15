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
- **Download** saves every row of the lists as an Excel file (`krain-list_<date>_<time>.xlsx`, also opens in Google Sheets and Numbers) with one sheet per slot, named by its day and time (e.g. `NOV 14 18-06`).
  - Each sheet shows its Day and Time at the top, then Rain and No Rain side by side: odds, stake, stake × odds / 100, and whether the row is on the list now.
  - Rows that have left the list but still count are included with *On list* = `no`, so each side's **Total** matches the panel. **On list now** sums only the rows the site shows right now, and **Rain + No Rain** is the panel's Total line. The totals are formulas, so they update if you edit a stake in Excel.
- **Changes** lists every row whose stake went down or that left the list, with the time, slot, side and odds, e.g. `Rain -7.5 went down 15,000 → 12,000 (stake −3,000, × odds −225)` or `Rain -8 left the list at 10,000, still counted`. A row that comes back lower is listed too. New changes flash the panel's border, and a red badge counts them while the panel is collapsed. **Clear** empties the list.
  - A row has to stay gone for 1.5 s to count as left, so the site redrawing a list doesn't raise notices. When more than 3 rows leave a slot at once they are one notice.
  - Changes are compared from when the page was opened, per tab, and are not saved: reloading the page empties the list.
- Every slot is saved day by day in the extension's IndexedDB (one record per day and slot, kept up to date while you watch).
- The toolbar icon opens a popup with the latest day's slots. **All reports** opens the report page:
  - It shows every saved day by default, newest first: each day with its subtotal, then its slots, and a grand total at the bottom. Rain, No Rain and Total cards at the top sum what is shown.
  - Filter with **Today**, **Last 7 days**, **This month**, **All**, any **From** / **To** date, or one slot. The filter is kept in the page address, so a filtered view can be bookmarked.
  - **Download CSV** saves the slots shown, **Download all** saves every saved slot whatever the filter, one line per slot (opens in Excel or Google Sheets). **Print / PDF** prints the page, or saves it as a PDF from the print dialog.
  - **Delete shown…** deletes the slots shown, after asking.

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
- Next to each `× odds` total the panel and report also show the plain sum of the stakes. Slots saved before stake sums were kept show "—" there once their rows are dropped.
- Rows hidden below the scroll in a list are counted too.
- Only the order book (top stake lists) is counted, not Pending Order, Bet Order or Confirm Transaction.
- The site shows slot dates without a year ("Oct 24"); the year closest to today is used. The 18 - 06 slot is filed under the day it starts.
- Removing the extension deletes its saved reports. Export a CSV first if you need them.
