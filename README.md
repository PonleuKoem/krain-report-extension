# KRain Stake Report

Adds up the **Stake** column on the Rain and No Rain sides of the krain88 betting page, for each time slot (18 - 06, 06 - 12, 06 - 18).

## Install (desktop Chrome)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this `krain-report-extension` folder
4. Log in to krain88 and open the betting page

## Use

- A small panel appears at the bottom right with the Rain total, No Rain total and grand total for every slot. It updates on its own when the numbers change.
- Slots on the other page tab (e.g. 06 - 18 while "18:00-06:00 & 06:00-12:00" is open) are read too, without clicking; they are shown dimmed.
- **Copy** copies a text report of the slots on the page.
- Every slot is saved day by day in the extension's IndexedDB (one record per day and slot, kept up to date while you watch).
- The toolbar icon opens a popup with the latest day's slots. **All reports** opens the report page, where you can filter by date range (Today, Last 7 days, This month, All, or any From / To) and slot, see day subtotals, **Export CSV** and **Delete shown**.

## Notes

- The extension reads the site's slot lists (`#ticket_list` tables `rainN` / `noRainN`) directly, so any page language works. If the site changes that markup, `parser.js` needs updating.
- Rows hidden below the scroll in a list are counted too.
- Only the order book (top stake lists) is counted, not Pending Order, Bet Order or Confirm Transaction.
- The site shows slot dates without a year ("Oct 24"); the year closest to today is used. The 18 - 06 slot is filed under the day it starts.
- Removing the extension deletes its saved reports. Export a CSV first if you need them.
