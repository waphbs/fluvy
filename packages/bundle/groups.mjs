/*
 * Where each module of the build goes: the bundle's chunk groups, shared by `vite.config.ts` and the tests that hold a
 * family's words to its chunk (`src/english.test.ts`). A group holds what its test names and nothing it imports
 * (`includeDependenciesRecursively: false`); everything no group names lands in `core`, which every page loads — so a
 * family's English part (`core/src/i18n/locales/en/<part>.json`) is named by the family's group, or core keeps it.
 */

/** A language's catalogue (English is in parts: its core part ships in core, a family's with the family): fetched the first time that language is spoken. */
const LANGUAGE = /\/packages\/core\/src\/i18n\/locales\/([\w-]+)\.json/;

/**
 * What the pages and the settings panel share and a dashboard never needs: the date picker both pages open, the
 * time field inside it, the dropdown; and what the Activity and History pages share — the period they show and its
 * range, the sources they narrow to (`@fluvy/core/sources`), their floating layers, the CSV they write, their chrome's
 * sheet. Fetched with whichever of them opens first; core must not reach for any of it (a static import from core
 * would drag the chunk onto every dashboard — `finish.mjs` refuses such a build).
 */
const PAGES =
  /\/packages\/(cards\/src\/shared\/(date-picker|period|range|layers?|csv)\.ts|core\/src\/sources\.ts|ui\/src\/(controls\/(time-field|select)|styles\/(generated\/)?page)\.ts)/;

/**
 * What only the Activity page uses (all of its folder but the takeover, Lit's `guard` directive its rows keep, and its
 * English): fetched the first time `/logbook` is opened.
 */
const ACTIVITY =
  /\/packages\/(cards\/src\/activity\/(?!takeover\.ts)|core\/src\/activity\/|ui\/src\/controls\/time-(rail|field)\.ts|core\/src\/i18n\/locales\/en\/activity\.json)|\/lit(-html)?\/directives\/guard\.js$/;

/**
 * What only the History page uses (its folder but the takeover, the window it reads — not `series.ts`, which the
 * sensor and energy cards draw their sparklines from — and its English): fetched the first time `/history` is opened.
 */
const HISTORY =
  /\/packages\/(cards\/src\/history\/(?!takeover\.ts)|core\/src\/history\/(?!series\.ts)|core\/src\/i18n\/locales\/en\/history\.json)/;

/** Fluvy's settings panel (all of its folder but the switch that fetches it, and its English), what its Charts tab draws of the chart engine's (`engine/preview.ts`), the community palettes its gallery lists and the little house its preview answers taps with: fetched when `/fluvy` is opened. */
const PANEL =
  /\/packages\/(cards\/src\/(panel\/(?!on-demand\.ts)|chart\/engine\/preview\.ts)|tokens\/src\/palettes\/community\/|demo-home\/src\/simulate\.ts|core\/src\/i18n\/locales\/en\/panel\.json)/;

/** The automatic dashboard's strategy (all of its folder but the definer, and its English): fetched when a dashboard asks for it. */
const STRATEGY =
  /\/packages\/(cards\/src\/strategy\/(?!define\.ts)|core\/src\/i18n\/locales\/en\/strategy\.json)/;

/**
 * The heights counted with the house (what an entity's capabilities draw, what a room holds): the strategy's, fetched
 * with it; every page carries the cards' heights from their configs alone.
 */
const HOUSE_HEIGHTS = /\/packages\/cards\/src\/house-heights\.ts/;

/** Wall mode (the controller in core — its switch stays in core's chunk — and the screensaver, corner and toast in cards; their words are core's `wall`): fetched only on a device that is a wall. */
const WALL = /\/packages\/(core\/src\/wall\/(?!start\.ts)|cards\/src\/wall\/)/;

/** The weather card (its forecast strips and rows): fetched as the bundle starts and defined as it lands. */
const WEATHER = /\/packages\/cards\/src\/(weather-cards\.ts|weather\/)/;

/**
 * The calendar card (its views, what reads its events and its sheet; its editor goes with the forms): fetched as the
 * bundle starts and defined as it lands, as the weather card is (`calendar-family.ts` stays in core: the name, the
 * height).
 */
const CALENDAR =
  /\/packages\/(cards\/src\/(calendar-cards\.ts|calendar\/)|ui\/src\/styles\/(generated\/)?calendar\.ts)/;

/**
 * The media family (the player and the now-playing strip, what only they share, the player's sheet and their
 * English): fetched as the bundle starts and defined as it lands, as the energy family is (`media-family.ts` stays in
 * core: the names, the heights).
 */
const MEDIA =
  /\/packages\/(cards\/src\/(media-cards\.ts|media\/|now-playing\/|shared\/media\.ts)|ui\/src\/styles\/(generated\/)?media\.ts|core\/src\/i18n\/locales\/en\/media\.json)/;

/** The history bars' readings (`readings.ts`, the resets and the steps; `history.ts`, the recorder's history): fetched by the first card that needs them. */
const HISTORY_BARS_READINGS = /\/packages\/cards\/src\/history-bars\/(readings|history)\.ts/;

/**
 * The chart engine (its scales, paths, bars, axes, rings, styles and sheet, the gauges that move and their English,
 * and the tokens' fitting of a house's set of series colours): fetched as the bundle starts, with the families. A core
 * card reaches it through `shared/chart-load.ts` (a dynamic import: the sensor's chart waits on it behind the skeleton
 * it shows while its history loads), a card in a lazy chunk (energy, history bars, the History page, the Chart card)
 * by a static import from its own chunk.
 */
const CHART =
  /\/packages\/(cards\/src\/chart\/(engine\/|english\.ts)|tokens\/src\/build\/series\.ts|core\/src\/i18n\/locales\/en\/chart\.json)/;

/**
 * The Chart card (the card, what reads its series — history, statistics, a list in an attribute, a forecast — its
 * editor and its English, a part of its own): fetched as the bundle starts and defined as it lands, as the items card
 * is (`chart-family.ts` stays in core: the name, the height). A chunk of its own beside the engine's: the sensor's
 * chart waits on that one, which stays as small as it can. Named after the engine: the engine's English is its own.
 */
const CHART_CARD =
  /\/packages\/(cards\/src\/(chart-cards\.ts|chart\/)|core\/src\/i18n\/locales\/en\/chart-card\.json)/;

/**
 * The Energy period card (the strip that drives an Energy date picker's collection, its picker, its sheet and its
 * English; the period's words its followers share are the energy family's, which it imports first) and the Energy
 * usage card (its series and its English): fetched as the bundle starts, as the energy family is, and named before it.
 */
const ENERGY_PERIOD =
  /\/packages\/(cards\/src\/(energy-period-cards\.ts|energy-(period|usage)\/)|core\/src\/i18n\/locales\/en\/energy-(period|usage)\.json)/;

/**
 * The energy family (its cards, the flow's drawing and motion, the model they share, every `energy/` helper but the
 * head's fitting, which the other cards use, its sheet and the family's English): fetched as the bundle starts —
 * `index.ts` announces the cards and imports this without waiting — and defined as it lands. Home Assistant builds a
 * card again the moment its tag is defined, so a dashboard with energy on it shows it; one without never waits.
 */
const ENERGY =
  /\/packages\/(cards\/src\/(energy-cards\.ts|energy\/(?!head\.ts)|energy-flow\/|energy-model\/|energy-devices\/|forecast\/|production\/|history-bars\/|balance\/|grid\/|batteries\/|ev-charger\/|sankey\/|score\/|meters\/)|ui\/src\/styles\/(generated\/)?energy\.ts|core\/src\/i18n\/locales\/en\/energy\.json)/;

/** The cameras' sheet: fetched the first time a Cameras card's round opens it, never by a dashboard that only shows them. */
const CAMERAS_SHEET = /\/packages\/cards\/src\/camera\/sheet\//;

/**
 * The devices family (the lock, the alarm and its keypad, the camera and the cameras, the 3D printer, the job's times
 * the appliances share, the motion sensor a camera's device carries, and their English): fetched as the bundle starts
 * and defined as it lands, as the energy family is (`devices-family.ts` stays in core: the names, the heights; so do the
 * rows the lock shares with the entities card, `lock/rows.ts`).
 */
const DEVICES =
  /\/packages\/(cards\/src\/(devices-cards\.ts|devices\/|camera\/|alarm\/|lock\/lock-card\.ts|printer\/|shared\/(job-time|motion)\.ts)|core\/src\/i18n\/locales\/en\/(devices|job)\.json)/;

/** The appliances' pictures (one product drawing a kind): fetched by the first card that draws one, never at start. */
const APPLIANCE_ART = /\/packages\/cards\/src\/appliance\/art\//;

/**
 * The appliances family (the washer, the dryer, the dishwasher and their kin, the matcher that reads a name among
 * classes of words — the strategy reads its switches through it too, as it reads the kinds — and their English):
 * fetched as the bundle starts and defined as it lands.
 */
const APPLIANCES =
  /\/packages\/(cards\/src\/(appliances-cards\.ts|appliance\/|shared\/words\.ts)|core\/src\/i18n\/locales\/en\/appliances\.json)/;

/**
 * The schedule sheet (its targets, day chips and moment rows): fetched the first time a schedule is opened or added,
 * never by a dashboard that only lists; it reaches the page controls (the time field) through the pages chunk.
 */
const AUTOMATIONS_SHEET = /\/packages\/cards\/src\/automations\/sheet\//;

/**
 * The automations family (the card, its words' layout, the schedule model, the store and the family's English):
 * fetched as the bundle starts and defined as it lands, as the devices family is (`automations-family.ts` stays in
 * core: the name, the height).
 */
const AUTOMATIONS =
  /\/packages\/(cards\/src\/(automations-cards\.ts|automations\/)|core\/src\/i18n\/locales\/en\/automations\.json)/;

/** The alerts' sheet: fetched the first time it is opened, never by a dashboard that only lists. */
const ALERTS_SHEET = /\/packages\/cards\/src\/alerts\/sheet(\.ts|\/)/;

/** The alerts family (the card, what it watches, and its English): fetched as the bundle starts and defined as it lands. */
const ALERTS =
  /\/packages\/(cards\/src\/(alerts-cards\.ts|alerts\/)|core\/src\/i18n\/locales\/en\/alerts\.json)/;

/**
 * The template card (its card, the parsers of its templates' answers, and its English): fetched as the bundle starts
 * and defined as it lands, as the weather card is (`template-family.ts` stays in core: the name, the height).
 */
const TEMPLATE =
  /\/packages\/(cards\/src\/(template-cards\.ts|template\/)|core\/src\/i18n\/locales\/en\/template\.json)/;

/**
 * The web page card (its card, what it decides of an address and a plate's rounds, and its English): fetched as the
 * bundle starts and defined as it lands, as the template card is (`web-family.ts` stays in core: the name, the height).
 */
const WEB =
  /\/packages\/(cards\/src\/(web-cards\.ts|web\/)|core\/src\/i18n\/locales\/en\/web\.json)/;

/**
 * The Slider card (its card on the tile's and its English; its editor goes with the forms; the ruler, the head, the
 * value row and the scales it reads with are core's, the light card's and the tile's): fetched as the bundle starts and
 * defined as it lands, as the web page card is (`slider-family.ts` stays in core: the name, the height).
 */
const SLIDER =
  /\/packages\/(cards\/src\/(slider-cards\.ts|slider\/)|core\/src\/i18n\/locales\/en\/slider\.json)/;

/**
 * The platforms' logos (1.18, #143): the marks of Simple Icons and Material Design Icons adapted to the grid, and
 * Fluvy's monograms for the rest, each registered as `app:<id>` as the chunk lands — fetched by the first remote card
 * that draws an app, never at start, never by a dashboard without one.
 */
const APP_LOGOS = /\/packages\/cards\/src\/app-logos\//;

/**
 * The TV remote card (1.18, #143: its card, its keys and the integrations' commands for them, the platforms it
 * knows by name, and its English; its editor goes with the forms): fetched as the bundle starts and defined as it
 * lands, as the Slider card is (`remote-family.ts` stays in core: the name, the heights).
 */
const REMOTE =
  /\/packages\/(cards\/src\/(remote-cards\.ts|remote\/)|core\/src\/i18n\/locales\/en\/remote\.json)/;

/**
 * The Vehicle card (its card, what finds a car's entities and folds its integration's words, its glyphs and its
 * English): fetched as the bundle starts and defined as it lands, as the Slider card is (`vehicle-family.ts` stays in
 * core: the name, the height). It reads its charge on the car charger's marked ruler, with the energy family.
 */
const VEHICLE =
  /\/packages\/(cards\/src\/(vehicle-cards\.ts|vehicle\/)|core\/src\/i18n\/locales\/en\/vehicle\.json)/;

/** The items' sheet: fetched the first time an item of an Items card is tapped, never by a dashboard that only lists. */
const ITEMS_SHEET = /\/packages\/cards\/src\/items\/sheet\//;

/**
 * The Items card (the card, its fields and presets, and its English): fetched as the bundle starts and defined as it
 * lands, as the template card is (`items-family.ts` stays in core: the name, the height).
 */
const ITEMS =
  /\/packages\/(cards\/src\/(items-cards\.ts|items\/)|core\/src\/i18n\/locales\/en\/items\.json)/;

/**
 * The light card's colour controls (the quick colours' table and row, the hue maths) and the quick colours' grammar
 * they share with the light's editor (`swatches.ts`): fetched by the first colour bulb drawn, or with the forms.
 */
const LIGHT_COLOUR = /\/packages\/cards\/src\/light\/(colour|swatches)\.ts/;

/** The room lights' colour sheet and its hue wheel (#137): fetched the first time a card's colour round is tapped. */
const LIGHTS_COLOUR = /\/packages\/cards\/src\/lights\/sheet\//;

/**
 * A room's quick actions (their sets, levels, taps and holds, #113): fetched as the bundle starts, with the families,
 * so a room card draws them from its first render (`room-card.ts` asks for them itself where it is drawn first).
 */
const QUICK_ACTIONS = /\/packages\/cards\/src\/room\/quick-actions\.ts/;

/** The icons a view's name says, for a tab row asked for icons whose views have none: fetched the first time it is. */
const VIEW_ICONS = /\/packages\/core\/src\/look\/view-icons\.ts/;

/**
 * What a see-through card wears (1.15, #121): its sheet and what writes its own fills at its opacity — fetched by the
 * first card under 100 %, or as the house asks for them; a dashboard of solid cards never pays for it.
 */
const GLASS = /\/packages\/(core\/src\/look\/glass|ui\/src\/styles\/(generated\/)?glass)\.ts/;

/**
 * What a card quiet out of reach wears (1.16, #126): its sheet — fetched by the first card that is one, or as the house
 * asks for it; a dashboard of dashed cards never pays for it.
 */
const QUIET = /\/packages\/(core\/src\/look\/quiet|ui\/src\/styles\/(generated\/)?quiet)\.ts/;

/**
 * The slider styles (1.18, #144): the bar, the liquid and a tile's fill the ruler draws when asked, and their sheet —
 * fetched by the first ruler asked for one, or as the house asks for them; a house of rulers never pays for them.
 */
const SLIDER_STYLES =
  /\/packages\/ui\/src\/(controls\/slider-styles|styles\/(generated\/)?slider-styles)\.ts/;

/**
 * The page's background (1.19, #155): the layer under a dashboard's view that draws it, its marks and its sheet —
 * fetched by the first dashboard that wears one, or with the settings panel (its preview); a house of plain pages
 * never pays for it.
 */
const BACKGROUND = /\/packages\/core\/src\/look\/background-layer\.ts/;

/** The icon set's other part (`fluvy:washer`, `fluvy:gate-open` …): fetched the first time Home Assistant asks for one. */
const ICONS = /\/packages\/core\/src\/icons\/generated-on-demand\.ts/;

/** The cards' visual editor (the rows editor every card's `getConfigElement` builds): fetched the first time a card is edited. */
const EDITOR = /\/packages\/cards\/src\/shared\/rows-editor\.ts/;

/**
 * The fields every card's editor is built of (`shared/form.ts`: the schema's helpers, a list's row form) and the
 * editors' English, which they register: fetched with the first editor, and with the families as the bundle starts
 * (their cards keep their editors beside them). Core must not reach for them.
 */
const FIELDS =
  /\/packages\/(cards\/src\/shared\/form\.ts|core\/src\/i18n\/locales\/en\/editor\.json)/;

/**
 * The editors the cards every page carries keep in a module of their own (`tile/tile-editor.ts`: a card's form, its
 * lists, what it does by default — `Card.editor()`), and the template card's, which is built on the tile's, with the
 * English an editor registers of its own (the room's): fetched with the visual editor, the first time one of them is
 * edited. Named before the families, so a family's folder never keeps one.
 */
const FORMS =
  /\/packages\/(cards\/src\/([\w-]+)\/\2-editor\.ts$|core\/src\/i18n\/locales\/en\/room-editor\.json)/;

/**
 * @typedef {object} Group
 * @property {string | ((id: string) => string)} name the chunk's name (`chunks/<name>-<hash>.js`)
 * @property {RegExp | ((id: string) => boolean)} test whether a module (its absolute path) belongs to it
 */

/**
 * Where each module goes, first match wins: a language's catalogue, the page controls, the Activity page, the History
 * page, the settings panel, the strategy and the heights it counts with the house, the wall, the forms of the cards
 * every page carries, the weather card, the calendar card, the media, the chart engine, the Chart card, the Energy period card, energy
 * (the history bars' readings on their own), devices (the cameras' sheet on its own), appliances (their pictures on
 * their own), automations and alerts families (each sheet on its own), the template card, the web page card, the Slider
 * card, the platforms' logos, the remote card, the Vehicle card, the items card (its sheet on its own), the light card's colours, a room's quick actions, the cards' editor, the
 * fields every editor is built of, the view icons, what a see-through card wears, what a quiet one wears, the slider
 * styles, the page's background, the icon set's other part, and everything else (Fluvy's packages and Lit) in `core`. The bundle's own entry stays in `fluvy.js`. Rolldown processes the groups in this order; the priorities only say so out loud.
 * @type {readonly Group[]}
 */
export const GROUPS = [
  { name: (id) => `lang-${LANGUAGE.exec(id)?.[1]}`, test: LANGUAGE },
  { name: 'pages', test: PAGES },
  { name: 'activity', test: ACTIVITY },
  { name: 'history', test: HISTORY },
  { name: 'panel', test: PANEL },
  { name: 'strategy', test: STRATEGY },
  { name: 'house-heights', test: HOUSE_HEIGHTS },
  { name: 'wall', test: WALL },
  { name: 'forms', test: FORMS },
  { name: 'weather', test: WEATHER },
  { name: 'calendar', test: CALENDAR },
  { name: 'media', test: MEDIA },
  { name: 'history-bars-readings', test: HISTORY_BARS_READINGS },
  { name: 'chart', test: CHART },
  { name: 'chart-card', test: CHART_CARD },
  { name: 'energy-period', test: ENERGY_PERIOD },
  { name: 'energy', test: ENERGY },
  { name: 'cameras-sheet', test: CAMERAS_SHEET },
  { name: 'devices', test: DEVICES },
  { name: 'appliance-art', test: APPLIANCE_ART },
  { name: 'appliances', test: APPLIANCES },
  { name: 'automations-sheet', test: AUTOMATIONS_SHEET },
  { name: 'automations', test: AUTOMATIONS },
  { name: 'alerts-sheet', test: ALERTS_SHEET },
  { name: 'alerts', test: ALERTS },
  { name: 'template', test: TEMPLATE },
  { name: 'web', test: WEB },
  { name: 'slider', test: SLIDER },
  { name: 'app-logos', test: APP_LOGOS },
  { name: 'remote', test: REMOTE },
  { name: 'vehicle', test: VEHICLE },
  { name: 'items-sheet', test: ITEMS_SHEET },
  { name: 'items', test: ITEMS },
  { name: 'lights-colour', test: LIGHTS_COLOUR },
  { name: 'light-colour', test: LIGHT_COLOUR },
  { name: 'quick-actions', test: QUICK_ACTIONS },
  { name: 'editor', test: EDITOR },
  { name: 'fields', test: FIELDS },
  { name: 'view-icons', test: VIEW_ICONS },
  { name: 'glass', test: GLASS },
  { name: 'quiet', test: QUIET },
  { name: 'slider-styles', test: SLIDER_STYLES },
  { name: 'background', test: BACKGROUND },
  { name: 'icons', test: ICONS },
  { name: 'core', test: (id) => !id.includes('/packages/bundle/src/') },
];

/** The chunk a module lands in (its absolute path), by the first group that names it; the bundle's entry is `fluvy.js`. */
export function chunkOf(id) {
  const group = GROUPS.find(({ test }) => (typeof test === 'function' ? test(id) : test.test(id)));
  if (!group) return 'fluvy.js';
  return typeof group.name === 'function' ? group.name(id) : group.name;
}
