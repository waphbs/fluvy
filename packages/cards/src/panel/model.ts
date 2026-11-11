import {
  LANGUAGES,
  localize,
  lookKey,
  chromeOf,
  sameChrome,
  sameTabs,
  tabsOf,
  paletteKey,
  paletteOf,
  type ChartSettings,
  type DevicePatch,
  type DeviceSettings,
  type EffectiveSettings,
  type MessageKey,
  type SliderStyle,
  type WallSettings,
  type HomeAssistant,
  type KeyOf,
  type Look,
  type LookHandle,
} from '@fluvy/core';
import {
  DEFAULT_PALETTE,
  deltaE,
  GATES,
  PALETTE_NAMES,
  presetSeeds,
  STATUS_NAMES,
  type CustomPalette,
  type Hex,
  type PaletteChoice,
  type PaletteFile,
  type PaletteMode,
  type PaletteModeColors,
  type PaletteName,
  type RoleColors,
  type StatusColours,
  type StatusName,
} from '@fluvy/tokens/runtime';
import { COMMUNITY_PALETTES } from '@fluvy/tokens/community';
import type { ChipFit } from '../shared/chips.js';
import type { Template } from '../strategy/templates.js';
import type { View } from '../strategy/types.js';
import { chartLines } from './chart-words.js';
import { knownPalettes, matchOf } from './palettes.js';
import type { SeriesDraft } from './series.js';

/** Where a person who speaks a language better than we do can help. */
export const TRANSLATING_URL = 'https://github.com/acosta290/fluvy/blob/main/docs/translating.md';

/**
 * The panel's tabs, one row of them (Fluvy's own facts — its version, its file — close Preferences); the charts are
 * chosen like the look, so their tab follows Appearance.
 */
export type Tab = 'appearance' | 'charts' | 'scope' | 'dashboard' | 'wall' | 'preferences';
export const TABS: readonly Tab[] = [
  'appearance',
  'charts',
  'scope',
  'dashboard',
  'wall',
  'preferences',
];

export type StringKey = KeyOf<'panel'>;

/** A slider style's word among the options: the fill's is a tile's ("Fill"), where `fill` alone is a view's. */
export const SLIDER_WORD: Readonly<Record<SliderStyle, MessageKey>> = {
  ruler: 'option.ruler',
  bar: 'option.bar',
  liquid: 'option.liquid',
  fill: 'option.tile_fill',
};

/** The house's settings the tabs edit (an administrator's to save); `wall`, `charts`, `cards` and `sliders` always whole. */
export type HouseEdit = Partial<
  Pick<
    EffectiveSettings,
    | 'cards'
    | 'charts'
    | 'sliders'
    | 'scope'
    | 'dashboards'
    | 'frame'
    | 'icons'
    | 'activity'
    | 'history'
    | 'wall'
    | 'lightTint'
    | 'lightColors'
    | 'statuses'
  >
>;
/** A person's preferences, their own to save. */
export type PersonalEdit = Partial<
  Pick<EffectiveSettings, 'language' | 'motion' | 'haptics' | 'activityCard'>
>;
/** The words a shared palette carries: what the Share card's fields hold. */
export interface ShareDraft {
  readonly title: string;
  readonly author: string;
}

/** Options of a dashboard's strategy; `undefined` takes a key away (back to its default). */
export type StrategyEdit = Readonly<Record<string, unknown>>;
/** The pending edits of every dashboard, by its url path. */
export type StrategyEdits = Readonly<Record<string, StrategyEdit>>;

/**
 * What every section renders from, and the panel's actions it may call. Nothing a tab changes is saved at once:
 * it is an edit, shown live on this page (the look on the panel, where it applies and the preferences on the
 * whole screen), and saved with the others from the apply bar.
 */
export interface PanelContext {
  readonly hass: HomeAssistant;
  readonly t: (key: StringKey, values?: Record<string, string | number>) => string;
  readonly admin: boolean;
  readonly mode: PaletteMode;
  /** The panel is 648 or wider: desktop gaps (12) and art sizes; a phone's are 8. */
  readonly wide: boolean;
  /** What a row of choices is laid out by: the panel's text ruler and a card's content width (none until laid out). */
  readonly fit?: ChipFit | undefined;
  readonly handle: LookHandle;
  /** What is saved. */
  readonly settings: EffectiveSettings;
  /** What the tabs show: the saved settings with the edits on top. */
  readonly shown: EffectiveSettings;
  /** The look being chosen (what the gallery shows as selected, what the preview wears). */
  readonly draft: Look;
  /** The look differs from the one in use. */
  readonly dirty: boolean;
  readonly houseEdit: HouseEdit;
  readonly personalEdit: PersonalEdit;
  readonly strategyEdits: StrategyEdits;
  /** What this browser is (a wall panel or not, its size), as remembered, and the changes waiting in the apply bar. */
  readonly device: DeviceSettings;
  readonly deviceEdit: DevicePatch;
  /** The house's saved palettes (an administrator's to change). */
  readonly saved: readonly PaletteFile[];
  /** The Share card's title and author for the custom palette in the draft. */
  readonly share: ShareDraft;
  /** Every community palette is listed (six by default). */
  readonly showAllCommunity: boolean;
  readonly tryOnApp: boolean;
  readonly dashboards: readonly DashboardInfo[];
  /** A dashboard's strategy as saved, with its edits on top (undefined: it is not one of ours). */
  strategyOf(urlPath: string): Readonly<Record<string, unknown>> | undefined;
  /** The cards a dashboard's strategy draws right now, once the panel asked for them (undefined: not asked yet). */
  previewOf(urlPath: string): readonly View[] | undefined;
  /** Generates a dashboard's cards (with no edits on top) so a person can change them here. */
  loadPreview(urlPath: string): void;
  setDraft(look: Partial<Look>): void;
  editHouse(edit: HouseEdit): void;
  /** A wall setting, on the latest of the wall's (two taps before a render never lose the first). */
  editWall(patch: Partial<WallSettings>): void;
  /** A chart setting, on the latest of the house's chart settings, as the wall's are edited. */
  editCharts(patch: Partial<ChartSettings>): void;
  /** The set of series colours being made or changed (the Charts tab's editor), when one is open. */
  readonly seriesDraft: SeriesDraft | undefined;
  setSeriesDraft(draft: SeriesDraft | undefined): void;
  editPersonal(edit: PersonalEdit): void;
  editStrategy(urlPath: string, edit: StrategyEdit): void;
  /** This device's own settings — a wall panel or not, its size (its own memory, saved from the apply bar like the rest). */
  editDevice(patch: DevicePatch): void;
  /** The screensaver as the wall would show it now, over this page until a tap. */
  previewScreensaver(): void;
  setTryOnApp(on: boolean): void;
  /** A word for a moment (the notice under the bar). */
  notify(key: StringKey): void;
  setShare(patch: Partial<ShareDraft>): void;
  setShowAllCommunity(on: boolean): void;
  /** Saves every edit; a changed look for the house or for this person. */
  apply(to: 'house' | 'me'): void;
  discard(): void;
  /** Runs a change against Home Assistant; `done` is the word shown when it succeeds ("Saved" by default). */
  run(task: () => Promise<unknown>, done?: StringKey): void;
}

export interface DashboardInfo {
  readonly urlPath: string;
  readonly title: string;
  /** Its sidebar icon (`mdi:…`, `fluvy:…`), when it has one. */
  readonly icon?: string;
  /** Its strategy as saved (`type` and the options), and the template that type names, when it is one of ours. */
  readonly strategy?: Record<string, unknown>;
  readonly template?: Template;
  /** Its id in the dashboards collection and whether the sidebar lists it: what an administrator's list says. */
  readonly id?: string;
  readonly inSidebar?: boolean;
}

/** A dashboard as the dashboards collection lists it (`lovelace/dashboards/list`, an administrator's call). */
export interface DashboardEntry {
  readonly id: string;
  readonly url_path: string;
  readonly title: string;
  readonly icon?: string | null;
  readonly show_in_sidebar: boolean;
}

/** The presets by line, in presentation order: the launch palette (the one a reset returns to) leads its line. */
export const LINES: readonly {
  readonly key: 'soft' | 'vivid';
  readonly names: readonly PaletteName[];
}[] = [
  {
    key: 'soft',
    names: PALETTE_NAMES.filter(
      (name) => presetSeeds.find((seed) => seed.name === name)?.character !== 'vivid',
    ).sort((a, b) => Number(b === DEFAULT_PALETTE) - Number(a === DEFAULT_PALETTE)),
  },
  {
    key: 'vivid',
    names: PALETTE_NAMES.filter(
      (name) => presetSeeds.find((seed) => seed.name === name)?.character === 'vivid',
    ),
  },
];

/**
 * Accents offered for a custom palette, by style (any colour can still be typed): pastels (a pick lends its hue:
 * the line is drawn deeper and the tiles' fill paler) and electric colours, twelve round the wheel. The two lists
 * go hue for hue, so changing the style keeps the colour's place.
 */
export const ACCENTS: Readonly<Record<'soft' | 'vivid', readonly Hex[]>> = {
  soft: [
    '#f9b9d0',
    '#febab6',
    '#f9c09e',
    '#efd99e',
    '#c2d79e',
    '#a0debc',
    '#8ddfde',
    '#97d8f8',
    '#b0d0ff',
    '#c7c8ff',
    '#dcc0f7',
    '#efbbe4',
  ],
  vivid: [
    '#ff2d7a',
    '#e5243b',
    '#ff4a1a',
    '#ffb000',
    '#c6ff00',
    '#00b377',
    '#00a3a3',
    '#00b4e6',
    '#2f5bff',
    '#5a4fff',
    '#8a3ffc',
    '#d63bff',
  ],
};

/** The same place in the other style's list, for a listed accent; any other colour stays as it is. */
export function accentFor(accent: Hex, character: 'soft' | 'vivid'): Hex {
  const other = character === 'soft' ? ACCENTS.vivid : ACCENTS.soft;
  const index = other.indexOf(accent);
  return index < 0 ? accent : (ACCENTS[character][index] ?? accent);
}

/** Second colours a vivid custom palette can carry. */
export const HIGHLIGHTS: readonly Hex[] = ['#e2ff3d', '#5ce1ff', '#ffe14d', '#ffb3d1', '#d4c2ff'];

export const DEFAULT_CUSTOM: CustomPalette = {
  character: 'vivid',
  base: 'cool',
  accent: '#2f5bff',
  fill: 'tint',
};

export const isCustom = (choice: PaletteChoice): choice is CustomPalette =>
  typeof choice !== 'string';

/**
 * What a palette's miniature draws, in the mode on screen: its page, an "on" tile in its fill with the icon and
 * the lit ticks (the accent's ink on a tint, the fill's own ink on a solid colour), an "off" tile in its card,
 * and its highlight when it has one.
 */
export function swatchColors(choice: PaletteChoice, mode: PaletteMode) {
  const colors = paletteOf(choice)[mode];
  const solid = colors.fillStyle === 'solid';
  return {
    page: colors.surface.page,
    card: colors.surface.card,
    border: colors.surface.border,
    accent: colors.accent.ink,
    fill: colors.accent.fill,
    tick: solid ? colors.accent.onFill : colors.accent.ink,
    highlight: colors.mark?.fill,
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The part of an edit that differs from what is saved (an edit back to the saved value is no edit). */
export function unsaved<T extends object>(edit: T, saved: object): T {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(edit))
    if (!same(value, (saved as Record<string, unknown>)[key])) kept[key] = value;
  return kept as T;
}

/** A strategy with its edits on top (an `undefined` edit takes the key away). */
export function withEdit(
  strategy: Readonly<Record<string, unknown>>,
  edit: StrategyEdit,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...strategy, ...edit };
  for (const [key, value] of Object.entries(edit)) if (value === undefined) delete next[key];
  return next;
}

/** The same look: the same tokens and the same view tabs. */
export const sameLook = (a: Look, b: Look): boolean =>
  lookKey(a) === lookKey(b) &&
  sameTabs(tabsOf(a), tabsOf(b)) &&
  sameChrome(chromeOf(a), chromeOf(b));

/**
 * A palette's name: a preset's own (the same in every language), a saved or community palette's title when the
 * choice equals one (`known`: the house's palettes and the community's), else "Custom".
 */
export const paletteTitle = (
  choice: PaletteChoice,
  t: PanelContext['t'],
  known: readonly PaletteFile[] = COMMUNITY_PALETTES,
): string =>
  isCustom(choice)
    ? (matchOf(choice, known)?.title ?? t('palette.custom'))
    : (presetSeeds.find((seed) => seed.name === choice)?.title ?? choice);

export const shapeTitle = (look: Look, t: PanelContext['t']): string =>
  t(`shape.${look.shape}` as StringKey);

/** "Linen · Soft". */
export const lookTitle = (
  look: Look,
  t: PanelContext['t'],
  known: readonly PaletteFile[] = COMMUNITY_PALETTES,
): string => `${paletteTitle(look.palette, t, known)} · ${shapeTitle(look, t)}`;

export const pillTitle = (look: Look, t: PanelContext['t']): string =>
  t(`pills.${look.pills}` as StringKey);

/** What a look change is, in a line: what moved, each from → to ("Linen → Volt · Soft → Round"). */
export function changeTitle(
  from: Look,
  to: Look,
  t: PanelContext['t'],
  known: readonly PaletteFile[] = COMMUNITY_PALETTES,
): string {
  const parts: string[] = [];
  if (paletteKey(from.palette) !== paletteKey(to.palette))
    parts.push(`${paletteTitle(from.palette, t, known)} → ${paletteTitle(to.palette, t, known)}`);
  if (from.shape !== to.shape) parts.push(`${shapeTitle(from, t)} → ${shapeTitle(to, t)}`);
  if (from.pills !== to.pills) parts.push(`${pillTitle(from, t)} → ${pillTitle(to, t)}`);
  const [a, b] = [tabsOf(from), tabsOf(to)];
  if (a.style !== b.style)
    parts.push(
      `${t('tabs.title')} · ${t(`tabs.${a.style}` as StringKey)} → ${t(`tabs.${b.style}` as StringKey)}`,
    );
  else if (!sameTabs(a, b)) parts.push(t('tabs.title'));
  if (!sameChrome(chromeOf(from), chromeOf(to))) parts.push(t('chrome.title'));
  return parts.join(' · ');
}

/**
 * A status's own colour (1.9): six round the wheel, the same in every status's row, #47's orange among them; a status
 * made "Custom" starts on its own (`STATUS_STARTS`).
 */
export const STATUS_SWATCHES: readonly Hex[] = [
  '#e03131',
  '#dc630b',
  '#fab005',
  '#2f9e44',
  '#1c7ed6',
  '#7048e8',
];
export const STATUS_STARTS: Readonly<Record<StatusName, Hex>> = {
  warning: '#dc630b',
  danger: '#e03131',
  success: '#2f9e44',
  notice: '#1c7ed6',
};

const statusOf = (colors: PaletteModeColors, name: StatusName): RoleColors =>
  name === 'notice' ? colors.notice : colors.semantic[name];

/**
 * The status each picked one sits too close to on a palette — ΔE2000 under `GATES.fillSeparation`, fill to fill or ink
 * to ink, in either mode — after the engine has moved it as far as lightness and chroma can: what the panel says under
 * it, never a hue turned aside. A status left to the palette is not asked.
 */
export function closeStatuses(
  choice: PaletteChoice,
  statuses: StatusColours,
): Partial<Record<StatusName, StatusName>> {
  const palette = paletteOf(choice, statuses);
  const close: Partial<Record<StatusName, StatusName>> = {};
  for (const name of STATUS_NAMES) {
    const near = STATUS_NAMES.find(
      (other) =>
        statuses[name] &&
        other !== name &&
        (['light', 'dark'] as const).some((mode) => {
          const [a, b] = [statusOf(palette[mode], name), statusOf(palette[mode], other)];
          return (
            deltaE(a.fill, b.fill) < GATES.fillSeparation ||
            deltaE(a.ink, b.ink) < GATES.fillSeparation
          );
        }),
    );
    if (near) close[name] = near;
  }
  return close;
}

/** The wall's settings by the label the Wall tab gives them (the hours share the day-and-night line). */
const WALL_LABELS: ReadonlyArray<readonly [keyof WallSettings, StringKey]> = [
  ['dashboards', 'wall.dashboards'],
  ['after', 'wall.after'],
  ['clock', 'wall.clock'],
  ['dim', 'wall.dim'],
  ['wakeEntity', 'wall.wake'],
  ['theme', 'wall.day_night'],
  ['from', 'wall.day_night'],
  ['to', 'wall.day_night'],
  ['nightDim', 'wall.night_dim'],
  ['background', 'wall.background'],
  ['exit', 'wall.exit'],
  ['subview', 'wall.subview'],
];

/** Every pending change as a line of the apply bar, in the order of the tabs. */
export function changeLines(ctx: PanelContext): string[] {
  const { t, shown } = ctx;
  const onOff = (on: boolean): string => t(on ? 'change.on' : 'change.off');
  const lines: string[] = [];
  if (ctx.dirty) lines.push(changeTitle(ctx.settings.look, ctx.draft, t, knownPalettes(ctx.saved)));
  const house = ctx.houseEdit;
  if (house.cards) {
    const { opacity, blur, unavailable } = house.cards;
    if (opacity !== ctx.settings.cards.opacity)
      lines.push(
        `${t('cards.title')} · ${t('cards.opacity')} · ${t('wall.percent', { count: opacity })}`,
      );
    if (blur !== ctx.settings.cards.blur)
      lines.push(`${t('cards.title')} · ${t('cards.blur')} · ${onOff(blur)}`);
    if (unavailable !== ctx.settings.cards.unavailable)
      lines.push(
        `${t('cards.title')} · ${t('cards.unavailable')} · ${localize(ctx.hass, `option.${unavailable}`)}`,
      );
  }
  if (house.sliders) {
    const { style, words } = house.sliders;
    if (style !== ctx.settings.sliders.style)
      lines.push(
        `${t('sliders.title')} · ${t('sliders.style')} · ${localize(ctx.hass, SLIDER_WORD[style])}`,
      );
    if (words !== ctx.settings.sliders.words)
      lines.push(
        `${t('sliders.title')} · ${t('sliders.words')} · ${localize(ctx.hass, `option.${words}`)}`,
      );
  }
  if (house.lightTint)
    lines.push(
      `${t('lights.title')} · ${t('lights.tint')} · ${localize(ctx.hass, `option.${house.lightTint === 'off' ? 'never' : house.lightTint}`)}`,
    );
  if (house.lightColors !== undefined)
    lines.push(`${t('lights.title')} · ${t('lights.colors')} · ${onOff(house.lightColors)}`);
  if (house.statuses)
    for (const name of STATUS_NAMES)
      if (house.statuses[name] !== ctx.settings.statuses[name])
        lines.push(
          `${t('statuses.title')} · ${t(`statuses.${name}`)} · ${house.statuses[name] ?? t('statuses.auto')}`,
        );
  lines.push(...chartLines(ctx));
  if (house.scope)
    lines.push(t(house.scope === 'everywhere' ? 'change.everywhere' : 'change.dashboards'));
  if (house.dashboards) lines.push(`${t('scope.list')} · ${shown.dashboards.length}`);
  if (house.frame !== undefined) lines.push(`${t('scope.frame')} · ${onOff(house.frame)}`);
  if (house.icons !== undefined) lines.push(`${t('scope.icons')} · ${onOff(house.icons)}`);
  if (house.activity !== undefined) lines.push(`${t('scope.activity')} · ${onOff(house.activity)}`);
  if (house.history !== undefined) lines.push(`${t('scope.history')} · ${onOff(house.history)}`);
  const device = ctx.deviceEdit;
  if (device.wall !== undefined)
    lines.push(`${t('tab.wall')} · ${t('wall.use')} · ${onOff(device.wall)}`);
  if (device.zoom !== undefined)
    lines.push(`${t('pref.size')} · ${t('wall.percent', { count: device.zoom })}`);
  if (house.wall)
    for (const [key, label] of WALL_LABELS)
      if (JSON.stringify(house.wall[key]) !== JSON.stringify(ctx.settings.wall[key]))
        lines.push(`${t('tab.wall')} · ${t(label)}`);
  for (const [urlPath, edit] of Object.entries(ctx.strategyEdits)) {
    const dashboard = ctx.dashboards.find((d) => d.urlPath === urlPath);
    for (const key of Object.keys(edit)) {
      const label = dashboard?.template?.options.find((option) => option.key === key)?.label;
      lines.push(`${dashboard?.title ?? urlPath} · ${t(label ?? 'dashboard.cards')}`);
    }
  }
  const personal = ctx.personalEdit;
  if (personal.language)
    lines.push(
      `${t('pref.language')} · ${personal.language === 'auto' ? t('pref.auto') : LANGUAGES[personal.language].name}`,
    );
  if (personal.motion) lines.push(`${t('pref.reduce')} · ${onOff(personal.motion === 'reduced')}`);
  if (personal.haptics !== undefined)
    lines.push(`${t('pref.haptics')} · ${onOff(personal.haptics)}`);
  if (personal.activityCard !== undefined)
    lines.push(`${t('pref.activity_card')} · ${onOff(personal.activityCard)}`);
  return lines;
}
