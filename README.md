# Briefing vol planeur

Glider briefing for La Montagne Noire (LFMG), shown as a [reveal.js](https://revealjs.com) slideshow that loops on a screen. Every slide pulls the day's data from public sources:

- fronts (KNMI), satellite and rain radar (meteox), AROME rain forecast (meteociel)
- thermal forecast (meteo-parapente), Windy wind maps from the ground to 600 hPa, modelled soundings (meteociel)
- NOTAM map, SUP AIP and AZBA links
- flight level table from the QNH of Castres-Mazamet (LFCK), sunset, and end of flights at aeronautical night (sunset + 30 min)
- tomorrow's fronts and forecast

## Running

```sh
git clone --recurse-submodules https://github.com/bnogaro/vvmn-briefing.git
```

In an existing clone, run `git submodule update --init` to fetch reveal.js. Then open `index.html` in a browser; there is no build step.

The QNH comes from the LFCK METAR through [CheckWX](https://www.checkwxapi.com). Its free API key is set in `js/briefing.js` and is readable by anyone who loads the page.

## Flight level table

Altitudes are computed with the ICAO standard atmosphere for the METAR QNH and rounded down to 5 m, since these levels are used as ceilings. When no QNH is available, the table shows dashes instead of altitudes. This is a briefing aid: check the QNH and airspace limits through official sources.

## Tests

Requires Node.js 22 or later.

```sh
npm install
npm test
```

The tests load `index.html` in [jsdom](https://github.com/jsdom/jsdom) with the network stubbed and the clock fixed, so they run offline. GitHub Actions runs them on every push to `main` and on pull requests.

## Releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org); `cz bump` sets the version and updates `CHANGELOG.md`.

A commitizen hook rejects commit messages that don't follow the convention. After cloning, set it up once with [prek](https://github.com/j178/prek):

```sh
uv tool install prek
prek install
```
