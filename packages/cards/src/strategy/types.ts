import type {
  HomeAssistant,
  LanguageCode,
  LovelaceCardConfig,
  MessageKey,
  PageBackground,
  RoomTuning,
} from '@fluvy/core';
import type { FlowStyle } from '../energy-flow/energy-flow-card.js';
import type { ThermostatVariant } from '../thermostat/thermostat-card.js';
import type { HomeRegistry } from './home-registry.js';
import { type RoomCardConfig, type RoomVariant } from '../room/room-card.js';

/*
 * What the automatic dashboards are made of: their configs, the cards and sections they lay out, the house's
 * energy roles, and the context every view is built from. Types only: the definer in core reads them without the
 * strategy.
 */

/** The dashboards Fluvy builds by itself, each a template: `custom:fluvy-<id>`. */
export type TemplateId = 'home' | 'rooms' | 'energy' | 'security' | 'wall';
export type StrategyType = `custom:fluvy-${TemplateId}`;

/** Seconds between a camera's stills on the security dashboard. */
export type CameraRefresh = 5 | 10 | 30;
/** What ends a large tile's head on a dashboard: its switch, nothing, or its level's figure. */
export type TileSwitch = 'show' | 'hide' | 'value';
/** How many scenes a wall shows as chips. */
export type ScenesMax = 4 | 6 | 8;

/** The lists the automatic dashboards cap (#78), each by the name `caps` gives it (`caps.ts` holds their caps). */
export type CapKey =
  | 'lights'
  | 'appliances'
  | 'covers'
  | 'gates'
  | 'thermostats'
  | 'fans'
  | 'humidity'
  | 'temperatures'
  | 'readings'
  | 'security'
  | 'alarms'
  | 'locks'
  | 'cameras'
  | 'media'
  | 'calendars'
  | 'lists'
  | 'timers'
  | 'actions'
  | 'scenes'
  | 'batteries'
  | 'phones'
  | 'plants'
  | 'helpers'
  | 'updates'
  | 'consumption'
  | 'today'
  | 'meters'
  | 'devices'
  | 'openings'
  | 'automations';
/**
 * How many of each list a view shows before its "N more" row: `none`, every list whole; else a list's own number (or
 * `none`, that list whole), the others at the house's caps.
 */
export type Caps = 'none' | Readonly<Partial<Record<CapKey, number | 'none'>>>;

/**
 * What is a room's photo's alone (#159), as its card takes it: where its name stands, its readouts on one row or
 * wrapped, and their labels.
 */
export type RoomLook = Pick<RoomCardConfig, 'name_position' | 'readout_style' | 'readout_labels'>;

/** What any of the automatic dashboards reads from its raw configuration; each template honours its own keys. */
export interface FluvyStrategyConfig {
  type: StrategyType;
  /** The weather entity of the greeting and the clock; default: the first `weather.*`. */
  weather?: string;
  /** Views to leave out: any but the first, which always stays. */
  hide?: readonly string[];
  /** The thermostats' variant (default: each card's own, the dial). */
  thermostat_variant?: ThermostatVariant;
  /** The lights' tiles: large (default, with their ruler) or compact rows. */
  tile_size?: 'large' | 'compact';
  /**
   * The large tiles' switches (#160), the lights' and the appliances': beside their circles (`show`, the default),
   * hidden, each circle its tile's switch (`hide`), or the level's figure in their place (`value`).
   */
  tile_switch?: TileSwitch;
  /** How the energy flow draws its lanes (default: stream; 1.3's `ribbons` reads as it). */
  flow_style?: FlowStyle;
  /** The rooms' cards (default: a photo where the area has one, else a tile). */
  room_variant?: RoomVariant;
  /** Where the rooms' photos carry their names (default: `bottom`, beside the quick actions). */
  room_name_position?: RoomLook['name_position'];
  /** The rooms' readouts on one row (`row`, the default) or wrapped where a word would not hold (`wrap`). */
  room_readout_style?: RoomLook['readout_style'];
  /** Their labels (default `auto`: words while they hold, icons where they would not). */
  room_readout_labels?: RoomLook['readout_labels'];
  /** The rooms a wall shows, in that order, an empty one kept (default: every room with something in it). */
  areas?: readonly string[];
  /** Seconds between the cameras' stills (default 10). */
  camera_refresh?: CameraRefresh;
  /** How many scenes a wall offers (default 6). */
  scenes_max?: ScenesMax;
  /** The dashboard's words in one language, whoever opens it (default: each person's). */
  language?: LanguageCode;
  /**
   * The views as chips under the greeting too (`show`), or only as the header's tabs (`hide`, the default since the
   * header's tabs wear the look: 1.5).
   */
  greeting_tabs?: 'show' | 'hide';
  /** How many of a long list a view shows (default: the house's caps, each with its "N more" row). */
  caps?: Caps;
  /**
   * A room's own `include` and `exclude` by its area's id (#95), as its card takes them: what its card counts and fills
   * by, whether the dashboard shows it, and what its page holds; and what is its photo's alone (`name_position`,
   * `readout_style`, `readout_labels`), for that room over the dashboard's.
   */
  rooms?: Readonly<Record<string, RoomTuning & RoomLook>>;
  /**
   * What no view shows nor counts, as if the house had none of it (#141): entity ids, patterns of ids
   * (`sensor.debug_*`), device ids or domains, as a room's `exclude` takes them.
   */
  exclude?: readonly string[];
  /**
   * What lies behind this dashboard's cards in place of the house's (1.19, #155): its `type` (`plain`, `gradient`,
   * `color`, `image`) and that type's own keys — `colors` (one hex, or two from the top to the bottom), `image` (a path
   * of Home Assistant's or a web address), `dim` (0 to 80, default 40) and `blur` (default off). Default: the house's
   * (Appearance › Background). The page draws it (`core/look/background.ts`); the views carry nothing of it.
   */
  background?: Partial<PageBackground>;
}

/** The home dashboard's config: the same keys, its views by name. */
export interface FluvyHomeStrategyConfig extends FluvyStrategyConfig {
  type: 'custom:fluvy-home';
  hide?: ReadonlyArray<Exclude<ViewKey, 'home'>>;
}

export type Card = LovelaceCardConfig & { grid_options?: { columns?: number | 'full' } };
export interface Section {
  readonly type: 'grid';
  readonly cards: Card[];
  /** Columns of the view it spans (Home Assistant narrows it to those a screen has): a band under the columns. */
  readonly column_span?: number;
}
export type ViewKey =
  'home' | 'rooms' | 'lights' | 'climate' | 'energy' | 'security' | 'media' | 'agenda' | 'sensors';
export interface View {
  title: string;
  path: string;
  icon: string;
  type: 'sections';
  max_columns: number;
  sections: Section[];
  /** A view reached from another (a room from the rooms), not from the tabs; `back_path` is where its back arrow goes. */
  subview?: boolean;
  back_path?: string;
}

/** What `energy/get_prefs` answers, in every shape it has had (the energy model reads it). */
export type { EnergyPrefs } from '../energy-model/prefs.js';

/** A source's power sensor as the energy cards read it: its own sign, and a battery's own charge. */
export interface SourcePower {
  readonly id: string;
  /** It counts towards the house as negative (the card's `invert`). */
  readonly inverted: boolean;
  readonly level?: string;
}

/** The energy readings found once, each by its role. */
export interface EnergyRoles {
  /** Every array: the energy dashboard's, each with its own sign; else the one a reading's words name. */
  readonly solarPowers: readonly SourcePower[];
  readonly gridPower: string | undefined;
  /** The grid read by two sensors found by their words: what comes in (the grid meter) and what goes out. */
  readonly gridImport: string | undefined;
  readonly gridExport: string | undefined;
  /** The grid read per phase: its meters named L1, L2, L3 (then there is no net meter to read). */
  readonly gridPhases: readonly string[];
  /**
   * Every battery: the energy dashboard's, each with its own sign and charge; else the one a reading's words name, its
   * charge the energy dashboard's, else the battery sensor beside its power.
   */
  readonly batteryPowers: readonly SourcePower[];
  readonly homePower: string | undefined;
  /** A car charger's power sensor, found by its words. */
  readonly charger: string | undefined;
  /** The grid meter counts towards the house as negative (the card's `grid_invert`). */
  readonly gridInvert: boolean;
  /** The grid meter came from the energy dashboard's preferences, with its sign: nothing left to find out. */
  readonly gridSigned: boolean;
  readonly solarToday: string | undefined;
  /** Today's forecast of the sun's day (its state the total, its attributes the hours): what the production draws behind. */
  readonly solarForecast: string | undefined;
  /** Tomorrow's forecast, drawn as the row under today's forecast chart. */
  readonly solarForecastTomorrow: string | undefined;
  /** Forecast sensors that name their day, in order from today ("Forecast Day 3" and friends). */
  readonly solarForecastDays: readonly string[];
  /** The energy dashboard's devices (their energy statistics) and the power sensor beside each. */
  readonly consumption: readonly string[];
  readonly consumptionPowers: readonly string[];
  /** The energy dashboard's sources carry their power: the energy cards read them without being told. */
  readonly prefsPower: boolean;
  /** The energy dashboard meters its sources: a day's flow, where it went, the score, the house by source. */
  readonly prefsMeters: boolean;
  /** Water and gas meters: the energy dashboard's, else the house's own. */
  readonly meters: readonly string[];
  readonly any: boolean;
}

/** How the generated cards are drawn: the dashboard's options (fluvy's panel edits them). */
export interface CardStyle {
  readonly thermostat?: ThermostatVariant;
  readonly tiles?: 'large' | 'compact';
  readonly switches?: TileSwitch;
  readonly flow?: FlowStyle;
  readonly room?: RoomVariant;
  /** What every room's photo is asked for (`room_name_position` …); a room's own comes over it. */
  readonly roomLook?: RoomLook;
  readonly refresh?: CameraRefresh;
  readonly scenes?: ScenesMax;
}

export interface StrategyContext {
  readonly home: HomeRegistry;
  readonly t: (key: MessageKey) => string;
  /** The dashboard's url path (`/fluvy-home`): the tabs and "see all" links navigate inside it. */
  readonly base: string;
  /**
   * The panel the dashboard is generated in (`hass.panelUrl`, else the base's): an Energy date picker's key on it is
   * `energy_<panelUrl>`, the one Home Assistant's energy cards take without a key of their own.
   */
  readonly panelUrl: string;
  readonly weather: string | undefined;
  readonly energy: EnergyRoles;
  readonly style: CardStyle;
  /** The rooms the dashboard was asked to show (undefined: every room with something in it). */
  readonly areas: readonly string[] | undefined;
  /** Whether every view's first column opens with the views as chips under the greeting. */
  readonly greetingTabs: boolean;
  /** The house the dashboard is generated for: the cards' heights count what its entities draw. */
  readonly hass: HomeAssistant;
  /** What opens the first column of every view, in px at a 360 column (the greeting, the chips): the layout counts it. */
  readonly header: number;
  /** How many of a long list a view shows (`caps`). */
  readonly caps: Caps;
  /** The view being built: where its capped lists gather the subviews their "N more" rows open. */
  readonly more: MoreHost;
}

/**
 * A view as its capped lists see it (#78): the subviews their "N more" rows open are gathered on it, each one's path
 * after the view's (`climate-humidity`, `room-kitchen-lights`) and its way back leading to it.
 */
export interface MoreHost {
  /** The view's path inside its dashboard. */
  readonly path: string;
  /** What its way back says and shows: the view's title and icon. */
  readonly title: string;
  readonly icon: string;
  /** The template's columns: the subviews keep them. */
  readonly columns: number;
  /** The subviews gathered while the view is built. */
  readonly views: View[];
}

export interface ViewSpec {
  /** The view's path inside its dashboard (`hide` names it). */
  readonly key: string;
  readonly icon: string;
  readonly title: MessageKey;
  /** A title of its own (a floor's name) instead of the word. */
  readonly name?: string;
  readonly build: (ctx: StrategyContext) => Section[];
  /** Whether the house has anything for the view; default: some section has cards. */
  readonly when?: (ctx: StrategyContext) => boolean;
}
