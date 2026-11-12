import type { Tint } from '../shared/colour.js';
import {
  actionRuns,
  areaEntities,
  areasInOrder,
  entriesOf,
  formatNumber,
  idsOf,
  isActive,
  isUsable,
  registryText,
  sliderStill,
  sliderStyleOf,
  sliderWordsOf,
  strings,
  textName,
  type EntityName,
  type EntityView,
  type FluvyCardConfig,
  type LovelaceGridOptions,
  type Registries,
} from '@fluvy/core';
import {
  chips,
  clickPress,
  head,
  listRow,
  preventMenu,
  round,
  rulerLabels,
  sheetStyles,
  startPress,
  toggle,
  type ChipItem,
  type RulerChangeDetail,
  type Tone,
} from '@fluvy/ui';
import {
  css,
  html,
  nothing,
  type CSSResultGroup,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { HeadFit, SWITCH_SLOT } from '../energy/head.js';
import type { CardEditor } from '../shared/base.js';
import { toneOf } from '../shared/colour.js';
import { ITEM_ALIASES, type AliasSpec } from '../shared/config.js';
import { onOfShort } from '../shared/counted.js';
import { iconOf } from '../shared/domain.js';
import {
  chipRows,
  EMPTY,
  entryCount,
  HEAD,
  NAME_LINE,
  rowsOf,
  twoLines,
  type NameOf,
} from '../shared/heights.js';
import { hideEmpty, itemsOf, listOf, type EmptyList } from '../shared/lists.js';
import {
  COLOURED,
  DIMMABLE,
  lightLook,
  litColour,
  withMembers,
  type LightWhites,
} from '../shared/light.js';
import type { SwatchEntry } from '../light/swatches.js';
import { FluvyTileCard, type NameLines } from '../tile/tile-card.js';
import { fittedColumns } from '../shared/chips.js';
import { levelRound, ROUND, ROUND_GAP } from '../shared/round.js';
import type { FluvyLightsColourSheet, LightsColourHost } from './sheet/lights-colour-sheet.js';

const s = strings('lights');

export type LightsVariant = 'row' | 'chips' | 'tiles';
export const LIGHTS_VARIANTS: readonly LightsVariant[] = ['row', 'chips', 'tiles'];

/** One light of the room: its own name, icon and colour beside the entity's. */
export interface LightItem {
  entity: string;
  name?: EntityName;
  icon?: string;
  /** The light's own colour when it is on (a Home Assistant colour name or `#rrggbb`), over its bulb's. */
  color?: string;
}

export interface LightsCardConfig extends FluvyCardConfig, EmptyList {
  /** The room: its lights, in name order, when `lights` lists none. */
  area?: string;
  /** `tiles`: each lamp shows its colour at rest too (`always`), or only when on (`on`, the default). */
  tint?: Tint;
  /** The lights, in the order they are drawn (default: the area's). */
  lights?: readonly (string | LightItem)[];
  /**
   * `row` (default): the room on one line, each light a round beside its name — the card's tap is the whole room.
   * `chips`: the room's switch in the head, each light a chip with its name. `tiles`: each light a compact tile.
   */
  variant?: LightsVariant;
  /** "2 of 3 on" in the second line (default). */
  show_count?: boolean;
  /** The lights' level: the average in the second line, each round's ring (default). */
  show_level?: boolean;
  /** One brightness ruler for the room, under the head (chips and tiles). */
  show_brightness?: boolean;
  /** A light that is on wears its bulb's own colour when it has one (default); off: the palette's light. */
  light_colors?: boolean;
  /** A lit white in its bulb's colour: by its temperature (the default, 1.10), or as the palette's light (`palette`). */
  light_whites?: LightWhites;
  /** `tiles`: a light's name in two lines where one would cut it (`2`), every tile a line taller (#100). */
  name_lines?: NameLines;
  /**
   * A colour round in the head (#137), its own tap opening the room's colours; off unless asked, and only where a
   * light of the room takes a colour: a card that does not ask draws as it did.
   */
  show_color?: boolean;
  /**
   * What the round opens: Fluvy's sheet for the whole room (default), or Home Assistant's details of the card's one
   * light (a light group counts as one; a card of several keeps the sheet).
   */
  color_action?: 'sheet' | 'more-info';
  /** The sheet's hue control: the hue ruler (default) or the hue wheel. */
  color_control?: 'ruler' | 'wheel';
  /** The sheet's quick colours, as the light card lists them (none: the room's six). */
  colors?: readonly SwatchEntry[];
  /** Test hook: the colour sheet docked in the card's place (the playground). Undocumented. */
  _sheet?: boolean;
}

/** What the room's name keeps beside its rounds before they take their own line. */
const MIN_TITLE = 96;
/** An inner tile (a compact tile inside a card) is 84 tall. */
const INNER = 84;
/** A filled chip row's line: the 36 pill in its 44 target, the lines touching. */
const CHIP_LINE = 44;
/** The room's ruler: 16 above it, the ruler (44) and its labels (20). */
const RULER = 80;
/** The colour round stands 16 before the lights' rounds, so it never reads as one of them (#137). */
const COLOUR_GAP = 16;
/** A head's round and the 12 before it. */
const ROUND_SLOT = ROUND + 12;
/** An inner tile narrower than this has no room for its circle and a name: the tiles take one a row. */
const TILE_MIN = 120;
/** The empty panel with its hint under the line (8 + 20 more). */
const EMPTY_HINT = EMPTY + 12;

/** Five lamps and more take three a line at most (names are long): fewer keep the chips' own columns. */
const chipCandidates = (count: number): number[] | undefined => (count > 4 ? [3, 2] : undefined);

/**
 * A room's lights as the house lists them: the room's own (`area`, read where the card names a room), each light's
 * name, and whether the person reading is an administrator (the empty panel's hint is theirs).
 */
export interface RoomLights {
  readonly area: readonly string[] | undefined;
  readonly nameOf: NameOf;
  readonly admin: boolean;
  /** A light of the card takes a colour (the colour round shows); unknown: one does, as a bulb the house has not described. */
  readonly colour?: boolean;
}

/**
 * The card's height at a 360 column, for the automatic dashboard's columns: its lights — the config's, else the
 * room's as the house lists them (`house-heights.ts`; three where it is not there to say) — as rounds beside the
 * room's name or on lines of their own, chips in the rows their names take, or tiles two a row, the ruler with them;
 * no lights, the panel under the head.
 */
export function lightsHeight(config: LightsCardConfig, house?: RoomLights): number {
  const listed = entryCount(config, ['lights', 'entities']);
  // no lights and no room to find them in: the panel under the head (its hint, unless the card has its own words)
  if (!listed && !config.area) return HEAD + (config.empty_text ? EMPTY : EMPTY_HINT);
  // a room with no lights is the panel under the head, an administrator's hint with it
  const area = listed ? undefined : house?.area;
  if (area && !area.length) return HEAD + (config.empty_text || !house?.admin ? EMPTY : EMPTY_HINT);
  const n = listed || area?.length || 3;
  const ruler = config.show_brightness ? RULER : 0;
  if (config.variant === 'tiles') {
    const inner = INNER + (twoLines(config) ? NAME_LINE.compact : 0);
    return 20 + 44 + ruler + 16 + rowsOf(n, 2) * (inner + 8) - 8 + 20;
  }
  if (config.variant === 'chips') {
    // filled chips in the rows their names take: as many a row as hold, three or two past four
    const items = entriesOf<LightItem>(config.lights ?? config.entities);
    const names = (area ?? idsOf(items)).map((id, i) => {
      const item = items[i];
      const name = (typeof item === 'object' ? item.name : undefined) ?? house?.nameOf(id);
      return typeof name === 'string' ? name : 'Light';
    });
    const rows = chipRows(names, 'full', 320, chipCandidates(n));
    return 20 + 44 + ruler + 16 + rows * CHIP_LINE + 20;
  }
  // a 320 column holds four rounds beside the name (the icon gives way), three with the colour round before them;
  // more take their own line, six a line
  const colour = config.show_color === true && (house?.colour ?? true);
  return (n <= (colour ? 3 : 4) ? 84 : 20 + 44 + 16 + rowsOf(n, 6) * (ROUND + 8) - 8 + 20) + ruler;
}

/** One light as the card reads it. */
interface Lamp {
  readonly item: LightItem;
  readonly view: EntityView;
  readonly name: string;
  readonly glyph: string;
  readonly usable: boolean;
  readonly on: boolean;
  /** Its level in %, when it is on and dims. */
  readonly level: number | null;
  /** The colour it wears when on (`data-accent`), or none: the tone's own. */
  readonly accent: string | undefined;
  /** The tone it is drawn in when on. */
  readonly tone: Tone;
  /** It takes a colour (`hs`, `rgb`, `rgbw`, `rgbww` or `xy`): what the colour round acts on. */
  readonly colours: boolean;
}

/**
 * A room's lights on one card: the whole room is one tap (on when every light is off, off when any is on), and each
 * light is its own control — a round on the room's line, a chip with its name, or a compact tile — that a tap turns
 * on and off and a hold opens. A light that is on wears its bulb's own colour, and its round a ring of its level.
 */
/**
 * A reading's domain: a light is a light's, and the switch a lamp is drawn from is its own — a room's switch may hold
 * both, and `light.turn_on` never reaches a switch.
 */
const domainOf = (id: string): string => id.slice(0, Math.max(0, id.indexOf('.')));

/** The readings by the domain each is called in. */
function grouped(ids: readonly string[]): [string, string[]][] {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const domain = domainOf(id);
    const held = groups.get(domain);
    if (held) held.push(id);
    else groups.set(domain, [id]);
  }
  return [...groups];
}

export class FluvyLightsCard extends FluvyTileCard {
  /** The card's height at a 360 column from its config alone: a room of three lights (`lightsHeight`). */
  static override layoutHeight(config: LightsCardConfig): number {
    return lightsHeight(config);
  }

  static override styles: CSSResultGroup = [
    ...(FluvyTileCard.styles as CSSResultGroup[]),
    sheetStyles.rooms,
    css`
      .lt-card {
        width: auto;
      }
    `,
  ];

  private readonly head = new HeadFit(this);

  static override properties = {
    ...FluvyTileCard.properties,
    sheetReady_: { state: true },
  };
  /** The colour sheet's chunk has landed (#137). */
  declare sheetReady_: boolean;

  constructor() {
    super();
    this.sheetReady_ = false;
  }

  static override editor(): Promise<CardEditor> {
    return import('./lights-editor.js');
  }
  static override aliases: AliasSpec = {
    keys: [{ from: 'entities', to: 'lights' }],
    items: { lights: ITEM_ALIASES },
  };

  static override getStubConfig(hass: unknown, entities: readonly string[]): LightsCardConfig {
    const lights = entities.filter((id) => id.startsWith('light.')).slice(0, 3);
    const house = hass as Registries | undefined;
    // the first room with a light, in the house's order
    const areas = house?.states ? areasInOrder(house) : [];
    const area = (
      areas.find((room) => house && areaEntities(house, room.area_id, { domains: ['light'] })[0]) ??
      areas[0]
    )?.area_id;
    return lights.length
      ? { type: 'custom:fluvy-lights-card', lights }
      : { type: 'custom:fluvy-lights-card', ...(area ? { area } : {}) };
  }

  protected override prepare(config: LightsCardConfig): LightsCardConfig {
    listOf(config, 'lights');
    return config;
  }

  private get room(): LightsCardConfig | undefined {
    return this.config as LightsCardConfig | undefined;
  }

  private get variant(): LightsVariant {
    const asked = this.room?.variant;
    return asked && LIGHTS_VARIANTS.includes(asked) ? asked : 'row';
  }

  /** The lights asked for, else the area's in name order. */
  private items(): LightItem[] {
    const asked = itemsOf<LightItem>(this.room?.lights);
    if (asked.length) return asked;
    const area = this.room?.area;
    if (!area || !this.hass) return [];
    return areaEntities(this.hass, area, { domains: ['light'] })
      .map((entity) => ({ entity, name: this.entity(entity).name }))
      .sort((a, b) => a.name.localeCompare(b.name, this.hass?.language))
      .map(({ entity }) => ({ entity }));
  }

  protected override watched(): readonly string[] {
    return withMembers(
      this.items().map((item) => item.entity),
      this.hass,
    );
  }

  override getCardSize(): number {
    return this.variant === 'row' ? 1 : 3;
  }
  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: this.variant === 'row' ? 4 : 6 };
  }

  /** Each light as drawn: on as the finger left it until Home Assistant agrees, its level, its colour. */
  private lamps(): Lamp[] {
    const colours = this.room?.light_colors !== false;
    return this.items().map((item) => {
      const view = this.entity(item.entity);
      const usable = isUsable(view);
      const state = this.stateOf(view);
      const on = usable && (state === view.state ? isActive(view) : state === 'on');
      const raw = view.attr<number | null>('brightness');
      const modes = view.attr<string[]>('supported_color_modes') ?? [];
      const dims = modes.some((m) => DIMMABLE.has(m));
      const level =
        on && dims && typeof raw === 'number' ? Math.max(1, Math.round((raw / 255) * 100)) : null;
      // by the rule every light follows (`lightLook`): its own colour, else its bulb's — the one it last glowed while a
      // flip waits for Home Assistant — else the card's colour or tone, else the palette's light
      const [colour, tone] = lightLook(
        item,
        this.config,
        colours ? litColour(view, on, this.room?.light_whites, this.hass) : undefined,
      );
      return {
        item,
        view,
        name: this.nameFor(view, item.name),
        // its own icon, else the one the person set in Home Assistant (a floor lamp, a ceiling light), else the bulb
        glyph: iconOf(view, item.icon),
        usable,
        on,
        level,
        accent: this.accents.item(colour),
        tone,
        colours: modes.some((m) => COLOURED.has(m)),
      };
    });
  }

  /** The whole room: every light off when one is on, else every light on. */
  private flipRoom(lamps: readonly Lamp[]): void {
    const usable = lamps.filter((lamp) => lamp.usable);
    if (!usable.length || !this.hass) return;
    const next = !usable.some((lamp) => lamp.on);
    for (const lamp of usable) this.expect(lamp.view.id, next ? 'on' : 'off');
    // a room drawn from a relay's switches as much as from lights: each reading is called in its own domain
    for (const [domain, ids] of grouped(usable.map((lamp) => lamp.view.id)))
      this.call(domain, next ? 'turn_on' : 'turn_off', { entity_id: ids }, '');
  }

  private flipLamp(lamp: Lamp): void {
    if (!lamp.usable) return;
    this.expect(lamp.view.id, lamp.on ? 'off' : 'on');
    this.call(domainOf(lamp.view.id), lamp.on ? 'turn_off' : 'turn_on', {}, lamp.view.id);
  }

  private openLamp(lamp: Lamp): void {
    this.tap(lamp.view.id, { action: 'more-info' });
  }

  /** The room's level for its ruler: what is on (all of it when nothing is), to the level asked. */
  private setRoom(lamps: readonly Lamp[], value: number): void {
    const usable = lamps.filter((lamp) => lamp.usable);
    const lit = usable.filter((lamp) => lamp.on);
    const targets = (lit.length ? lit : usable).map((lamp) => lamp.view.id);
    if (!targets.length) return;
    for (const id of targets) this.expect(id, value > 0 ? 'on' : 'off');
    // a level is the light's own; a relay beside it takes the switch alone
    for (const [domain, ids] of grouped(targets))
      if (value <= 0) this.call(domain, 'turn_off', { entity_id: ids }, '');
      else if (domain === 'light') this.call('light', 'turn_on', { entity_id: ids, brightness_pct: value }, '');
      else this.call(domain, 'turn_on', { entity_id: ids }, '');
  }

  /** The average level of what is on and dims, or `null`. */
  private levelOf(lamps: readonly Lamp[]): number | null {
    const levels = lamps.map((lamp) => lamp.level).filter((v): v is number => v !== null);
    return levels.length ? Math.round(levels.reduce((sum, v) => sum + v, 0) / levels.length) : null;
  }

  /** The count's shorter forms ("2/3 on", "2/3") for a head too narrow for "2 of 3 on"; none without a count. */
  private short(lamps: readonly Lamp[]): string[] {
    const on = lamps.filter((lamp) => lamp.on).length;
    return on && lamps.some((lamp) => lamp.usable) && this.room?.show_count !== false
      ? onOfShort(this.hass, on, lamps.length)
      : [];
  }

  /** "2 of 3 on · 70 %", "Off", "Unavailable". */
  private line(lamps: readonly Lamp[]): string {
    if (!lamps.some((lamp) => lamp.usable)) return this.t('state.unavailable');
    const on = lamps.filter((lamp) => lamp.on).length;
    if (!on) return this.t('common.off');
    const level = this.room?.show_level !== false ? this.levelOf(lamps) : null;
    return [
      this.room?.show_count !== false
        ? this.t('common.on_of', { on, count: lamps.length })
        : this.t('common.on'),
      level !== null ? `${formatNumber(this.hass, level, { digits: 0 })} %` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** The room's area, where the card names one. */
  private get area() {
    return this.room?.area ? this.hass?.areas?.[this.room.area] : undefined;
  }

  /** The room's name: the card's own, else its area's, else "Lights". */
  private roomName(): string {
    return textName(this.config?.name) ?? (registryText(this.area?.name) || s(this.hass, 'title'));
  }

  protected override renderCard(): TemplateResult {
    if (this.room?._sheet) return this.sheetElement(true);
    const lamps = this.lamps();
    const w = this.contentWidth;
    const name = this.roomName();
    // the room's own glyph — never a light's, so the room's circle is never taken for one of its lights
    const glyph = this.config?.icon ?? this.area?.icon ?? 'home';
    hideEmpty(this, !lamps.length);
    const own = this.room?.empty_text;
    // the card's own words for an empty room say what it means here: the hint on how to fill it goes with ours
    if (!lamps.length)
      return html`<article class="fv-card lt-card" data-card>
        ${head({ icon: glyph, tone: 'neutral', title: name, name: true })}
        ${this.head.empty('bulb', own ?? s(this.hass, 'no_lights'), own ? '' : s(this.hass, 'no_lights_hint'), w)}
      </article>`;
    const any = lamps.some((lamp) => lamp.on);
    const dead = !lamps.some((lamp) => lamp.usable);
    const tone: Tone = dead ? 'off' : any ? toneOf(this.config, 'light') : 'neutral';
    const sub = this.line(lamps);
    if (this.variant === 'row') return this.renderRow(lamps, name, glyph, tone, sub, w);

    // the colour round before the switch, while the name keeps its floor beside them; else its row under the body
    const colour = this.showsColour(lamps);
    const roundInHead = colour && w - ROUND_SLOT - SWITCH_SLOT - 12 >= this.titleFloor(name);
    // out of reach, the room keeps its switch where it stands, disabled (1.9)
    const fitted = this.head.fit({
      width: w,
      title: name,
      sub,
      shorter: this.short(lamps),
      trailing: SWITCH_SLOT + (roundInHead ? ROUND_SLOT : 0),
    });
    const roomSwitch = toggle(
      any,
      toneOf(this.config, 'light'),
      () => this.flipRoom(lamps),
      name,
      dead,
    );
    return html`<article class="fv-card lt-card ${dead ? 'is-unavailable is-off' : ''}" data-card>
      ${head({
        icon: fitted.icon ? glyph : null,
        small: fitted.small,
        tone,
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: roundInHead ? html`${this.colourRound(name, dead)}${roomSwitch}` : roomSwitch,
        cut: fitted.cut,
        ...(this.roomActs(dead) ? { onTap: () => this.roomTap(lamps) } : {}),
        ...(actionRuns(this.config?.hold_action) ? { onHold: () => this.hold(undefined) } : {}),
      })}
      ${this.room?.show_brightness ? this.renderRuler(lamps, name, w) : nothing}
      ${this.variant === 'tiles' ? this.renderTiles(lamps) : this.renderChips(lamps, w)}
      ${colour && !roundInHead ? this.renderColourRow(name, w) : nothing} ${this.renderSheet()}
    </article>`;
  }

  /* ---------- the colour round and its sheet (#137) ---------- */

  /** Whether the colour round shows: asked for, and a light of the room takes a colour. */
  private showsColour(lamps: readonly Lamp[]): boolean {
    return this.room?.show_color === true && lamps.some((lamp) => lamp.colours);
  }

  /** The least the room's name keeps beside what trails it: 96, or the whole of a shorter name. */
  private titleFloor(name: string): number {
    return Math.min(MIN_TITLE, this.head.ruler.width('fv-card__title', name));
  }

  /** The round itself: the head's quiet round, "Living room · Colour" to a reader; out of reach it stays, disabled. */
  private colourRound(name: string, dead: boolean): TemplateResult {
    return round(
      'palette',
      'quiet',
      `${name} · ${this.t('light.color')}`,
      (event) => {
        event.stopPropagation();
        this.openColour();
      },
      dead,
      'lt-colour',
    );
  }

  /**
   * The round's row where it could not stand in the head (half a column): "Colour" and a chevron under the body, its
   * circle by the rows' rule — a control never goes, as the map's round steps to a row.
   */
  private renderColourRow(name: string, w: number): TemplateResult {
    const title = this.t('light.color');
    return html`<div class="lt-colour-row">
      ${listRow({
        icon: this.head.rowsKeepIcon(w, [{ title, value: '', end: 44 }], true) ? 'palette' : null,
        tone: 'neutral',
        title,
        compact: true,
        trailing: 'chevron',
        label: `${name} · ${title}`,
        onTap: () => this.openColour(),
      })}
    </div>`;
  }

  /**
   * The round's tap: Home Assistant's details of the card's one light (a light group counts as one) where the card
   * asks for them, else the room's colour sheet.
   */
  private openColour(): void {
    const [only, ...more] = this.items();
    if (this.room?.color_action === 'more-info' && only && !more.length)
      this.tap(only.entity, { action: 'more-info' });
    else void this.openSheet();
  }

  /** The sheet, its chunk fetched the first time: a dashboard that never opens it never pays for it. */
  private async openSheet(): Promise<void> {
    const openedBy = (this.renderRoot as ShadowRoot).activeElement as HTMLElement | null;
    if (!this.sheetReady_) {
      await import('./sheet/lights-colour-sheet.js');
      this.sheetReady_ = true;
    }
    await this.updateComplete;
    this.renderRoot
      .querySelector<FluvyLightsColourSheet>('fluvy-lights-colour-sheet')
      ?.open(openedBy ?? this);
  }

  /**
   * A colour for the room: every light that can be read takes it in one call, each as Home Assistant fits it (a
   * white bulb the nearest white, one that only dims its brightness), and wakes to it.
   */
  private colourRoom(lamps: readonly Lamp[], data: Record<string, unknown>): void {
    const usable = lamps.filter((lamp) => lamp.usable);
    if (!usable.length) return;
    for (const lamp of usable) this.expect(lamp.view.id, 'on');
    this.call('light', 'turn_on', { entity_id: usable.map((lamp) => lamp.view.id), ...data }, '');
  }

  /** What the sheet asks of the card: the room as it draws it, its switch, its colours, its sliders' style. */
  private readonly sheetHost: LightsColourHost = {
    title: () => this.roomName(),
    // the head's own giving way, beside the sheet's switch and no circle: whole segments go, a word is never cut
    line: (width) => {
      const lamps = this.lamps();
      return this.head.fit({
        width,
        title: this.roomName(),
        sub: this.line(lamps),
        shorter: this.short(lamps),
        trailing: SWITCH_SLOT,
        icon: 'never',
      }).sub;
    },
    tone: () => toneOf(this.config, 'light'),
    lamps: () => this.lamps(),
    flip: () => this.flipRoom(this.lamps()),
    colors: () => this.room?.colors,
    control: () => (this.room?.color_control === 'wheel' ? 'wheel' : 'ruler'),
    look: () => sliderStyleOf(this.config),
    still: () => sliderStill(),
    words: (items) => sliderWordsOf(this.config, items, sliderStyleOf(this.config)),
    pick: (data) => this.colourRoom(this.lamps(), data),
    adopt: (root) => this.accents.adopt(root),
  };

  /** The sheet's element once its chunk is here, nothing before. */
  private renderSheet(): TemplateResult | typeof nothing {
    return this.sheetReady_ ? this.sheetElement(false) : nothing;
  }

  /** The sheet's element; docked in the card's place for the playground. */
  private sheetElement(docked: boolean): TemplateResult {
    return html`<fluvy-lights-colour-sheet
      ?docked=${docked}
      ?dark=${this.dark}
      ?no-theme=${this.noTheme}
      .hass=${this.hass}
      .card=${this.sheetHost}
    ></fluvy-lights-colour-sheet>`;
  }

  /** The playground's docked sheet (`_sheet`), opened once its chunk is here. */
  private demo = false;

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    if (this.room?._sheet && !this.demo) {
      this.demo = true;
      void import('./sheet/lights-colour-sheet.js').then(async () => {
        this.sheetReady_ = true;
        await this.updateComplete;
        this.renderRoot.querySelector<FluvyLightsColourSheet>('fluvy-lights-colour-sheet')?.open();
      });
    }
  }

  /** The card's tap: its own action when it has one, else the whole room on or off. */
  private roomTap(lamps: readonly Lamp[]): void {
    if (this.config?.tap_action) this.tap(undefined);
    else this.flipRoom(lamps);
  }

  /** Whether the card's tap can run: its own action when it has one, else while a light of the room can be switched. */
  private roomActs(dead: boolean): boolean {
    const own = this.config?.tap_action;
    return own ? actionRuns(own) : !dead;
  }

  /**
   * The room on one line: its icon, its name and how much is on, and a round a light. The room's switch is a button
   * under the whole card (a tap anywhere but on a round or between them); a round is its light's own switch, beside
   * it for a screen reader, never inside it. Rounds that would leave the name less than it needs take their own
   * line, on whole pixels: the first under the room's icon, the last on the card's edge.
   */
  private renderRow(
    lamps: readonly Lamp[],
    name: string,
    glyph: string,
    tone: Tone,
    sub: string,
    w: number,
  ): TemplateResult {
    const rounds = lamps.length * ROUND + (lamps.length - 1) * ROUND_GAP;
    // the colour round (#137) stands 16 before the lights' rounds, where the card asks for it
    const colour = this.showsColour(lamps);
    const colourWidth = colour ? ROUND + COLOUR_GAP : 0;
    // beside the name while it keeps what it needs — the icon circle gives way first (the head's own rule)
    const title = this.titleFloor(name);
    const inline = w - rounds - colourWidth - 12 >= title;
    // the lights on their own line, the colour round is the head's round while the name keeps its floor beside it;
    // where not even that holds (half a column), it steps to a "Colour" row under them
    const roundInHead = colour && (inline || w - ROUND_SLOT >= title);
    const fitted = this.head.fit({
      width: w,
      title: name,
      sub,
      shorter: this.short(lamps),
      ...(inline ? { trailing: rounds + colourWidth } : roundInHead ? { trailing: ROUND } : {}),
    });
    const dead = tone === 'off';
    const acts = this.roomActs(dead);
    const colourRound = roundInHead ? this.colourRound(name, dead) : nothing;
    const bulbs = inline
      ? html`<div class="lt-bulbs">${lamps.map((lamp) => this.renderBulb(lamp))}</div>`
      : this.renderLine(lamps, w);
    return html`<article
      class="fv-card lt-card lt-card--row ${dead ? 'is-unavailable is-off' : ''}"
      data-card
      role="group"
      aria-label=${name}
    >
      <button
        class="lt-room"
        aria-label=${`${name} · ${sub}`}
        ?disabled=${!acts}
        .fvTap=${() => this.roomTap(lamps)}
        .fvHold=${actionRuns(this.config?.hold_action) ? () => this.hold(undefined) : undefined}
        @pointerdown=${startPress}
        @click=${clickPress}
        @contextmenu=${preventMenu}
      ></button>
      ${head({
        icon: fitted.icon ? glyph : null,
        small: fitted.small,
        tone,
        title: name,
        name: true,
        sub: fitted.sub,
        trailing: inline
          ? colour
            ? html`<div class="lt-trail">${colourRound}${bulbs}</div>`
            : bulbs
          : colourRound,
      })}
      ${inline ? nothing : bulbs}
      ${this.room?.show_brightness ? this.renderRuler(lamps, name, w) : nothing}
      ${colour && !roundInHead ? this.renderColourRow(name, w) : nothing} ${this.renderSheet()}
    </article>`;
  }

  /**
   * The rounds on a line of their own: as many a line as the column holds (six at most), the lines balanced, each
   * round on a whole pixel of one set of columns — the first under the head's icon, the last on the content's edge.
   */
  private renderLine(lamps: readonly Lamp[], w: number): TemplateResult {
    const fits = Math.max(1, Math.min(6, Math.floor((w + ROUND_GAP) / (ROUND + ROUND_GAP))));
    const lines = Math.ceil(lamps.length / fits);
    const columns = Math.ceil(lamps.length / lines);
    const x = (i: number): number =>
      columns === 1 ? 0 : Math.round((i * (w - ROUND)) / (columns - 1));
    return html`<div
      class="lt-bulbs lt-bulbs--line"
      style="height:${lines * (ROUND + ROUND_GAP) - ROUND_GAP}px"
    >
      ${lamps.map((lamp, i) =>
        this.renderBulb(
          lamp,
          `left:${x(i % columns)}px;top:${Math.floor(i / columns) * (ROUND + ROUND_GAP)}px`,
        ),
      )}
    </div>`;
  }

  /**
   * A light's round (`levelRound`): lit, its colour and a ring of its level (all the way round for a light that does
   * not dim, or when the level is not shown); a tap is its switch, a hold its details.
   */
  private renderBulb(lamp: Lamp, place?: string): TemplateResult {
    return levelRound({
      name: lamp.name,
      glyph: lamp.glyph,
      usable: lamp.usable,
      on: lamp.on,
      level: this.room?.show_level !== false && lamp.level !== null ? lamp.level : 100,
      tone: lamp.tone,
      accent: lamp.accent,
      switches: true,
      onTap: () => this.flipLamp(lamp),
      onHold: () => this.openLamp(lamp),
      place,
    });
  }

  /** Each light a chip with its name: a tap turns it on and off, a hold opens it. */
  private renderChips(lamps: readonly Lamp[], w: number): TemplateResult {
    const items: ChipItem[] = lamps.map((lamp) => ({
      key: lamp.view.id,
      label: lamp.name,
      name: true,
      glyph: lamp.glyph,
      active: lamp.on,
      tone: lamp.usable ? lamp.tone : 'off',
      ...(lamp.on && lamp.accent ? { accent: lamp.accent } : {}),
      onHold: () => this.openLamp(lamp),
      ...(lamp.usable ? {} : { unavailable: true }),
    }));
    const byKey = new Map(lamps.map((lamp) => [lamp.view.id, lamp]));
    return html`<div class="lt-chips">
      ${chips(
        items,
        (key) => {
          const lamp = byKey.get(key);
          if (lamp) this.flipLamp(lamp);
        },
        '',
        true,
        // as many a line as the names hold whole, every line as full as the count allows (three: two and one)
        fittedColumns(items, { ruler: this.head.ruler, width: w }, chipCandidates(items.length)),
      )}
    </div>`;
  }

  /**
   * Each light a compact tile, two a row (one where two would leave a tile no room for its name): in its colour (the
   * lamp's), else the card's colour or tone, as a tile of a group is (`lightLook`).
   */
  private renderTiles(lamps: readonly Lamp[]): TemplateResult {
    const column = this.tileWidth();
    const two = column < this.contentWidth;
    return html`<div
      class="rm-controls"
      style=${
        two
          ? `--rm-col:${column}px;--rm-gap:${this.contentWidth - 2 * column}px`
          : 'grid-template-columns:minmax(0, 1fr)'
      }
    >
      ${lamps.map((lamp, index) => {
        const tile = this.renderTile(
          {
            entity: lamp.view.id,
            ...(lamp.item.name ? { name: lamp.item.name } : {}),
            icon: lamp.glyph,
            ...(lamp.accent ? { color: lamp.accent } : {}),
          },
          'compact',
          true,
        );
        // an odd last tile takes the whole row: no row is left half empty
        return two && lamps.length % 2 === 1 && index === lamps.length - 1
          ? html`<div class="lt-span">${tile}</div>`
          : tile;
      })}
    </div>`;
  }

  /** Its tiles are given their lamp's colour (`lamps`): a tile does not look for it again. */
  protected override glow(): undefined {
    return undefined;
  }

  /** Its tiles say their level as its line does (`show_level`). */
  protected override showsLevel(): boolean {
    return this.room?.show_level !== false;
  }

  /** An inner tile's column: two on the 4 grid, whole pixels, the remainder between them; one under 120 each. */
  protected override tileWidth(): number {
    const two = Math.floor((this.contentWidth - 8) / 2 / 4) * 4;
    return two >= TILE_MIN ? two : this.contentWidth;
  }

  /** The room's brightness: the average of what is on; a change sets every light that is on (all, when none is). */
  private renderRuler(lamps: readonly Lamp[], name: string, w: number): TemplateResult {
    const level = this.levelOf(lamps);
    const any = level !== null;
    const dead = !lamps.some((lamp) => lamp.usable);
    const look = sliderStyleOf(this.config);
    return html`<div class="lt-ruler">
      <fluvy-ruler
        .value=${level ?? 0}
        .min=${0}
        .max=${100}
        .step=${1}
        .length=${w}
        .tone=${any ? toneOf(this.config, 'light') : 'neutral'}
        ?disabled=${dead}
        ?inactive=${!any}
        ?wake=${!dead}
        .look=${look}
        ?still=${sliderStill()}
        unit="%"
        .label=${`${name} · ${this.t('light.brightness')}`}
        .format=${(v: number) => formatNumber(this.hass, v, { digits: 0 })}
        @fluvy-change=${(e: CustomEvent<RulerChangeDetail>) => this.setRoom(lamps, e.detail.value)}
      ></fluvy-ruler>
      ${rulerLabels(
        sliderWordsOf(
          this.config,
          [
            [0, '0'],
            [0.5, '50'],
            [1, '100'],
          ],
          look,
        ),
      )}
    </div>`;
  }
}
