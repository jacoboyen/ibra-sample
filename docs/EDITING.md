# Updating the IBRA website

You never need to touch code. There are three places information comes from.

## 1. Races → Google Calendar

The race calendar is the IBRA Google Calendar (iowabicycleracing@gmail.com). Add, move or cancel races there as you always have. The website picks up changes **within about 3 hours**.

**Title format:** start each title with a discipline prefix and a colon.

| Type this | Shows as |
|---|---|
| `RR: Spring Road Race` | Road |
| `CRIT: Downtown Criterium` | Criterium |
| `TT: Lake Time Trial` | Time trial |
| `STAGE: Tour of Somewhere` | Stage race |
| `GRAVEL: County Line Gravel` | Gravel |
| `CX: Riverside Cross` | Cyclocross |
| `MTB: Ridge Trail Race` | Mountain bike |
| `TRACK: Velodrome Series` | Track |

A title with no prefix still shows up, labeled "Other". The prefix list can be changed in **Site settings**.

**Make the event all-day.** Multi-day races: set the start and end days and the site shows the full span.

**In the description, add the permit number** on its own line, like `Permit: 2027-1234`. That's how the site finds the race's BikeReg listing and shows the **Register** link automatically. You can also paste the BikeReg link or the event website into the description.

**Cancelled race:** put `CANCELLED:` at the start of the title (e.g. `CANCELLED: RR: Spring Road Race`) or delete the event.

**Don't use "repeat" events.** Enter each race date as its own event.

## 2. Board, documents and page text → Pages CMS

1. Go to **https://app.pagescms.org** and sign in with your GitHub account (ask the webmaster to add you to the repository first).
2. Open the **ibra-sample** project.
3. Pick what to edit from the left menu: **Board members**, **Budget & documents**, **About page text**, **Promoters page** or **Site settings**.
4. Make your change and click **Save**. The site updates in a few minutes.

To post a budget: **Budget & documents** → **Add an entry** → fill in the title, type and year → upload the PDF → **Save**.

## 3. Results → USA Cycling

Results are published by USA Cycling. The site links to them; nothing to update.

## Refresh right now

Don't want to wait 3 hours? On GitHub open the repository → **Actions** → **Build and deploy** → **Run workflow**.

## When something looks wrong

If a race's date on the IBRA calendar doesn't match its BikeReg listing, the site opens a GitHub issue titled **"Race calendar needs a look"**, and repository watchers get an email. Fix whichever date is wrong; the issue's text updates on the next run, and you can close it.
