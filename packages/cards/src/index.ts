import { announceCard, lookHandle, registerCard, setDetailsSheets, setSidebar } from '@fluvy/core';
import '@fluvy/ui';
import { FluvyActionsCard } from './actions/actions-card.js';
import { FluvyBarsCard } from './bars/bars-card.js';
import { FluvyChipsCard } from './chips/chips-card.js';
import { FluvyClockCard } from './clock/clock-card.js';
import { FluvyCoverCard } from './cover/cover-card.js';
import { FluvyDistributionCard } from './distribution/distribution-card.js';
import { FluvyEntitiesCard } from './entities/entities-card.js';
import { FluvyFanCard } from './fan/fan-card.js';
import { FluvyGaugeCard } from './gauge/gauge-card.js';
import { FluvyHeadingCard } from './heading/heading-card.js';
import { FluvyHelloCard } from './hello/hello-card.js';
import { FluvyHelpersCard } from './helpers/helpers-card.js';
import { FluvyHumidityCard } from './humidity/humidity-card.js';
import { FluvyLightCard } from './light/light-card.js';
import { FluvyOpeningsCard } from './openings/openings-card.js';
import { FluvyPeopleCard } from './people/people-card.js';
import { FluvyReadoutsCard } from './readouts/readouts-card.js';
import { FluvySceneCard } from './scene/scene-card.js';
import { FluvyScenesCard } from './scenes/scenes-card.js';
import { FluvySensorCard } from './sensor/sensor-card.js';
import { FluvyStatTilesCard } from './stat-tiles/stat-tiles-card.js';
import { FluvyTileCard } from './tile/tile-card.js';
import { FluvyTilesCard } from './tiles/tiles-card.js';
import { FluvyTimerCard } from './timer/timer-card.js';
import { FluvyTodoCard } from './todo/todo-card.js';
import { FluvyUpdatesCard } from './updates/updates-card.js';
import { FluvyRoomCard, loadQuickActions } from './room/room-card.js';
import { FluvyLightsCard } from './lights/lights-card.js';
import { FluvyMapCard } from './map/map-card.js';
import { defineStrategies } from './strategy/define.js';
import { ALERTS_FAMILY } from './alerts-family.js';
import { APPLIANCES_FAMILY } from './appliances-family.js';
import { AUTOMATIONS_FAMILY } from './automations-family.js';
import { CALENDAR_FAMILY } from './calendar-family.js';
import { CHART_FAMILY } from './chart-family.js';
import { CLIMATE_FAMILY, loadDoing } from './climate-family.js';
import { detailsSheets } from './details-family.js';
import { DEVICES_FAMILY } from './devices-family.js';
import { ENERGY_FAMILY, ENERGY_PERIOD_FAMILY, type FamilyEntry } from './energy-family.js';
import { EXPANDER_FAMILY } from './expander-family.js';
import { ITEMS_FAMILY } from './items-family.js';
import { MEDIA_FAMILY } from './media-family.js';
import { REMOTE_FAMILY } from './remote-family.js';
import { SLIDER_FAMILY } from './slider-family.js';
import { VACUUM_FAMILY } from './vacuum-family.js';
import { VEHICLE_FAMILY } from './vehicle-family.js';
import { TEMPLATE_FAMILY } from './template-family.js';
import { loadChartEngine } from './shared/chart-load.js';
import { WEB_FAMILY } from './web-family.js';
import { WEATHER_FAMILY } from './weather-family.js';

/** A card of the catalogue: its tag, its element, and what the card picker lists it as. */
type CatalogueEntry = readonly [
  tag: string,
  element: CustomElementConstructor,
  name: string,
  description: string,
];

/**
 * The fluvy card catalogue. Registration happens while the module evaluates — never after an
 * await: Home Assistant gives a custom card two seconds to exist before it paints an error in its
 * place. The list reads everyday cards first, the specialised sets after; Home Assistant's card picker
 * sorts custom cards by name, which is why every name starts with "Fluvy ·".
 */
const CATALOGUE: readonly CatalogueEntry[] = [
  [
    'fluvy-tile-card',
    FluvyTileCard,
    'Fluvy · Tile',
    'A light, switch, cover, fan, player, number or sensor as a tile: large with a precision ruler or two readouts, compact row, or mini.',
  ],
  [
    'fluvy-tiles-card',
    FluvyTilesCard,
    'Fluvy · Tiles',
    'A group of compact or mini tiles, two to four per row, 8 px apart.',
  ],
  [
    'fluvy-light-card',
    FluvyLightCard,
    'Fluvy · Light',
    'The precision dimmer: relative drag, slide away to slow down, hold for the 1 % scale, colour temperature.',
  ],
  [
    'fluvy-lights-card',
    FluvyLightsCard,
    'Fluvy · Room lights',
    'A room’s lights on one card: one tap for the whole room, a round, chip or tile for each light, in its colour.',
  ],
  [
    'fluvy-entities-card',
    FluvyEntitiesCard,
    'Fluvy · Entities',
    'Rows of entities: a switch for what toggles, the value for what is measured.',
  ],
  [
    'fluvy-cover-card',
    FluvyCoverCard,
    'Fluvy · Cover',
    'Blinds, shutters, garage doors and valves: vertical position ruler, tilt, open · stop · close, favourites.',
  ],
  [
    'fluvy-fan-card',
    FluvyFanCard,
    'Fluvy · Fan',
    'Speed ruler with steps, oscillation, direction and presets.',
  ],
  [
    'fluvy-sensor-card',
    FluvySensorCard,
    'Fluvy · Sensor',
    'A sensor with its curve, trend, min, max and average, or up to three sensors on one chart.',
  ],
  [
    'fluvy-readouts-card',
    FluvyReadoutsCard,
    'Fluvy · Readouts',
    'Up to four values side by side with their trends.',
  ],
  [
    'fluvy-people-card',
    FluvyPeopleCard,
    'Fluvy · People',
    'Who is home: avatars, zones, times and phone batteries, each person with a tap of their own.',
  ],
  [
    'fluvy-openings-card',
    FluvyOpeningsCard,
    'Fluvy · Openings',
    'Doors, windows and motion at a glance, with what is open counted.',
  ],
  [
    'fluvy-hello-card',
    FluvyHelloCard,
    'Fluvy · Hello',
    'The greeting: name, date, weather and avatar.',
  ],
  [
    'fluvy-chips-card',
    FluvyChipsCard,
    'Fluvy · Chips',
    'A row of chips that navigate between views or open entities.',
  ],
  [
    'fluvy-heading-card',
    FluvyHeadingCard,
    'Fluvy · Heading',
    'A section title with its count and a link.',
  ],
  [
    'fluvy-scene-card',
    FluvySceneCard,
    'Fluvy · Scene',
    'One scene, script or button as a tile with a done state.',
  ],
  ['fluvy-scenes-card', FluvyScenesCard, 'Fluvy · Scenes', 'A grid of scenes and scripts.'],
  [
    'fluvy-actions-card',
    FluvyActionsCard,
    'Fluvy · Actions',
    'Buttons and scripts as a list with run buttons.',
  ],
  [
    'fluvy-helpers-card',
    FluvyHelpersCard,
    'Fluvy · Helpers',
    'Numbers, selects, texts, booleans and dates as their own controls.',
  ],
  ['fluvy-todo-card', FluvyTodoCard, 'Fluvy · To-do', 'A to-do list: check, add, hide the done.'],
  [
    'fluvy-timer-card',
    FluvyTimerCard,
    'Fluvy · Timer',
    'A timer counting down live, with pause and cancel.',
  ],
  [
    'fluvy-updates-card',
    FluvyUpdatesCard,
    'Fluvy · Updates',
    'Pending updates with install buttons and progress.',
  ],
  [
    'fluvy-gauge-card',
    FluvyGaugeCard,
    'Fluvy · Gauge',
    'A ring gauge for any numeric sensor with min, max and average, or centred on zero for a meter that runs both ways.',
  ],
  [
    'fluvy-stat-tiles-card',
    FluvyStatTilesCard,
    'Fluvy · Stat tiles',
    'A headline value and a grid of stat tiles.',
  ],
  [
    'fluvy-bars-card',
    FluvyBarsCard,
    'Fluvy · Bars',
    'Rows with a bar each: plants, batteries, strings, levels.',
  ],
  [
    'fluvy-distribution-card',
    FluvyDistributionCard,
    'Fluvy · Distribution',
    'One stacked bar and a legend: who draws what.',
  ],
  [
    'fluvy-room-card',
    FluvyRoomCard,
    'Fluvy · Room',
    'A room of the house from its area: its picture, its climate, what is on, and its controls.',
  ],
  [
    'fluvy-map-card',
    FluvyMapCard,
    'Fluvy · Map',
    'Where everyone is: the house’s zones as columns of faces, a row a person, or Home Assistant’s map on a plate.',
  ],
  [
    'fluvy-humidity-card',
    FluvyHumidityCard,
    'Fluvy · Humidity',
    'Humidity on a comfort band, with dew point and trend.',
  ],
  [
    'fluvy-clock-card',
    FluvyClockCard,
    'Fluvy · Clock',
    'Analog or digital, hero, side or tile, with or without weather.',
  ],
];

for (const [tag, element, name, description] of CATALOGUE)
  registerCard({ tag, name, description }, element);

/**
 * A family: its names and heights, which every page carries, and its chunk — fetched at once, defined as it lands
 * (its English first), its cards with their elements.
 */
type Family = readonly [
  entries: readonly FamilyEntry[],
  chunk: () => Promise<{ readonly CARDS: readonly CatalogueEntry[] }>,
];

/**
 * The weather, calendar, template, web page, Expander, Slider, Vacuum, Thermostat, remote, items and chart cards, the
 * Energy period and Energy usage cards, and the media, energy, devices, automations, appliances and alerts families.
 */
const FAMILIES: readonly Family[] = [
  [WEATHER_FAMILY, () => import('./weather-cards.js')],
  [CALENDAR_FAMILY, () => import('./calendar-cards.js')],
  [MEDIA_FAMILY, () => import('./media-cards.js')],
  [REMOTE_FAMILY, () => import('./remote-cards.js')],
  [ENERGY_FAMILY, () => import('./energy-cards.js')],
  [ENERGY_PERIOD_FAMILY, () => import('./energy-period-cards.js')],
  [DEVICES_FAMILY, () => import('./devices-cards.js')],
  [AUTOMATIONS_FAMILY, () => import('./automations-cards.js')],
  [APPLIANCES_FAMILY, () => import('./appliances-cards.js')],
  [ALERTS_FAMILY, () => import('./alerts-cards.js')],
  [TEMPLATE_FAMILY, () => import('./template-cards.js')],
  [WEB_FAMILY, () => import('./web-cards.js')],
  [EXPANDER_FAMILY, () => import('./expander-cards.js')],
  [SLIDER_FAMILY, () => import('./slider-cards.js')],
  [VACUUM_FAMILY, () => import('./vacuum-cards.js')],
  [CLIMATE_FAMILY, () => import('./climate-cards.js')],
  [VEHICLE_FAMILY, () => import('./vehicle-cards.js')],
  [ITEMS_FAMILY, () => import('./items-cards.js')],
  [CHART_FAMILY, () => import('./chart-cards.js')],
];

// the families: listed and measured now, their elements fetched at once and defined as they land
for (const [entries] of FAMILIES)
  for (const [tag, name, description, height] of entries)
    announceCard({ tag, name, description }, height);
/**
 * The families defined, the chart engine, the room's quick actions and what says what a thermostat is doing landed
 * (what a test waits on before its page goes; the bundle never waits): they are fetched with the families, so a core
 * card's chart is drawn before its history answers, a room's quick actions with its first render, and a tile asked
 * what its thermostat is doing says so from its first.
 */
export const familiesDefined: Promise<unknown> = Promise.all([
  ...FAMILIES.map(([, chunk]) => chunk()),
  loadChartEngine(),
  loadQuickActions(),
  loadDoing(),
]);

/** Every card with its element: the eager ones, then each family's (docs, tests), the chart engine landed. */
export async function catalogue(): Promise<readonly CatalogueEntry[]> {
  const [chunks] = await Promise.all([
    Promise.all(FAMILIES.map(([, chunk]) => chunk())),
    loadChartEngine(),
  ]);
  return [...CATALOGUE, ...chunks.flatMap(({ CARDS }) => CARDS)];
}
// the automatic dashboards' strategies (`strategy: { type: custom:fluvy-home }` and the other templates; their file is fetched when asked)
defineStrategies();

// Fluvy's own details sheets (1.20, #162) where the house asks for them, fetched the first time one opens
setDetailsSheets(detailsSheets(() => lookHandle()?.settings().sheets));

// a dashboard's own sidebar (1.21, #187), fetched by the first dashboard whose configuration asks for one
setSidebar(() => import('./sidebar/index.js'));

// fluvy's settings: the element of the `panel_custom` Home Assistant shows in the sidebar

export { CATALOGUE };
export { loadPanel, panelOnDemand } from './panel/on-demand.js';
export { detailsSheets } from './details-family.js';
export { activityIsOurs, takeOverActivity } from './activity/takeover.js';
export { historyIsOurs, takeOverHistory } from './history/takeover.js';
export { takeOverDetails } from './details-history/takeover.js';
export {
  FluvyActionsCard,
  FluvyBarsCard,
  FluvyChipsCard,
  FluvyClockCard,
  FluvyCoverCard,
  FluvyDistributionCard,
  FluvyEntitiesCard,
  FluvyFanCard,
  FluvyGaugeCard,
  FluvyHeadingCard,
  FluvyHelloCard,
  FluvyHelpersCard,
  FluvyHumidityCard,
  FluvyLightCard,
  FluvyOpeningsCard,
  FluvyPeopleCard,
  FluvyReadoutsCard,
  FluvySceneCard,
  FluvyScenesCard,
  FluvySensorCard,
  FluvyStatTilesCard,
  FluvyTileCard,
  FluvyTilesCard,
  FluvyTimerCard,
  FluvyTodoCard,
  FluvyUpdatesCard,
};
