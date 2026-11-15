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
export type TemplateId = 'home' | 'rooms' | 'energy' | 'security' | 'wall' | 'lights' | 'climate';
export type StrategyType = `custom:fluvy-${TemplateId}`;

/** Seconds between a camera's stills on the security dashboard. */
export type CameraRefresh = 5 | 10 | 30;
/** What ends a large tile's head on a dashboard: its switch, nothing, its level's figure, or its switch as a wall rocker. */
export type TileSwitch = 'show' | 'hide' | 'value' | 'rocker';
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
  /**
   * What the thermostats say of what they are doing (1.21, #185): as each card does by itself (`brief`, the default),
   * or with what is found for each (`detailed`) — how far its valve is open, an open window, a low battery — a room's
   * climate row saying what its thermostat is doing and what it is set to.
   */
  thermostat_state?: 'brief' | 'detailed';
  /** The lights' tiles: large (default, with their ruler) or compact rows. */
  tile_size?: 'large' | 'compact';
  /**
   * The large tiles' switches (#160), the lights' and the appliances': beside their circles (`show`, the default),
   * hidden, each circle its tile's switch (`hide`), the level's figure in their place (`value`), or wall rockers
   * (`rocker`, #177: each tile then switches and nothing more, a compact one's rocker at its row's end).
   */
  tile_switch?: TileSwitch;
  /**
   * Which room a light or a scene belongs to (#189): `room` draws Home's lights under their rooms' quiet labels, and
   * the scenes of Home and of the Lights view under theirs, in the house's order of its rooms, their names short under
   * them; unsaid (`none`), each list as it stands.
   */
  group_by?: 'none' | 'room';
  /**
   * The scenes: a tile each (`tiles`, the default), or pills that fill their rows on one card (`chips`, #189), by
   * room on Home and on the Lights view, twelve before their "N more" row.
   */
  scenes_style?: 'tiles' | 'chips';
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
  /**
   * What a person changed on the dashboard (#170), kept as differences so that everything else stays automatic: a view
   * or a card hidden, moved or given options of its own, a list's entities left out, added or put in order, cards of
   * the person's own. Fluvy's panel writes it (Dashboards › Customise); without it the dashboard is the house's alone.
   */
  edit?: DashboardEdit;
}

/** A view's own changes, by its path (`climate`, `room-kitchen`). */
export interface ViewEdit {
  /** Left out of the dashboard: any view but the template's first. */
  readonly hidden?: boolean;
  /** Its place among the tabs: from the first (0, 1 …) or, negative, from the last (-1). */
  readonly order?: number;
  /** Cards of the person's own, laid out after the view's (each a part: `<view>/own:<index>`). */
  readonly add?: readonly Card[];
  /**
   * Parts of the dashboard's other views shown here as well (#188), each by its id (`room-kitchen/scenes`) and still
   * automatic, laid out after the view's and the person's own (each a part: `<view>/also:<id>`).
   */
  readonly also?: readonly string[];
}

/** A part's own changes, by its id (`home/flow`, `rooms/room:kitchen`; a list's card of one entity, `home/lights:light.sofa`). */
export interface CardEdit {
  readonly hidden?: boolean;
  /** Its place among its view's parts: from the first (0, 1 …) or, negative, from the last (-1). */
  readonly order?: number;
  /** Keys laid over the card's generated config (a variant, a title, a colour); `null` takes a key away. */
  readonly options?: Readonly<Record<string, unknown>>;
}

/** A list's own changes, by its part's id (`home/lights`). */
export interface ListEdit {
  /** Entities it leaves out. */
  readonly drop?: readonly string[];
  /** Entities it shows besides, each of a domain the list takes. */
  readonly add?: readonly string[];
  /** The entities it shows first, in this order; the others follow in the house's. */
  readonly order?: readonly string[];
}

/** Everything a person changed on one automatic dashboard (`edit`); an id the house no longer has is ignored, and kept. */
export interface DashboardEdit {
  readonly views?: Readonly<Record<string, ViewEdit>>;
  readonly cards?: Readonly<Record<string, CardEdit>>;
  readonly entities?: Readonly<Record<string, ListEdit>>;
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
  /** Every array's meter in the energy dashboard, in its order: today's production is theirs together (#183). */
  readonly solarMeters: readonly string[];
  /** The Energy dashboard links a forecast to an array: Production draws it, and tomorrow has a card of its own. */
  readonly solarForecast: boolean;
  /** Every forecast linked to an array holds a week ahead (Solcast, Open-Meteo Solar Forecast): the days ahead can be drawn. */
  readonly solarWeek: boolean;
  /** The energy dashboard's devices (their energy statistics) and the power sensor beside each. */
  readonly consumption: readonly string[];
  readonly consumptionPowers: readonly string[];
  /** The energy dashboard's sources carry their power: the energy cards read them without being told. */
  readonly prefsPower: boolean;
  /** The energy dashboard meters its sources: a day's flow, where it went, the score, the house by source. */
  readonly prefsMeters: boolean;
  /** What else the energy dashboard meters, in its order: water, gas (an imported statistic too), charted over a range. */
  readonly prefsMetered: readonly ('water' | 'gas')[];
  /**
   * Water and gas meters: the energy dashboard's, else the house's own; a statistic a utility imports with its kind,
   * which no device class says (#181).
   */
  readonly meters: readonly { readonly entity: string; readonly kind?: 'water' | 'gas' }[];
  readonly any: boolean;
}

/** How the generated cards are drawn: the dashboard's options (fluvy's panel edits them). */
export interface CardStyle {
  readonly thermostat?: ThermostatVariant;
  /** The thermostats and the rooms' climate rows say what they are doing in full (`thermostat_state: detailed`). */
  readonly doing?: boolean;
  readonly tiles?: 'large' | 'compact';
  readonly switches?: TileSwitch;
  /** Home's lights and the house's scenes stand by room (`group_by: room`, #189). */
  readonly byRoom?: boolean;
  /** The scenes are chips (`scenes_style: chips`, #189). */
  readonly sceneChips?: boolean;
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

/** A part of a view (#170): the cards that stand under one id, as they were built — none while the part is hidden. */
export interface Part {
  /** Its id inside its view (`flow`, `lights`, `room:kitchen`); the dashboard's `edit` names it after the view's path. */
  readonly id: string;
  readonly cards: readonly Card[];
  /** A part that starts hidden, a function a person turns on in Customise: the cards it draws once they show it. */
  readonly off?: readonly Card[];
}

/** A list a part draws: every entity the house gives it (before its cap), and what it takes besides. */
export interface PartList {
  readonly items: readonly string[];
  /** The domains of what a person may add (`*`: any entity). */
  readonly takes: readonly string[];
  /** Its own title and icon, where it is a list of the view's (a capped one). */
  readonly title?: string;
  readonly icon?: string;
}

/** A view's columns as `flowed` was asked for them: an order of the person's lays them out again. */
export interface Flow {
  readonly blocks: readonly (readonly Card[])[];
  readonly loose: readonly (Card | readonly Card[])[];
  /** The sections it gave. */
  readonly sections: readonly Section[];
  readonly lay: (
    blocks: readonly (readonly Card[])[],
    loose: readonly (Card | readonly Card[])[],
  ) => Section[];
}

/**
 * A view as it is built. Its capped lists gather on it the subviews their "N more" rows open (#78), each one's path
 * after the view's (`climate-humidity`, `room-kitchen-lights`) and its way back leading to it; and its cards stand on
 * it part by part (#170), each under an id the dashboard's `edit` names.
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
  /** What a person changed on the dashboard (`edit`). */
  readonly edit: DashboardEdit;
  /** The view's parts, in the order they are built: the order they are read in. */
  readonly parts: Part[];
  /** The lists its parts draw, by the part's id. */
  readonly lists: Map<string, PartList>;
  /** The parts of other views it shows as well (`edit.views.<path>.also`), each under its id here (`also:<id>`). */
  readonly taken?: readonly Part[];
  /**
   * The view its parts are built for where that is another (one of them is shown there, `also`): a list's subview is
   * named after that view too, and leads back to it.
   */
  readonly on?: Pick<MoreHost, 'path' | 'title' | 'icon'>;
  /** Its columns, once `flowed` has cut them. */
  flow?: Flow;
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
