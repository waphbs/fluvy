import type { AreaRegistryEntry, KeyOf } from '@fluvy/core';
import { capsOf } from './caps.js';
import { roomsOf } from './rooms.js';
import type {
  FluvyStrategyConfig,
  StrategyContext,
  StrategyType,
  TemplateId,
  ViewSpec,
} from './types.js';
import { ENERGY_VIEWS } from './views/energy.js';
import { HOME_VIEWS } from './views/home.js';
import { roomTab, roomsViews } from './views/rooms.js';
import { SECURITY_VIEWS } from './views/security.js';
import { WALL_VIEWS, wallRooms } from './views/wall.js';

/*
 * The dashboards Fluvy builds by itself: five templates, each a strategy (`custom:fluvy-<id>`) with its views, its
 * frame (the greeting and the tabs, or none), its columns, the rooms it opens as subviews and the options its raw
 * configuration honours (the panel's Dashboards tab edits them, and the settings file carries them).
 */

/** A key a template's configuration honours, the panel edits and the settings file carries. */
export type OptionKey = Exclude<keyof FluvyStrategyConfig, 'type' | 'weather' | 'language'>;

/** One value of a choice: its word, given `count` when the value is a number ("{count} s"). */
export interface OptionValue {
  readonly value: string | number;
  readonly label: KeyOf<'panel'>;
}

export type TemplateOption =
  /** Which of the template's views stay (`hide`: every view but the first). */
  | { readonly key: 'hide'; readonly kind: 'views'; readonly label: KeyOf<'panel'> }
  /** Which rooms the dashboard shows (`areas`). */
  | { readonly key: 'areas'; readonly kind: 'areas'; readonly label: KeyOf<'panel'> }
  /** How many of a long list a view shows (`caps`): the house's caps, or every list whole (`none`). */
  | { readonly key: 'caps'; readonly kind: 'caps'; readonly label: KeyOf<'panel'> }
  /** What no view shows nor counts (`exclude`, #141): the house's own entities, which a settings file never carries. */
  | { readonly key: 'exclude'; readonly kind: 'entities'; readonly label: KeyOf<'panel'> }
  /** One of a few values; the first is the default and is never written. */
  | {
      readonly key: Exclude<OptionKey, 'hide' | 'areas' | 'caps' | 'exclude'>;
      readonly kind: 'choice';
      readonly label: KeyOf<'panel'>;
      readonly values: readonly OptionValue[];
    };

/** A room a dashboard opens as a subview, and where its way back leads. */
export interface RoomLink {
  readonly area: AreaRegistryEntry;
  readonly back: { readonly path: string; readonly title: string };
}

export interface Template {
  readonly id: TemplateId;
  readonly type: StrategyType;
  /** The dashboard's url path when the panel creates it. */
  readonly url: string;
  readonly icon: string;
  readonly title: KeyOf<'panel'>;
  readonly description: KeyOf<'panel'>;
  /** The columns of every view (a wall is two). */
  readonly columns: 2 | 3;
  /** Whether every view opens with the greeting and the tabs. */
  readonly header: 'hello' | 'none';
  /** The views in tab order: fixed, or read from the house (a tab a floor). */
  readonly views: readonly ViewSpec[] | ((ctx: StrategyContext) => readonly ViewSpec[]);
  /** The rooms the dashboard opens as subviews, given the paths of the views it built. */
  readonly rooms?: (ctx: StrategyContext, paths: readonly string[]) => RoomLink[];
  /** Whether it opens every appliance as a subview: Home's bands lead there ("All appliances"). */
  readonly appliances?: boolean;
  readonly options: readonly TemplateOption[];
}

const choice = (
  key: Exclude<OptionKey, 'hide' | 'areas' | 'caps' | 'exclude'>,
  label: KeyOf<'panel'>,
  values: readonly OptionValue[],
): TemplateOption => ({ key, kind: 'choice', label, values });
const words = (values: readonly string[], prefix = 'dashboard'): OptionValue[] =>
  values.map((value) => ({ value, label: `${prefix}.${value}` as KeyOf<'panel'> }));
const counts = (values: readonly number[], label: KeyOf<'panel'>): OptionValue[] =>
  values.map((value) => ({ value, label }));

const HIDE: TemplateOption = { key: 'hide', kind: 'views', label: 'dashboard.views' };
const THERMOSTAT = choice(
  'thermostat_variant',
  'dashboard.thermostat',
  words(['dial', 'compact', 'ruler']),
);
const TILES = choice('tile_size', 'dashboard.tiles', [
  { value: 'large', label: 'dashboard.large' },
  { value: 'compact', label: 'dashboard.rows' },
]);
const FLOW = choice('flow_style', 'dashboard.flow', words(['stream', 'legs', 'rail']));
const ROOM = choice('room_variant', 'dashboard.rooms', words(['photo', 'tile', 'row']));
/** The long lists: at the house's caps, each with its "N more" row, or whole. */
const CAPS: TemplateOption = { key: 'caps', kind: 'caps', label: 'dashboard.caps' };
/** What every view leaves out, as if the house had none of it. */
const EXCLUDE: TemplateOption = { key: 'exclude', kind: 'entities', label: 'dashboard.exclude' };
/** The views as chips under the greeting, besides the header's tabs. */
const GREETING_TABS = choice('greeting_tabs', 'dashboard.greeting_tabs', [
  { value: 'hide', label: 'dashboard.header_only' },
  { value: 'show', label: 'dashboard.under_greeting' },
]);

/** Every room with something in it, each going back to the tab that holds it. */
const everyRoom = (ctx: StrategyContext, tab: (area: AreaRegistryEntry) => string): RoomLink[] =>
  roomsOf(ctx.home).map((area) => ({
    area,
    back: { path: `${ctx.base}/${tab(area)}`, title: ctx.t('strategy.all_rooms') },
  }));

export const TEMPLATES: readonly Template[] = [
  {
    id: 'home',
    type: 'custom:fluvy-home',
    url: 'fluvy-auto',
    icon: 'fluvy:sun',
    title: 'template.home',
    description: 'template.home_sub',
    columns: 3,
    header: 'hello',
    views: HOME_VIEWS,
    // the rooms open from the Rooms view: none without it
    rooms: (ctx, paths) => (paths.includes('rooms') ? everyRoom(ctx, () => 'rooms') : []),
    appliances: true,
    options: [HIDE, THERMOSTAT, TILES, FLOW, ROOM, GREETING_TABS, CAPS, EXCLUDE],
  },
  {
    id: 'rooms',
    type: 'custom:fluvy-rooms',
    url: 'fluvy-rooms',
    icon: 'fluvy:rooms',
    title: 'template.rooms',
    description: 'template.rooms_sub',
    columns: 3,
    header: 'hello',
    views: roomsViews,
    rooms: (ctx) => everyRoom(ctx, (area) => roomTab(ctx, area)),
    options: [ROOM, THERMOSTAT, TILES, GREETING_TABS, CAPS, EXCLUDE],
  },
  {
    id: 'energy',
    type: 'custom:fluvy-energy',
    url: 'fluvy-energy',
    icon: 'fluvy:bolt',
    title: 'template.energy',
    description: 'template.energy_sub',
    columns: 3,
    header: 'hello',
    views: ENERGY_VIEWS,
    options: [HIDE, FLOW, GREETING_TABS, CAPS, EXCLUDE],
  },
  {
    id: 'security',
    type: 'custom:fluvy-security',
    url: 'fluvy-security',
    icon: 'fluvy:shield',
    title: 'template.security',
    description: 'template.security_sub',
    columns: 3,
    header: 'hello',
    views: SECURITY_VIEWS,
    options: [
      HIDE,
      choice('camera_refresh', 'dashboard.refresh', counts([5, 10, 30], 'dashboard.seconds')),
      GREETING_TABS,
      CAPS,
      EXCLUDE,
    ],
  },
  {
    id: 'wall',
    type: 'custom:fluvy-wall',
    url: 'fluvy-wall',
    icon: 'fluvy:frame',
    title: 'template.wall',
    description: 'template.wall_sub',
    columns: 2,
    header: 'none',
    views: WALL_VIEWS,
    rooms: (ctx) =>
      wallRooms(ctx).map((area) => ({
        area,
        back: { path: `${ctx.base}/wall`, title: ctx.t('strategy.home') },
      })),
    options: [
      { key: 'areas', kind: 'areas', label: 'dashboard.areas' },
      THERMOSTAT,
      choice('scenes_max', 'dashboard.scenes', counts([4, 6, 8], 'dashboard.count')),
      CAPS,
      EXCLUDE,
    ],
  },
];

export const HOME_TEMPLATE = TEMPLATES[0] as Template;

/** The template a strategy type names (`custom:fluvy-energy`), if it is one of ours. */
export const templateOf = (type: unknown): Template | undefined =>
  TEMPLATES.find((template) => template.type === type);

export const templateById = (id: TemplateId): Template =>
  TEMPLATES.find((template) => template.id === id) as Template;

/** A template's views for this house (a tab a floor is read from it). */
export const viewsOf = (template: Template, ctx: StrategyContext): readonly ViewSpec[] =>
  typeof template.views === 'function' ? template.views(ctx) : template.views;

/** The views `hide` may name: every fixed view but the first (a house's own tabs are not a setting). */
export const optionalViews = (template: Template): readonly ViewSpec[] =>
  typeof template.views === 'function' ? [] : template.views.slice(1);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A dashboard's options from a settings file or a raw configuration: only the keys its template knows, each well
 * formed (a house's own entities, such as its weather or what it leaves out, do not travel).
 */
export function strategyOptions(raw: unknown, template: Template): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  const options: Record<string, unknown> = {};
  // a person's own changes travel with the dashboard, whatever its template (they name its cards, its entities)
  if (isRecord(raw['edit'])) options['edit'] = raw['edit'];
  for (const option of template.options) {
    const value = raw[option.key];
    if (option.kind === 'choice') {
      if (option.values.some((known) => known.value === value)) options[option.key] = value;
    } else if (option.kind === 'caps') {
      const caps = capsOf(value);
      if (caps === 'none' || Object.keys(caps).length) options[option.key] = caps;
    } else if (option.kind !== 'entities' && Array.isArray(value)) {
      const known =
        option.kind === 'views' ? optionalViews(template).map((view) => view.key) : undefined;
      const kept = value.filter(
        (item): item is string =>
          typeof item === 'string' && item.length > 0 && (!known || known.includes(item)),
      );
      if (kept.length) options[option.key] = [...new Set(kept)];
    }
  }
  return options;
}
