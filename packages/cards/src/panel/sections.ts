import {
  type CardLanguage,
  areaOf,
  clock12,
  dayPeriods,
  DEVICE_ZOOMS,
  type HomeAssistant,
  HOUSE_DEFAULTS,
  LANGUAGES,
  LIGHT_TINTS,
  localize,
  offeredLanguages,
  parsePalette,
  registryText,
  resolveLanguage,
  type Scope,
  chromeOf,
  HA_LOGO_URL,
  SLIDER_STYLES,
  SLIDER_WORDS,
  type SliderSettings,
  type SliderStyle,
  TAB_CONTENTS,
  TAB_STYLES,
  type TabContent,
  type TabStyle,
  tabsOf,
  type Chrome,
  UNAVAILABLE_LOOKS,
  type UnavailableLook,
  type ViewTabs,
  WALL_AFTER,
  WALL_NIGHT_DIM,
  type WallSettings,
  wearsLook,
  withTextName,
} from '@fluvy/core';
import {
  chipColumns,
  chips,
  head,
  icon,
  listRow,
  options,
  rulerLabels,
  type RulerChangeDetail,
} from '@fluvy/ui';
import '@fluvy/ui/select';
import '@fluvy/ui/time-field';
import type { TimeFieldDetail } from '@fluvy/ui/time-field';
import { COMMUNITY_PALETTES } from '@fluvy/tokens/community';
import {
  choiceKey,
  COMMUNITY_SHOWN,
  entriesOf,
  knownPalettes,
  matchOf,
  paletteFileOf,
  roomFor,
} from './palettes.js';
import type { SelectChangeDetail, SelectOption } from '@fluvy/ui/select';
import {
  CUSTOM_BASES,
  type CustomPalette,
  type FillStyle,
  type Hex,
  type PaletteChoice,
  type PaletteFile,
  PILL_NAMES,
  type PillName,
  parseStatuses,
  SHAPE_NAMES,
  type ShapeName,
  STATUS_NAMES,
  type StatusName,
} from '@fluvy/tokens/runtime';
import { html, nothing, svg, type TemplateResult } from 'lit';
import { defaultColumns, fittedColumns } from '../shared/chips.js';
import { glyphForClass } from '../shared/domain.js';
import { HomeRegistry } from '../strategy/home-registry.js';
import {
  optionalViews,
  TEMPLATES,
  type Template,
  type TemplateOption,
} from '../strategy/templates.js';
import {
  ACCENTS,
  accentFor,
  closeStatuses,
  DEFAULT_CUSTOM,
  HIGHLIGHTS,
  isCustom,
  LINES,
  lookTitle,
  paletteTitle,
  SLIDER_WORD,
  STATUS_STARTS,
  STATUS_SWATCHES,
  swatchColors,
  type DashboardInfo,
  type PanelContext,
  type StringKey,
  TRANSLATING_URL,
} from './model.js';
import { copyText } from './clipboard.js';

/** One rhythm for every choice inside a card: 8 between cells on a phone, 12 on a wide panel. */
export const gap = (ctx: PanelContext): number => (ctx.wide ? 12 : 8);

/**
 * A short choice (a variant, a language): one full row of chips, the chosen one on the accent fill — laid out by
 * measure, as a card's chips are: as many a row as the labels suggest (or `columns`) while every word holds its cell,
 * else fewer (three go two and one), never a word cut (pt-BR's "Quando ligado" in a phone's column).
 */
export function choice(
  ctx: PanelContext,
  items: readonly { readonly key: string; readonly label: string; readonly active: boolean }[],
  onSelect: ((key: string) => void) | null,
  columns?: number,
): TemplateResult {
  const most = columns ?? chipColumns(items.map((item) => item.label));
  return chips(
    items,
    onSelect ?? (() => undefined),
    onSelect ? '' : 'pn-chips--static',
    true,
    ctx.fit
      ? fittedColumns(
          items,
          { ...ctx.fit, gap: gap(ctx) },
          defaultColumns(items.length).filter((n) => n <= most),
        )
      : columns,
  );
}

/* ---------- appearance ---------- */

/** The miniature's drawing sizes: a phone swatch, a wide one, the custom row's (its box less its 8 px inset). */
const ART = {
  phone: { w: 76, h: 56, on: 44 },
  wide: { w: 184, h: 80, on: 104 },
  row: { w: 80, h: 40, on: 48 },
} as const;

/**
 * A palette as a miniature of the product, drawn as one picture (it scales whole with its cell): its page, an
 * "on" tile in its fill (an icon circle, four lit ticks), an "off" tile in its card and, when it has one, its
 * highlight under it. Nothing yet (a custom palette not made): a plus.
 */
function miniature(
  choice: PaletteChoice | null,
  ctx: PanelContext,
  size: keyof typeof ART,
): TemplateResult {
  if (!choice) return html`<span class="pn-art pn-art--new">${icon('plus')}</span>`;
  const c = swatchColors(choice, ctx.mode);
  const { w, h, on } = ART[size];
  const off = w - on - 4;
  const offH = c.highlight ? h - 12 : h;
  const ticks = [0, 1, 2, 3].map((i) => 10 + i * 6);
  return html`<span
    class="pn-art"
    style="--sw-page:${c.page};--sw-card:${c.card};--sw-border:${c.border};--sw-accent:${c.accent};--sw-fill:${c.fill};--sw-tick:${c.tick}${c.highlight ? `;--sw-hl:${c.highlight}` : ''}"
    ><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect class="pn-art__on" width=${on} height=${h} rx="6" />
      <circle class="pn-art__disc" cx="14" cy="14" r="6" />
      <circle class="pn-art__glyph" cx="14" cy="14" r="3" />
      ${ticks.map(
        (x) => svg`<line class="pn-art__tick" x1=${x} x2=${x} y1=${h - 18} y2=${h - 10} />`,
      )}
      <rect
        class="pn-art__off"
        x=${on + 4.5}
        y="0.5"
        width=${off - 1}
        height=${offH - 1}
        rx="5.5"
      />
      ${c.highlight ? svg`<rect class="pn-art__hl" x=${on + 4} y=${h - 8} width=${off} height="8" rx="4" />` : nothing}
    </svg></span
  >`;
}

/** A swatch: a preset by its name, or a palette file by its title with its author under it. */
function swatch(
  choice: PaletteChoice,
  active: boolean,
  ctx: PanelContext,
  onPick: () => void,
  named?: { readonly title: string; readonly author?: string },
): TemplateResult {
  return html`<button
    class="pn-swatch ${active ? 'is-active' : ''}"
    data-target
    aria-pressed=${active ? 'true' : 'false'}
    @click=${onPick}
  >
    ${miniature(choice, ctx, ctx.wide ? 'wide' : 'phone')}
    <span class="pn-swatch__name"
      ><span class="pn-swatch__label">${named?.title ?? paletteTitle(choice, ctx.t)}</span
      >${active ? icon('check') : nothing}</span
    >
    ${
      named?.author
        ? html`<span class="pn-swatch__by">${ctx.t('palette.by', { author: named.author })}</span>`
        : nothing
    }
  </button>`;
}

/** A custom palette is neither line (its style chooses): a builder of its own under both. */
function customEntry(ctx: PanelContext): TemplateResult {
  const current = ctx.draft.palette;
  const applied = ctx.settings.look.palette;
  const known = isCustom(current) ? current : isCustom(applied) ? applied : null;
  // a custom palette that equals a saved or community one is that palette, not "Custom"
  const active = isCustom(current) && !matchOf(current, knownPalettes(ctx.saved));
  return html`<button
    class="pn-custom ${active ? 'is-active' : ''}"
    data-target
    aria-pressed=${active ? 'true' : 'false'}
    @click=${() => ctx.setDraft({ palette: known ?? DEFAULT_CUSTOM })}
  >
    ${miniature(known, ctx, 'row')}
    <span class="pn-custom__text">
      <span class="pn-custom__title">${ctx.t('palette.custom')}</span>
      <span class="pn-custom__sub">${ctx.t('palette.custom_sub')}</span>
    </span>
    <span class="pn-custom__tail">${icon(active ? 'check' : 'chevron')}</span>
  </button>`;
}

/** A line of palette files (the house's, the community's): a swatch each, active when the draft equals it. */
function fileLine(
  ctx: PanelContext,
  label: StringKey,
  files: readonly PaletteFile[],
  more?: TemplateResult,
): TemplateResult {
  const key = choiceKey(ctx.draft.palette);
  return html`<p class="fv-label pn-line">${ctx.t(label)}</p>
    <div class="pn-gallery" data-fill-row>
      ${entriesOf(files).map((entry) =>
        swatch(
          entry.file.palette,
          entry.key === key,
          ctx,
          () => ctx.setDraft({ palette: entry.file.palette }),
          entry.file,
        ),
      )}
    </div>
    ${more ?? nothing}`;
}

function gallery(ctx: PanelContext): TemplateResult {
  const current = ctx.draft.palette;
  const community = COMMUNITY_PALETTES.filter(
    (file) => !ctx.saved.some((own) => own.name === file.name),
  );
  const shown = ctx.showAllCommunity ? community : community.slice(0, COMMUNITY_SHOWN);
  return html`${LINES.map(
    (line) =>
      html`<p class="fv-label pn-line">
          ${ctx.t(line.key === 'soft' ? 'palette.pastel' : 'palette.electric')}
        </p>
        <div class="pn-gallery" data-fill-row>
          ${line.names.map((name) =>
            swatch(name, current === name, ctx, () => ctx.setDraft({ palette: name })),
          )}
        </div>`,
  )}
  ${ctx.saved.length ? fileLine(ctx, 'palette.yours', ctx.saved) : nothing}
  ${fileLine(
    ctx,
    'palette.community',
    shown,
    community.length > shown.length
      ? chips(
          [{ key: 'more', label: ctx.t('palette.more', { n: community.length }), active: false }],
          () => ctx.setShowAllCommunity(true),
        )
      : undefined,
  )}
  ${customEntry(ctx)}`;
}

/** Black or white, whichever reads better on a colour (WCAG luminance): the check on a chosen dot. */
export function inkOn(color: Hex): string {
  const n = Number.parseInt(color.slice(1), 16);
  const linear = (c: number): number => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * linear((n >> 16) & 255) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255);
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05) ? '#111111' : '#ffffff';
}

/**
 * A colour to pick: its key, its name, how it is drawn — a hex, or a colour of the palette's by its token — and the ink
 * that reads on it (its check); none drawn: the dot that picks no colour.
 */
export interface Swatch {
  readonly key: string;
  readonly label: string;
  readonly paint?: string;
  readonly ink?: string;
}

/**
 * Colour dots, six a row on a phone and twelve on a wide panel (the highlights under the accents, column for column);
 * `six`: six a row at every width (a row of its own); `onPick` null: shown to someone who may not change them.
 */
export function swatches(
  items: readonly Swatch[],
  chosen: string,
  onPick: ((key: string) => void) | null,
  six = false,
): TemplateResult {
  return html`<div class="pn-dots ${six ? 'pn-dots--six' : ''} ${onPick ? '' : 'pn-dots--static'}">
    ${items.map((item) => {
      const active = item.key === chosen;
      return html`<button
        class="pn-dot ${item.paint ? '' : 'pn-dot--none'} ${active ? 'is-active' : ''}"
        data-target
        style=${item.paint ? `--dot:${item.paint};--dot-ink:${item.ink}` : nothing}
        aria-label=${item.label}
        title=${item.label}
        aria-pressed=${active ? 'true' : 'false'}
        tabindex=${onPick ? nothing : '-1'}
        @click=${() => onPick?.(item.key)}
      >
        ${active ? icon('check') : item.paint ? nothing : icon('ban')}
      </button>`;
    })}
  </div>`;
}

/** Hexes as colour dots (`swatches`), each named by its hex; `null`: the dot that picks none. */
function dots(
  colors: readonly (Hex | null)[],
  chosen: Hex | undefined,
  ctx: PanelContext,
  onPick: ((color: Hex | undefined) => void) | null,
  six = false,
): TemplateResult {
  return swatches(
    colors.map((color) =>
      color
        ? { key: color, label: color, paint: color, ink: inkOn(color) }
        : { key: '', label: ctx.t('custom.none') },
    ),
    chosen ?? '',
    onPick && ((key) => onPick(key || undefined)),
    six,
  );
}

/** "#FF4A1A", "ff4a1a" → "#ff4a1a"; anything else → undefined. */
function hexOf(text: string): Hex | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(text.trim());
  return match ? `#${(match[1] ?? '').toLowerCase()}` : undefined;
}

/**
 * Any colour: typed as a hex in our own field, or picked from the system's well behind its swatch (`onColor` null: read
 * only); `label` names it where several stand together.
 */
export function hexField(
  value: Hex,
  ctx: PanelContext,
  onColor: ((color: Hex) => void) | null,
  label = ctx.t('custom.hex'),
): TemplateResult {
  return html`<div class="fv-field pn-hex">
    <input
      class="fv-field__input pn-hex__input"
      type="text"
      spellcheck="false"
      autocomplete="off"
      maxlength="7"
      aria-label=${label}
      ?readonly=${!onColor}
      .value=${value}
      @change=${(event: Event) => {
        const input = event.target as HTMLInputElement;
        const color = hexOf(input.value);
        if (color && onColor) onColor(color);
        else input.value = value;
      }}
    />
    <label class="pn-hex__well" style="--dot:${value}" title=${ctx.t('custom.pick')}>
      <input
        type="color"
        .value=${value}
        aria-label=${ctx.t('custom.pick')}
        ?disabled=${!onColor}
        @change=${(event: Event) => {
          const color = hexOf((event.target as HTMLInputElement).value);
          if (color) onColor?.(color);
        }}
      />
    </label>
  </div>`;
}

function customEditor(custom: CustomPalette, ctx: PanelContext): TemplateResult {
  const set = (patch: Partial<CustomPalette>): void => {
    const next = parsePalette({ ...custom, ...patch });
    if (next) ctx.setDraft({ palette: next });
  };
  const vivid = custom.character === 'vivid';
  return html`<section class="fv-card pn-card">
    ${head({ icon: 'drop', title: ctx.t('custom.title'), sub: ctx.t('custom.sub') })}
    <p class="fv-label pn-label">${ctx.t('custom.character')}</p>
    ${choice(
      ctx,
      [
        { key: 'soft', label: ctx.t('custom.soft'), active: !vivid },
        { key: 'vivid', label: ctx.t('custom.vivid'), active: vivid },
      ],
      (key) => {
        const character = key as CustomPalette['character'];
        // a listed accent keeps its place in the other style's list
        set({ character, accent: accentFor(custom.accent, character) });
      },
    )}
    <p class="fv-label pn-label">${ctx.t('custom.base')}</p>
    ${choice(
      ctx,
      CUSTOM_BASES.map((base) => ({
        key: base,
        label: ctx.t(`custom.${base}` as StringKey),
        active: custom.base === base,
      })),
      (key) => set({ base: key as CustomPalette['base'] }),
    )}
    ${
      vivid
        ? html`<p class="fv-label pn-label">${ctx.t('custom.fill')}</p>
            ${choice(
              ctx,
              [
                {
                  key: 'tint',
                  label: ctx.t('custom.tint'),
                  active: (custom.fill ?? 'tint') === 'tint',
                },
                { key: 'solid', label: ctx.t('custom.solid'), active: custom.fill === 'solid' },
              ],
              (key) => set({ fill: key as FillStyle }),
            )}`
        : nothing
    }
    <p class="fv-label pn-label">${ctx.t('custom.accent')}</p>
    ${dots(ACCENTS[custom.character], custom.accent, ctx, (accent) => accent && set({ accent }))}
    ${hexField(custom.accent, ctx, (accent) => set({ accent }))}
    ${
      vivid
        ? html`<p class="fv-label pn-label">${ctx.t('custom.highlight')}</p>
            <p class="pn-hint">${ctx.t('custom.highlight_sub')}</p>
            ${dots([null, ...HIGHLIGHTS], custom.highlight, ctx, (highlight) => {
              // a palette without a highlight carries none (not an empty one)
              const next: CustomPalette = {
                character: custom.character,
                base: custom.base,
                accent: custom.accent,
                ...(custom.fill ? { fill: custom.fill } : {}),
                ...(highlight ? { highlight } : {}),
              };
              ctx.setDraft({ palette: next });
            })}`
        : nothing
    }
  </section>`;
}

const SHAPE_GLYPH: Readonly<Record<ShapeName, string>> = {
  soft: 'shapeSoft',
  round: 'shapeRound',
  crisp: 'shapeCrisp',
};
const SHAPE_SIZES: Readonly<Record<ShapeName, string>> = {
  soft: '20 · 16 · 12',
  round: '28 · 22 · 16',
  crisp: '14 · 12 · 8',
};
const PILL_GLYPH: Readonly<Record<PillName, string>> = {
  round: 'pillRound',
  soft: 'pillSoft',
  crisp: 'pillCrisp',
};
const TAB_GLYPH: Readonly<Record<TabStyle, string>> = {
  fluvy: 'tabsText',
  pills: 'tabsPills',
  ha: 'ha',
  hidden: 'tabsNone',
};

/**
 * The view tabs as a dashboard will show them: its name and three views in the chosen style, on the page's colour
 * (Home Assistant's own style is drawn as it draws it: the icons, a line under the open one).
 */
/** The header's actions at its end, as the corner card chose them: Home Assistant's four, or its one menu as "…". */
const mockActions = (chrome: Chrome): TemplateResult =>
  chrome.actions === 'menu'
    ? html`${icon('dots')}`
    : html`${(['plus', 'search', 'chat', 'pencil'] as const).map((glyph) => icon(glyph))}`;

function tabsMock(ctx: PanelContext, tabs: ViewTabs, chrome: Chrome): TemplateResult {
  const views = [
    ['strategy.home', 'home'],
    ['strategy.rooms', 'rooms'],
    ['room.lights', 'bulb'],
  ] as const;
  const ha = tabs.style === 'ha';
  const names = !ha && tabs.content !== 'icons';
  const glyphs = ha || tabs.content !== 'names';
  const title = tabs.title;
  return html`<div class="pn-tabsmock pn-tabsmock--${tabs.style}" aria-hidden="true">
    ${
      title
        ? html`<span class="pn-tabsmock__title" data-name
            >${ctx.hass.config?.location_name || 'Home'}</span
          >`
        : nothing
    }
    ${
      tabs.style === 'hidden'
        ? nothing
        : html`<span class="pn-tabsmock__tabs" data-scroll-row
            >${views.map(
              ([key, glyph], index) =>
                html`<span class="pn-tabsmock__tab ${index === 0 ? 'is-active' : ''}"
                  >${glyphs ? icon(glyph) : nothing}${
                    names ? html`<span>${localize(ctx.hass, key)}</span>` : nothing
                  }</span
                >`,
            )}</span
          >`
    }
    ${
      // hidden tabs leave the bar its name and its actions: the preview shows what the bar then holds
      tabs.style === 'hidden'
        ? html`<span class="pn-tabsmock__actions">${mockActions(chrome)}</span>`
        : nothing
    }
  </div>`;
}

/** The dashboards' view tabs: a style, what each tab shows and the dashboard's name before them. */
function tabsCard(ctx: PanelContext): TemplateResult {
  const tabs = tabsOf(ctx.draft);
  const set = (patch: Partial<ViewTabs>): void => ctx.setDraft({ tabs: { ...tabs, ...patch } });
  const ours = tabs.style === 'fluvy' || tabs.style === 'pills';
  return html`<section class="fv-card pn-card">
    ${head({ icon: TAB_GLYPH[tabs.style], title: ctx.t('tabs.title'), sub: ctx.t('tabs.sub') })}
    ${tabsMock(ctx, tabs, chromeOf(ctx.draft))}
    ${options(
      TAB_STYLES.map((style) => ({
        key: style,
        glyph: TAB_GLYPH[style],
        label: ctx.t(`tabs.${style}_sub` as StringKey),
        value: ctx.t(`tabs.${style}` as StringKey),
        active: tabs.style === style,
      })),
      (key) => set({ style: key as TabStyle }),
      gap(ctx),
    )}
    ${
      // what each tab shows is Fluvy's to draw: its own styles only
      ours
        ? chips(
            TAB_CONTENTS.map((content) => ({
              key: content,
              label: ctx.t(`tabs.content_${content}` as StringKey),
              active: tabs.content === content,
            })),
            (key) => set({ content: key as TabContent }),
            'pn-tabs-content',
            true,
          )
        : nothing
    }
    <div class="pn-rows">
      ${listRow({
        icon: 'text',
        title: ctx.t('tabs.name'),
        sub: ctx.t('tabs.name_sub'),
        trailing: 'switch',
        on: tabs.title,
        onToggle: (on) => set({ title: on }),
      })}
    </div>
    ${
      ours
        ? nothing
        : html`<p class="pn-hint">
            ${ctx.t(tabs.style === 'hidden' ? 'tabs.hidden_hint' : 'tabs.ha_hint')}
          </p>`
    }
  </section>`;
}

/**
 * The corner as every page will show it: the sidebar's head beside the header, each on its fill, over the top of the
 * sidebar and of the page (so a hairline under them reads as one).
 */
function cornerMock(chrome: Chrome, title: string): TemplateResult {
  return html`<div
    class="pn-corner ${chrome.dividers ? 'has-lines' : ''} ${chrome.header === 'page' ? 'is-page' : ''}"
    aria-hidden="true"
  >
    <span class="pn-corner__side">
      <span class="pn-corner__row">
        ${
          chrome.logo
            ? html`<span class="pn-corner__logo" style="background-image:${HA_LOGO_URL}"></span>`
            : html`<span class="pn-corner__menu">${icon('menu')}</span>`
        }
        <span class="pn-corner__name">Home Assistant</span>
      </span>
    </span>
    <span class="pn-corner__head">
      <span class="pn-corner__row pn-corner__actions">
        <span class="pn-corner__title" data-name>${title}</span>
        ${mockActions(chrome)}
      </span>
    </span>
  </div>`;
}

/** A sidebar item: its url path (its id is `sidebar-panel-<path>`), its name as the sidebar says it, its icon. */
interface SidebarItem {
  readonly path: string;
  readonly title: string;
  readonly icon?: string;
}

/**
 * The panels the sidebar can list, by Home Assistant's own rule (a title, not kept out of the sidebar; the Overview,
 * which has no title of its own), named as the sidebar names them; the dashboards first, the Overview at their head,
 * then the rest, each by name. A person's own order is theirs: the line follows its item wherever it is.
 */
function sidebarItems(hass: HomeAssistant, overview: string): SidebarItem[] {
  const named = (key: string): string | undefined => {
    const own = hass.localize(key);
    return own && own !== key ? own : undefined;
  };
  const items = Object.values(hass.panels ?? {}).flatMap((panel): SidebarItem[] => {
    const overviewPanel = panel.url_path === 'lovelace';
    if ((!panel.title && !overviewPanel) || panel.show_in_sidebar === false) return [];
    if (panel.url_path === 'config' || panel.url_path === 'profile') return [];
    const title = overviewPanel
      ? (named('panel.states') ?? overview)
      : (named(`panel.${panel.title}`) ?? (panel.title as string));
    return [{ path: panel.url_path, title, ...(panel.icon ? { icon: panel.icon } : {}) }];
  });
  const rank = (item: SidebarItem): number =>
    item.path === 'lovelace' ? 0 : hass.panels?.[item.path]?.component_name === 'lovelace' ? 1 : 2;
  return items.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

/**
 * Lines in the sidebar: one after each item switched on here, to set a group apart (the dashboards from the tools).
 * Offered where Fluvy styles the whole app, the sidebar with it.
 */
function separatorsCard(ctx: PanelContext): TemplateResult | typeof nothing {
  if (ctx.shown.scope !== 'everywhere') return nothing;
  const chrome = chromeOf(ctx.draft);
  const toggle = (path: string, on: boolean): void =>
    ctx.setDraft({
      chrome: {
        ...chrome,
        separators: on
          ? [...new Set([...chrome.separators, path])]
          : chrome.separators.filter((other) => other !== path),
      },
    });
  return html`<section class="fv-card pn-card">
    ${head({ icon: 'minus', title: ctx.t('chrome.separators'), sub: ctx.t('chrome.separators_sub') })}
    <div class="pn-rows">
      ${sidebarItems(ctx.hass, ctx.t('scope.overview')).map((item) =>
        listRow({
          icon: item.icon ?? (item.path === 'lovelace' ? 'home' : 'grid'),
          title: item.title,
          sub: `/${item.path}`,
          trailing: 'switch',
          on: chrome.separators.includes(item.path),
          onToggle: (on) => toggle(item.path, on),
        }),
      )}
    </div>
  </section>`;
}

/** The corner of every page: Home Assistant's logo in the sidebar, the hairlines, the header's surface. */
function cornerCard(ctx: PanelContext): TemplateResult {
  const chrome = chromeOf(ctx.draft);
  const set = (patch: Partial<Chrome>): void => ctx.setDraft({ chrome: { ...chrome, ...patch } });
  return html`<section class="fv-card pn-card">
    ${head({ icon: 'frame', title: ctx.t('chrome.title'), sub: ctx.t('chrome.sub') })}
    ${cornerMock(chrome, String(ctx.hass.config?.location_name || 'Home'))}
    <div class="pn-rows">
      ${listRow({
        icon: 'home',
        title: ctx.t('chrome.logo'),
        sub: ctx.t('chrome.logo_sub'),
        trailing: 'switch',
        on: chrome.logo,
        onToggle: (on) => set({ logo: on }),
      })}
      ${listRow({
        icon: 'minus',
        title: ctx.t('chrome.dividers'),
        sub: ctx.t('chrome.dividers_sub'),
        trailing: 'switch',
        on: chrome.dividers,
        onToggle: (on) => set({ dividers: on }),
      })}
      ${listRow({
        icon: 'palette',
        title: ctx.t('chrome.page'),
        sub: ctx.t('chrome.page_sub'),
        trailing: 'switch',
        on: chrome.header === 'page',
        onToggle: (on) => set({ header: on ? 'page' : 'bar' }),
      })}
      ${listRow({
        icon: 'dots',
        title: ctx.t('chrome.actions'),
        sub: ctx.t('chrome.actions_sub'),
        trailing: 'switch',
        on: chrome.actions === 'menu',
        onToggle: (on) => set({ actions: on ? 'menu' : 'buttons' }),
      })}
    </div>
    ${
      // the sidebar is Home Assistant's own until the look covers the whole app
      ctx.shown.scope === 'everywhere'
        ? nothing
        : html`<p class="pn-hint">
            ${ctx.t('chrome.hint', { scope: ctx.t('tab.scope'), everywhere: ctx.t('scope.everywhere') })}
          </p>`
    }
  </section>`;
}

/** The opacity ruler's figures under it, as a light's brightness has them. */
const OPACITY_MARKS = [0, 25, 50, 75, 100] as const;

/**
 * Every card's surface where a card says nothing of its own (1.15, #121): how opaque it is, on the ruler a light's
 * brightness is set on (5 % steps, its figure at the row's end), whether what shows through a see-through card is
 * blurred — said always, as a card may be see-through of its own on a solid house — and how a card out of reach looks
 * (1.16, #126: dashed, or as when off). The house's, an administrator's to set; shown on the preview and the page while
 * it is chosen.
 */
function cardsCard(ctx: PanelContext): TemplateResult {
  const { shown, admin } = ctx;
  const { opacity } = shown.cards;
  const width = ctx.fit?.width ?? 0;
  const set = (event: CustomEvent<RulerChangeDetail>): void =>
    ctx.editHouse({ cards: { ...shown.cards, opacity: event.detail.value } });
  return html`<section class="fv-card pn-card">
    ${head({ icon: 'grid', title: ctx.t('cards.title'), sub: ctx.t(admin ? 'cards.sub' : 'scope.admin_only') })}
    <div class="pn-rows">
      ${listRow({
        icon: 'drop',
        title: ctx.t('cards.opacity'),
        sub: ctx.t('cards.opacity_sub'),
        trailing: 'value',
        value: ctx.t('wall.percent', { count: opacity }),
      })}
    </div>
    ${
      width
        ? html`<fluvy-ruler
              class="pn-ruler"
              .value=${opacity}
              .min=${0}
              .max=${100}
              .step=${5}
              .length=${width}
              tone="accent"
              .minor=${0.05}
              .major=${0.25}
              unit="%"
              .label=${ctx.t('cards.opacity')}
              ?readonly=${!admin}
              @fluvy-input=${set}
              @fluvy-change=${set}
            ></fluvy-ruler>
            ${rulerLabels(OPACITY_MARKS.map((mark) => [mark / 100, String(mark)]))}`
        : nothing
    }
    <div class="pn-rows">
      ${listRow({
        icon: 'eye',
        title: ctx.t('cards.blur'),
        sub: ctx.t('cards.blur_sub'),
        trailing: 'switch',
        on: shown.cards.blur,
        readonly: !admin,
        onToggle: (on) => ctx.editHouse({ cards: { ...shown.cards, blur: on } }),
      })}
    </div>
    <p class="fv-label pn-label">${ctx.t('cards.unavailable')}</p>
    ${choice(
      ctx,
      UNAVAILABLE_LOOKS.map((look) => ({
        key: look,
        label: localize(ctx.hass, `option.${look}`),
        active: shown.cards.unavailable === look,
      })),
      admin
        ? (key) => ctx.editHouse({ cards: { ...shown.cards, unavailable: key as UnavailableLook } })
        : null,
    )}
  </section>`;
}

/** A slider style's glyph on its tile: the ruler's ticks, the bar's pill, the liquid's drop, the fill's square. */
const SLIDER_GLYPH: Readonly<Record<SliderStyle, string>> = {
  ruler: 'sliders',
  bar: 'pillRound',
  liquid: 'drop',
  fill: 'shapeSoft',
};

/**
 * How every slider is drawn where a card says nothing of its own (1.18, #144): the style, a tile each — the ruler, the
 * house's from the first day, so nothing changes on upgrade; a bar; a liquid; the fill, a tile's, the note saying a
 * card draws the ruler for it — and, under a bar or a liquid, the words (the ends and the middle, or none). The
 * house's, an administrator's to set; shown on the preview and the page while it is chosen.
 */
function slidersCard(ctx: PanelContext): TemplateResult {
  const { shown, admin } = ctx;
  const sliders = shown.sliders;
  const set = (patch: Partial<SliderSettings>): void =>
    ctx.editHouse({ sliders: { ...sliders, ...patch } });
  return html`<section class="fv-card pn-card">
    ${head({ icon: SLIDER_GLYPH[sliders.style], title: ctx.t('sliders.title'), sub: ctx.t(admin ? 'cards.sub' : 'scope.admin_only') })}
    ${options(
      SLIDER_STYLES.map((style) => ({
        key: style,
        glyph: SLIDER_GLYPH[style],
        label: ctx.t('sliders.style'),
        value: localize(ctx.hass, SLIDER_WORD[style]),
        active: sliders.style === style,
      })),
      admin ? (key) => set({ style: key as SliderStyle }) : null,
      gap(ctx),
    )}
    <p class="pn-hint pn-hint--after">${ctx.t('sliders.fill_note')}</p>
    ${
      sliders.style === 'bar' || sliders.style === 'liquid'
        ? html`<p class="fv-label pn-label">${ctx.t('sliders.words')}</p>
            ${choice(
              ctx,
              SLIDER_WORDS.map((words) => ({
                key: words,
                label: localize(ctx.hass, `option.${words}`),
                active: sliders.words === words,
              })),
              admin ? (key) => set({ words: key as SliderSettings['words'] }) : null,
            )}`
        : nothing
    }
  </section>`;
}

/**
 * What a card of lights shows where it says nothing of its own (1.9): its light's colour on a light card (never, while
 * on, always) and a lit light in its bulb's colour on tiles, rows and rooms — the house's, an administrator's to set.
 */
function lightsCard(ctx: PanelContext): TemplateResult {
  const { shown, admin } = ctx;
  return html`<section class="fv-card pn-card">
    ${head({ icon: 'bulb', title: ctx.t('lights.title'), sub: ctx.t(admin ? 'lights.sub' : 'scope.admin_only') })}
    <p class="fv-label pn-label">${ctx.t('lights.tint')}</p>
    ${choice(
      ctx,
      LIGHT_TINTS.map((tint) => ({
        key: tint,
        // "Never", not "Off": a light's own off is another thing
        label: localize(ctx.hass, `option.${tint === 'off' ? 'never' : tint}`),
        active: shown.lightTint === tint,
      })),
      admin ? (key) => ctx.editHouse({ lightTint: key as (typeof LIGHT_TINTS)[number] }) : null,
    )}
    <div class="pn-rows">
      ${listRow({
        icon: 'palette',
        title: ctx.t('lights.colors'),
        sub: ctx.t('lights.colors_sub'),
        trailing: 'switch',
        on: shown.lightColors,
        readonly: !admin,
        onToggle: (on) => ctx.editHouse({ lightColors: on }),
      })}
    </div>
  </section>`;
}

/**
 * The statuses in colours of the house's own (1.9): each the palette's (Auto) or a colour picked — six round the wheel
 * or any — that the engine fits to read on every card, a line under it where it still sits close to another status.
 * The house's, an administrator's to set; shown on the panel and the page at once, saved from the bar.
 */
function statusesCard(ctx: PanelContext): TemplateResult {
  const { shown, admin } = ctx;
  const close = closeStatuses(ctx.draft.palette, shown.statuses);
  // in the statuses' order, whatever was touched first: an edit back to the saved picks is no edit
  const set = (name: StatusName, pick: Hex | undefined): void =>
    ctx.editHouse({ statuses: parseStatuses({ ...shown.statuses, [name]: pick }) });
  return html`<section class="fv-card pn-card">
    ${head({ icon: 'warn', title: ctx.t('statuses.title'), sub: ctx.t(admin ? 'statuses.sub' : 'scope.admin_only') })}
    ${STATUS_NAMES.map((name) => {
      const own = shown.statuses[name];
      const near = close[name];
      return html`<p class="fv-label pn-label">${ctx.t(`statuses.${name}`)}</p>
        ${choice(
          ctx,
          [
            { key: 'auto', label: ctx.t('statuses.auto'), active: !own },
            { key: 'own', label: ctx.t('statuses.own'), active: !!own },
          ],
          admin
            ? (key) => {
                // Custom starts on the status's own swatch, and keeps a colour already picked
                if (key === 'auto') set(name, undefined);
                else if (!own) set(name, STATUS_STARTS[name]);
              }
            : null,
        )}
        ${
          own
            ? html`${dots(
                STATUS_SWATCHES,
                own,
                ctx,
                admin ? (pick) => pick && set(name, pick) : null,
                true,
              )}
              ${hexField(own, ctx, admin ? (pick) => set(name, pick) : null)}`
            : nothing
        }
        ${
          near
            ? html`<p class="pn-hint pn-hint--after">
                ${ctx.t('statuses.close', { status: ctx.t(`statuses.${near}`) })}
              </p>`
            : nothing
        }`;
    })}
  </section>`;
}

/** The look on the real cards, and the switch that tries it on the whole app. */
export function appearancePreview(ctx: PanelContext, preview: TemplateResult): TemplateResult {
  return html`<section class="fv-card pn-card pn-card--preview">
    ${head({ icon: 'eye', title: ctx.t('preview.title'), sub: ctx.t('preview.sub') })}
    <div class="pn-rows pn-rows--lead">
      ${listRow({
        icon: 'expand',
        title: ctx.t('preview.app'),
        sub: ctx.t('preview.app_sub'),
        trailing: 'switch',
        on: ctx.tryOnApp,
        onToggle: (on) => ctx.setTryOnApp(on),
      })}
    </div>
    ${preview}
  </section>`;
}

/** A dashboard's cards as its options draw them. */
export function dashboardPreview(
  ctx: PanelContext,
  preview: TemplateResult,
  dashboard: string,
): TemplateResult {
  return html`<section class="fv-card pn-card pn-card--preview">
    ${head({ icon: 'eye', title: ctx.t('preview.title'), sub: ctx.t('dashboard.preview_of', { dashboard }) })}
    ${preview}
  </section>`;
}

export interface ShareActions {
  exportPalette(file: PaletteFile): void;
  importPalette(file: File): void;
  savePalette(file: PaletteFile): void;
  removePalette(name: string): void;
}

/** A palette as a file: its words, the file out and in, and (an administrator) the house's copy of it. */
function shareCard(
  palette: CustomPalette,
  ctx: PanelContext,
  actions: ShareActions,
): TemplateResult {
  const { share, admin, saved } = ctx;
  const file = paletteFileOf(palette, share.title, share.author);
  const own = matchOf(palette, saved);
  const field = (key: 'title' | 'author', label: StringKey, max: number) =>
    html`<label class="pn-text">
      <span class="fv-label pn-label">${ctx.t(label)}</span>
      <span class="fv-field"
        ><input
          class="fv-field__input"
          type="text"
          maxlength=${max}
          .value=${share[key]}
          @input=${(event: Event) =>
            ctx.setShare({ [key]: (event.target as HTMLInputElement).value })}
      /></span>
    </label>`;
  return html`<section class="fv-card pn-card">
    ${head({ icon: 'upload', title: ctx.t('share.title'), sub: ctx.t('share.sub') })}
    <div class="pn-pair pn-fields">
      ${field('title', 'share.name', 32)}${field('author', 'share.author', 40)}
    </div>
    <div class="pn-pair pn-pair--words" data-fill-row>
      <button
        class="fv-btn fv-btn--quiet"
        data-target
        ?disabled=${!file}
        @click=${() => file && actions.exportPalette(file)}
      >
        ${ctx.t('share.export')}
      </button>
      <label class="fv-btn fv-btn--quiet pn-file" data-target
        >${ctx.t('share.import')}
        <input
          type="file"
          accept="application/json,.json"
          @change=${(event: Event) => {
            const input = event.target as HTMLInputElement;
            const chosen = input.files?.[0];
            if (chosen) actions.importPalette(chosen);
            input.value = '';
          }}
      /></label>
    </div>
    ${
      admin
        ? own
          ? html`<div class="pn-rows">
              ${listRow({
                icon: 'trash',
                title: ctx.t('share.remove'),
                sub: own.title,
                trailing: 'none',
                onTap: () => actions.removePalette(own.name),
              })}
            </div>`
          : file && roomFor(saved, file.name)
            ? html`<div class="pn-rows">
                ${listRow({
                  icon: 'download',
                  tone: 'accent',
                  title: ctx.t('share.save'),
                  sub: ctx.t('share.save_sub'),
                  trailing: 'none',
                  onTap: () => actions.savePalette(file),
                })}
              </div>`
            : file
              ? html`<p class="pn-hint">${ctx.t('share.full')}</p>`
              : nothing
        : nothing
    }
  </section>`;
}

export function appearance(ctx: PanelContext, share: ShareActions): TemplateResult {
  const { settings } = ctx;
  const palette = ctx.draft.palette;
  return html`<section class="fv-card pn-card">
      ${head({
        icon: 'palette',
        title: ctx.t('palette.title'),
        sub: settings.personalLook ? ctx.t('palette.own') : ctx.t('palette.house'),
      })}
      ${gallery(ctx)}
    </section>
    ${isCustom(palette) ? customEditor(palette, ctx) : nothing}
    ${isCustom(palette) ? shareCard(palette, ctx, share) : nothing}
    <section class="fv-card pn-card">
      ${head({ icon: SHAPE_GLYPH[ctx.draft.shape], title: ctx.t('shape.title'), sub: ctx.t('shape.sub') })}
      ${options(
        SHAPE_NAMES.map((shape) => ({
          key: shape,
          glyph: SHAPE_GLYPH[shape],
          label: SHAPE_SIZES[shape],
          value: ctx.t(`shape.${shape}` as StringKey),
          active: ctx.draft.shape === shape,
        })),
        (key) => ctx.setDraft({ shape: key as ShapeName }),
        gap(ctx),
      )}
    </section>
    <section class="fv-card pn-card">
      ${head({ icon: PILL_GLYPH[ctx.draft.pills], title: ctx.t('pills.title'), sub: ctx.t('pills.sub') })}
      ${options(
        PILL_NAMES.map((pills) => ({
          key: pills,
          glyph: PILL_GLYPH[pills],
          label: ctx.t(`pills.size_${pills}` as StringKey),
          value: ctx.t(`pills.${pills}` as StringKey),
          active: ctx.draft.pills === pills,
        })),
        (key) => ctx.setDraft({ pills: key as PillName }),
        gap(ctx),
      )}
    </section>
    ${tabsCard(ctx)} ${cornerCard(ctx)} ${separatorsCard(ctx)} ${cardsCard(ctx)} ${slidersCard(ctx)}
    ${lightsCard(ctx)} ${statusesCard(ctx)}
    ${
      settings.personalLook
        ? html`<section class="fv-card pn-card pn-rows">
            ${listRow({
              icon: 'home',
              title: ctx.t('apply.back'),
              sub: ctx.t('apply.back_sub'),
              // it acts at once (it opens nothing): no chevron
              trailing: 'none',
              onTap: () =>
                ctx.run(() =>
                  ctx.handle.store.savePersonal({
                    palette: undefined,
                    shape: undefined,
                    pills: undefined,
                    tabs: undefined,
                    chrome: undefined,
                  }),
                ),
            })}
          </section>`
        : nothing
    }`;
}

/* ---------- scope ---------- */

/**
 * The theme Home Assistant wears for this person: Fluvy (from their profile, or the house's default theme), or
 * another one (`other`, by its name) — which then keeps every Home Assistant page, Fluvy staying on its dashboards.
 */
export interface ThemeInUse {
  readonly source: 'profile' | 'house' | 'other';
  /** The other theme's name, as the profile lists it. */
  readonly name?: string;
  /** Home Assistant's own way to the other theme: back to the default one, or to Fluvy. */
  leave(): void;
}

/**
 * Only on dashboards cannot hold while Home Assistant's own theme is Fluvy: every page would still wear it. Said
 * where the choice is made, with the way back (a person's own profile; the house's default theme is an
 * administrator's).
 */
function themeNote(ctx: PanelContext, theme: ThemeInUse): TemplateResult {
  const other = theme.source === 'other';
  const profile = theme.source === 'profile';
  const can = other || profile || ctx.admin;
  const title = other
    ? 'scope.theme_another'
    : profile
      ? 'scope.theme_profile'
      : 'scope.theme_house';
  const text = other
    ? ctx.t('scope.theme_another_sub', { theme: theme.name ?? '' })
    : ctx.t(
        profile
          ? 'scope.theme_profile_sub'
          : ctx.admin
            ? 'scope.theme_house_sub'
            : 'scope.theme_house_guest',
      );
  return html`<div class="pn-status pn-status--warning" role="status">
    <p class="pn-status__title">${ctx.t(title)}</p>
    <p class="pn-status__text">${text}</p>
    ${
      can
        ? html`<button
            class="fv-btn fv-btn--quiet pn-status__btn"
            data-fit="32"
            data-target
            @click=${theme.leave}
          >
            ${ctx.t(other ? 'scope.theme_use_fluvy' : profile ? 'scope.theme_use' : 'scope.theme_use_ha')}
          </button>`
        : nothing
    }
  </div>`;
}

export function scope(ctx: PanelContext, theme: ThemeInUse | null): TemplateResult {
  const { shown, admin } = ctx;
  const pick = admin ? (key: string) => ctx.editHouse({ scope: key as Scope }) : null;
  const listed = ctx.dashboards;
  const worn = (urlPath: string): boolean => wearsLook(shown, urlPath);
  const toggleDashboard = (urlPath: string, on: boolean): void => {
    // the implicit set (every fluvy dashboard) becomes an explicit list the first time one is changed
    const current = shown.dashboards.length
      ? shown.dashboards
      : listed.map((d) => d.urlPath).filter((path) => worn(path));
    const next = on
      ? [...new Set([...current, urlPath])]
      : current.filter((path) => path !== urlPath);
    ctx.editHouse({ dashboards: next });
  };
  return html`<section class="fv-card pn-card">
      ${head({ icon: 'globe', title: ctx.t('scope.title'), ...(admin ? {} : { sub: ctx.t('scope.admin_only') }) })}
      ${options(
        [
          {
            key: 'dashboards',
            glyph: 'grid',
            label: ctx.t('scope.only'),
            value: ctx.t('scope.dashboards'),
            active: shown.scope === 'dashboards',
          },
          {
            key: 'everywhere',
            glyph: 'ha',
            label: ctx.t('scope.everywhere'),
            value: ctx.t('scope.ha'),
            active: shown.scope === 'everywhere',
          },
        ],
        pick,
        gap(ctx),
      )}
      ${
        // the frame, the menus' icons and the Activity page belong to the whole app: offered where the look reaches it
        shown.scope === 'everywhere'
          ? html`<div class="pn-rows">
              ${listRow({
                icon: 'frame',
                title: ctx.t('scope.frame'),
                sub: ctx.t('scope.frame_sub'),
                trailing: 'switch',
                on: shown.frame,
                readonly: !admin,
                onToggle: (on) => ctx.editHouse({ frame: on }),
              })}
              ${listRow({
                icon: 'grid',
                title: ctx.t('scope.icons'),
                sub: ctx.t('scope.icons_sub'),
                trailing: 'switch',
                on: shown.icons,
                readonly: !admin,
                onToggle: (on) => ctx.editHouse({ icons: on }),
              })}
              ${listRow({
                icon: 'clock',
                title: ctx.t('scope.activity'),
                sub: ctx.t('scope.activity_sub'),
                trailing: 'switch',
                on: shown.activity,
                readonly: !admin,
                onToggle: (on) => ctx.editHouse({ activity: on }),
              })}
              ${listRow({
                icon: 'chart',
                title: ctx.t('scope.history'),
                sub: ctx.t('scope.history_sub'),
                trailing: 'switch',
                on: shown.history,
                readonly: !admin,
                onToggle: (on) => ctx.editHouse({ history: on }),
              })}
            </div>`
          : nothing
      }
      ${
        // Fluvy's own theme defeats "only dashboards"; another theme keeps "everywhere" to Fluvy's dashboards:
        // said where the choice is made, under it
        theme && (theme.source === 'other') === (shown.scope === 'everywhere')
          ? themeNote(ctx, theme)
          : nothing
      }
    </section>
    ${
      shown.scope === 'dashboards'
        ? html`<section class="fv-card pn-card">
            ${head({
              icon: 'grid',
              title: ctx.t('scope.list'),
              sub: shown.dashboards.length
                ? ctx.t('scope.list_chosen', { n: shown.dashboards.length })
                : ctx.t('scope.list_auto'),
            })}
            <div class="pn-rows">
              ${listed.map((d) =>
                listRow({
                  icon: d.icon ?? 'grid',
                  title: d.title,
                  sub: `/${d.urlPath}`,
                  trailing: 'switch',
                  on: worn(d.urlPath),
                  readonly: !admin,
                  onToggle: (on) => toggleDashboard(d.urlPath, on),
                }),
              )}
            </div>
          </section>`
        : nothing
    }`;
}

/* ---------- the dashboards ---------- */

/** One choice of a dashboard's option: the first value is the default and writes nothing (the key goes). */
function optionChoice(
  ctx: PanelContext,
  urlPath: string,
  option: Extract<TemplateOption, { kind: 'choice' }>,
  current: unknown,
): TemplateResult {
  const [fallback] = option.values;
  const chosen = option.values.some((known) => known.value === current) ? current : fallback?.value;
  return choice(
    ctx,
    option.values.map((known) => ({
      key: String(known.value),
      label: ctx.t(
        known.label,
        typeof known.value === 'number' ? { count: known.value } : undefined,
      ),
      active: chosen === known.value,
    })),
    ctx.admin
      ? (key) => {
          const value = option.values.find((known) => String(known.value) === key)?.value;
          ctx.editStrategy(urlPath, {
            [option.key]: value === fallback?.value ? undefined : value,
          });
        }
      : null,
  );
}

/** Which rooms a dashboard shows, a chip a room; every room chosen (the default) writes nothing. */
function areasChoice(ctx: PanelContext, urlPath: string, current: unknown): TemplateResult {
  const rooms = Object.values(ctx.hass.areas ?? {})
    .map(withTextName)
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = Array.isArray(current) ? new Set(current as readonly string[]) : null;
  return choice(
    ctx,
    rooms.map((area) => ({
      key: area.area_id,
      label: area.name,
      active: chosen ? chosen.has(area.area_id) : true,
    })),
    ctx.admin
      ? (key) => {
          const next = new Set(chosen ?? rooms.map((area) => area.area_id));
          if (next.has(key)) next.delete(key);
          else next.add(key);
          const every = next.size === 0 || rooms.every((area) => next.has(area.area_id));
          ctx.editStrategy(urlPath, {
            areas: every ? undefined : rooms.map((a) => a.area_id).filter((id) => next.has(id)),
          });
        }
      : null,
  );
}

/**
 * How long lists are drawn: shortened (the house's caps, each with its "N more" row: the default, which writes nothing)
 * or in full (`caps: none`). A dashboard whose raw configuration raises a list's cap reads as shortened, and keeps its
 * numbers until it asks for every list in full.
 */
function capsChoice(ctx: PanelContext, urlPath: string, current: unknown): TemplateResult {
  const whole = current === 'none';
  return choice(
    ctx,
    [
      { key: 'shortened', label: ctx.t('dashboard.shortened'), active: !whole },
      { key: 'none', label: ctx.t('dashboard.in_full'), active: whole },
    ],
    ctx.admin
      ? (key) => {
          if ((key === 'none') !== whole)
            ctx.editStrategy(urlPath, { caps: key === 'none' ? 'none' : undefined });
        }
      : null,
  );
}

/** Home Assistant's entity picker: the entries no list above can name (a pattern, a device, a domain). */
const ENTITIES = { entity: { multiple: true } } as const;

/** The entries of a dashboard's `exclude` as written: ids, patterns, devices, domains. */
const excludedWords = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : [];

/** An entity's domain, as the glyphs are chosen by (`light.kitchen` → `light`). */
const entityDomain = (id: string): string => id.slice(0, Math.max(0, id.indexOf('.')));

/**
 * What a dashboard leaves out of every view (`exclude`, #141), in three parts:
 *
 * - what is left out already, a chip each: a tap takes one back — a pattern, a device or a domain it cannot be asked
 *   for any other way;
 * - the entities this dashboard is using, a room's page's worth at a time, a switch each: a tap leaves one out, as if
 *   the house had none of it. The house is read as the dashboard reads it (`HomeRegistry`, the room card's own rule),
 *   so a house of many entities is asked room by room, not all at once;
 * - Home Assistant's own picker for the entries no list can name.
 *
 * None chosen takes the key away.
 */
function entitiesChoice(ctx: PanelContext, urlPath: string, current: unknown): TemplateResult {
  const left = excludedWords(current);
  const write = (next: readonly string[]): void =>
    ctx.editStrategy(urlPath, { exclude: next.length ? [...next] : undefined });
  const takeBack = (entry: string): void => write(left.filter((other) => other !== entry));
  const leave = (id: string, out: boolean): void =>
    write(out ? [...left, id] : left.filter((other) => other !== id));

  // the house as this dashboard draws it, exclusions and all: a row stays once it is excluded, so the switch that left
  // it out can be found again here rather than only among the chips
  const registry = new HomeRegistry(ctx.hass, {});
  const nameOf = (id: string): string =>
    String(ctx.hass.states[id]?.attributes?.friendly_name ?? id);
  const row = (id: string): TemplateResult =>
    listRow({
      icon: glyphForClass(
        entityDomain(id),
        String(ctx.hass.states[id]?.attributes?.device_class ?? ''),
      ),
      title: nameOf(id),
      sub: id,
      trailing: 'switch',
      on: left.includes(id),
      readonly: !ctx.admin,
      onToggle: (on) => leave(id, on),
    });
  const groups = registry.areas
    .map((area) => ({
      name: registry.areaName(area.area_id) ?? '',
      ids: registry.contents(area.area_id).entities.filter((id) => registry.usable(id)),
    }))
    .filter((group) => group.name !== '' && group.ids.length > 0);
  const inRooms = new Set(groups.flatMap((group) => [...group.ids]));
  const loose = Object.keys(ctx.hass.states)
    .filter((id) => !inRooms.has(id) && registry.usable(id) && !areaOf(ctx.hass, id))
    .sort();
  /** A chip's name: an entity's own, else the entry as written (a pattern, a device, a domain). */
  const label = (entry: string): string => (ctx.hass.states[entry] ? nameOf(entry) : entry);

  /** Home Assistant's own picker: the entries no list above can name (a pattern, a device, a domain). */
  const picker = (): TemplateResult => html`<p class="pn-label">${ctx.t('dashboard.exclude_add')}</p>
    <ha-selector
      .hass=${ctx.hass}
      .selector=${ENTITIES}
      .value=${left}
      .disabled=${!ctx.admin}
      @value-changed=${(event: CustomEvent<{ value?: unknown }>) => {
        write(excludedWords(event.detail.value));
      }}
    ></ha-selector>`;

  // What is left out already folds away: a dashboard of a whole house leaves many out, and a list of them above the
  // switches would push the switches themselves out of sight. The picker folds with it, its own list of what is chosen
  // being just as long; a dashboard that leaves nothing out shows it open, which is the one case a tap is needed.
  const folded = (entries: readonly string[]): TemplateResult => html`<details class="pn-fold">
    <summary class="pn-note">${ctx.t('dashboard.exclude_show', { n: String(entries.length) })}</summary>
    <div class="pn-rows pn-scroll" style="max-block-size: 180px">
      ${choice(
        ctx,
        entries.map((entry) => ({ key: entry, label: label(entry), active: true })),
        ctx.admin ? takeBack : null,
      )}
    </div>
    ${picker()}
  </details>`;

  return html`<p class="pn-hint">${ctx.t('dashboard.exclude_sub')}</p>
    ${left.length ? folded(left) : html`<p class="pn-note">${ctx.t('dashboard.exclude_none')}</p>${picker()}`}
    ${
      ![...groups, { name: ctx.t('dashboard.exclude_loose'), ids: loose }].some(
        (group) => group.ids.length > 0,
      )
        ? nothing
        : html`<p class="pn-label">${ctx.t('dashboard.exclude_in_use')}</p>
            <div class="pn-rows pn-scroll" style="max-block-size: 380px">
              ${groups.map(
                (group) =>
                  html`<p class="pn-note">${group.name}</p>
                    ${group.ids.map((id) => row(id))}`,
              )}
              ${
                loose.length
                  ? html`<p class="pn-note">${ctx.t('dashboard.exclude_loose')}</p>
                      ${loose.map((id) => row(id))}`
                  : nothing
              }
            </div>`
    }
  `;
}

export interface DashboardActions {
  create(template: Template): void;
  recreate(urlPath: string): void;
  /** Copies what this dashboard draws now into a plain dashboard Home Assistant's own editor edits freely. */
  copyEditable(urlPath: string): void;
  /** Takes what a person changed in that copy and writes the difference into the automatic dashboard. */
  applyCopy(urlPath: string): void;
  /** Whether a copy of this dashboard exists (the row to take its changes back is shown only then). */
  hasCopy(urlPath: string): boolean;
  open(urlPath: string): void;
  /** Lists a dashboard in Home Assistant's sidebar, or not. */
  showInSidebar(urlPath: string, on: boolean): void;
  /** The url path of the dashboard being created ('' when none): its row says so and takes no second tap. */
  readonly creating: string;
  /** The url path of the dashboard whose Recreate row is armed ('' when none). */
  readonly recreateArmed: string;
}

/** A dashboard's options: its template's, each as rows (the views) or chips (a choice, the rooms), then its rows. */
function dashboardOptions(
  ctx: PanelContext,
  dashboard: DashboardInfo,
  actions: DashboardActions,
): TemplateResult {
  const template = dashboard.template as Template;
  const strategy = ctx.strategyOf(dashboard.urlPath) ?? {};
  const hidden = new Set(Array.isArray(strategy['hide']) ? (strategy['hide'] as string[]) : []);
  const armed = actions.recreateArmed === dashboard.urlPath;
  const [first] = typeof template.views === 'function' ? [] : template.views;
  return html`<section class="fv-card pn-card ${armed ? 'is-armed' : ''}">
    ${head({
      icon: template.icon,
      title: dashboard.title,
      ...(ctx.admin ? {} : { sub: ctx.t('scope.admin_only') }),
    })}
    ${template.options.map((option) => {
      // a house without areas has no rooms to choose from
      if (option.kind === 'areas' && !Object.keys(ctx.hass.areas ?? {}).length) return nothing;
      if (option.kind === 'views')
        return html`<p class="fv-label pn-label">${ctx.t(option.label)}</p>
          <div class="pn-rows">
            ${
              first
                ? listRow({
                    icon: first.icon,
                    title: localize(ctx.hass, first.title),
                    trailing: 'value',
                    value: ctx.t('dashboard.always'),
                    quiet: true,
                  })
                : nothing
            }
            ${optionalViews(template).map((view) =>
              listRow({
                icon: view.icon,
                title: localize(ctx.hass, view.title),
                trailing: 'switch',
                on: !hidden.has(view.key),
                readonly: !ctx.admin,
                onToggle: (on) => {
                  const hide = on
                    ? [...hidden].filter((key) => key !== view.key)
                    : [...hidden, view.key];
                  ctx.editStrategy(dashboard.urlPath, { hide: hide.length ? hide : undefined });
                },
              }),
            )}
          </div>`;
      return html`<p class="fv-label pn-label">${ctx.t(option.label)}</p>
        ${
          option.kind === 'areas'
            ? areasChoice(ctx, dashboard.urlPath, strategy['areas'])
            : option.kind === 'caps'
              ? capsChoice(ctx, dashboard.urlPath, strategy['caps'])
              : option.kind === 'entities'
                ? entitiesChoice(ctx, dashboard.urlPath, strategy['exclude'])
                : optionChoice(ctx, dashboard.urlPath, option, strategy[option.key])
        }`;
    })}
    ${
      ctx.admin
        ? html`<div class="pn-rows">
            ${
              dashboard.id
                ? listRow({
                    icon: 'menu',
                    title: ctx.t('dashboard.sidebar'),
                    trailing: 'switch',
                    on: dashboard.inSidebar ?? false,
                    onToggle: (on) => actions.showInSidebar(dashboard.urlPath, on),
                  })
                : nothing
            }
            ${listRow({
              icon: 'grid',
              title: ctx.t('dashboard.copy_editable'),
              sub: ctx.t('dashboard.copy_editable_sub'),
              trailing: 'chevron',
              onTap: () => actions.copyEditable(dashboard.urlPath),
            })}
            ${
              actions.hasCopy(dashboard.urlPath)
                ? listRow({
                    icon: 'sliders',
                    title: ctx.t('dashboard.apply_copy'),
                    sub: ctx.t('dashboard.apply_copy_sub'),
                    trailing: 'button',
                    button: ctx.t('dashboard.apply_copy_btn'),
                    onTap: () => actions.applyCopy(dashboard.urlPath),
                  })
                : nothing
            }
            ${listRow({
              icon: 'auto',
              tone: armed ? 'warning' : 'neutral',
              title: ctx.t(armed ? 'dashboard.recreate_armed' : 'dashboard.recreate'),
              sub: ctx.t(armed ? 'about.reset_cancels' : 'dashboard.recreate_sub'),
              trailing: 'button',
              button: ctx.t('dashboard.recreate_btn'),
              onTap: () => actions.recreate(dashboard.urlPath),
            })}
          </div>`
        : nothing
    }
  </section>`;
}

/**
 * The Dashboards tab: the five templates as rows (a created one opens; an administrator creates the others with
 * one tap), then a card of options per dashboard the house has.
 */
export function dashboards(ctx: PanelContext, actions: DashboardActions): TemplateResult {
  return html`<section class="fv-card pn-card">
      ${head({ icon: 'grid', title: ctx.t('dashboard.title'), sub: ctx.t('dashboard.sub') })}
      <div class="pn-rows">
        ${TEMPLATES.map((template) => {
          const dashboard = ctx.dashboards.find((d) => d.template?.id === template.id);
          if (dashboard)
            return listRow({
              icon: dashboard.icon ?? template.icon,
              tone: 'accent',
              title: dashboard.title,
              sub: `/${dashboard.urlPath}`,
              trailing: 'chevron',
              onTap: () => actions.open(dashboard.urlPath),
            });
          const creating = actions.creating === template.url;
          return listRow({
            icon: template.icon,
            title: ctx.t(template.title),
            sub: ctx.t(
              creating
                ? 'dashboard.creating'
                : ctx.admin
                  ? template.description
                  : 'dashboard.missing',
            ),
            ...(ctx.admin
              ? {
                  trailing: 'button' as const,
                  button: ctx.t('dashboard.create'),
                  onTap: creating ? undefined : () => actions.create(template),
                }
              : { trailing: 'none' as const }),
          });
        })}
      </div>
    </section>
    ${ctx.dashboards
      .filter((dashboard) => dashboard.template)
      .map((dashboard) => dashboardOptions(ctx, dashboard, actions))}`;
}

/* ---------- the wall ---------- */

/** The binary sensors that see a person: motion, occupancy and presence, by their names, with their rooms. */
function motionSensors(
  hass: HomeAssistant,
): readonly { id: string; name: string; area: string | undefined }[] {
  return Object.values(hass.states)
    .filter(
      (state) =>
        state.entity_id.startsWith('binary_sensor.') &&
        ['motion', 'occupancy', 'presence'].includes(
          String(state.attributes['device_class'] ?? ''),
        ),
    )
    .map((state) => ({
      id: state.entity_id,
      name: String(state.attributes['friendly_name'] ?? state.entity_id),
      area: registryText(hass.areas?.[areaOf(hass, state.entity_id) ?? '']?.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const minutesOf = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The Wall tab: what this device is (its own memory), which dashboards are walls, the screensaver, the day and
 * night, the background. Every house setting is edited whole (`wall` is one object) and saved from the apply bar.
 */
export function wall(ctx: PanelContext): TemplateResult {
  const { shown, admin, hass } = ctx;
  const settings = shown.wall;
  const edit = (patch: Partial<WallSettings>): void => ctx.editWall(patch);
  const isWall = ctx.deviceEdit.wall ?? ctx.device.wall;
  const first =
    settings.dashboards[0] ?? ctx.dashboards.find((d) => d.template)?.urlPath ?? 'fluvy-auto';
  const address = `${location.origin}/${first}?kiosk`;
  const walls = ctx.dashboards.filter((d) => d.urlPath !== 'fluvy');
  const isWallDashboard = (urlPath: string): boolean =>
    settings.dashboards.length ? settings.dashboards.includes(urlPath) : wearsLook(shown, urlPath);
  const toggleWall = (urlPath: string, on: boolean): void => {
    const current = settings.dashboards.length
      ? settings.dashboards
      : walls.map((d) => d.urlPath).filter((path) => isWallDashboard(path));
    edit({
      dashboards: on ? [...new Set([...current, urlPath])] : current.filter((p) => p !== urlPath),
    });
  };
  const sensors = motionSensors(hass);
  const chip = (label: string, key: string, active: boolean) => ({ key, label, active });
  return html`<section class="fv-card pn-card">
      ${head({ icon: 'frame', title: ctx.t('wall.device'), sub: ctx.t('wall.device_sub') })}
      <div class="pn-rows">
        ${listRow({
          icon: 'frame',
          tone: isWall ? 'accent' : 'neutral',
          title: ctx.t('wall.use'),
          sub: ctx.t('wall.use_sub'),
          trailing: 'switch',
          on: isWall,
          onToggle: (on) => ctx.editDevice({ wall: on }),
        })}
      </div>
      ${deviceSize(ctx)}
      <p class="fv-label pn-label">${ctx.t('wall.address')}</p>
      <div class="pn-address">
        <span class="pn-address__url" data-name>${address}</span>
        <button
          class="fv-btn fv-btn--quiet"
          data-fit="32"
          data-target
          @click=${() =>
            ctx.run(async () => {
              // a plain-HTTP address has no Clipboard API: the older way, and honest words when neither works
              if (!(await copyText(address))) throw new Error(ctx.t('wall.copy_failed'));
            }, 'wall.copied')}
        >
          ${ctx.t('wall.copy')}
        </button>
      </div>
      <p class="pn-hint pn-hint--after">${ctx.t('wall.address_sub')}</p>
    </section>
    <section class="fv-card pn-card">
      ${head({
        icon: 'grid',
        title: ctx.t('wall.dashboards'),
        sub: settings.dashboards.length
          ? ctx.t('scope.list_chosen', { n: settings.dashboards.length })
          : ctx.t('wall.dashboards_auto'),
      })}
      <div class="pn-rows">
        ${walls.map((d) =>
          listRow({
            icon: d.icon ?? 'grid',
            title: d.title,
            sub: `/${d.urlPath}`,
            trailing: 'switch',
            on: isWallDashboard(d.urlPath),
            readonly: !admin,
            onToggle: (on) => toggleWall(d.urlPath, on),
          }),
        )}
      </div>
    </section>
    <section class="fv-card pn-card">
      ${head({ icon: 'clock', title: ctx.t('wall.screen'), ...(admin ? {} : { sub: ctx.t('scope.admin_only') }) })}
      <p class="fv-label pn-label">${ctx.t('wall.after')}</p>
      ${choice(
        ctx,
        WALL_AFTER.map((minutes) =>
          chip(
            minutes === 0 ? ctx.t('wall.never') : ctx.t('wall.minutes', { count: minutes }),
            String(minutes),
            settings.after === minutes,
          ),
        ),
        admin ? (key) => edit({ after: Number(key) as WallSettings['after'] }) : null,
        // five words in a phone's column read in two rows (3 + 2), one on a wide panel
        ctx.wide ? 5 : 3,
      )}
      <div class="pn-rows">
        ${listRow({
          icon: 'clock',
          title: ctx.t('wall.clock'),
          sub: ctx.t('wall.clock_sub'),
          trailing: 'switch',
          on: settings.clock,
          readonly: !admin,
          onToggle: (on) => edit({ clock: on }),
        })}
        ${listRow({
          icon: 'moon',
          title: ctx.t('wall.dim'),
          sub: ctx.t('wall.dim_sub'),
          trailing: 'switch',
          on: settings.dim,
          readonly: !admin,
          onToggle: (on) => edit({ dim: on }),
        })}
        ${listRow({
          icon: 'eye',
          title: ctx.t('wall.try'),
          sub: ctx.t('wall.try_sub'),
          trailing: 'button',
          button: ctx.t('wall.try_btn'),
          onTap: () => ctx.previewScreensaver(),
        })}
      </div>
      ${
        sensors.length
          ? html`<p class="fv-label pn-label">${ctx.t('wall.wake')}</p>
              <fluvy-select
                .label=${ctx.t('wall.wake')}
                .value=${settings.wakeEntity}
                .options=${[
                  { value: '', label: ctx.t('wall.wake_none') },
                  ...sensors.map((sensor) => ({
                    value: sensor.id,
                    label: sensor.name,
                    ...(sensor.area ? { hint: sensor.area } : {}),
                  })),
                ]}
                .disabled=${!admin}
                @fluvy-change=${(event: CustomEvent<SelectChangeDetail>) =>
                  edit({ wakeEntity: event.detail.value })}
              ></fluvy-select>`
          : nothing
      }
      <p class="fv-label pn-label">${ctx.t('wall.exit')}</p>
      <p class="pn-hint">${ctx.t('wall.exit_sub')}</p>
      ${choice(
        ctx,
        [
          chip(ctx.t('wall.exit_button'), 'button', settings.exit === 'button'),
          chip(ctx.t('wall.exit_hold'), 'hold', settings.exit === 'hold'),
        ],
        admin ? (key) => edit({ exit: key as WallSettings['exit'] }) : null,
      )}
      <p class="fv-label pn-label">${ctx.t('wall.subview')}</p>
      <p class="pn-hint">${ctx.t('wall.subview_sub')}</p>
      ${choice(
        ctx,
        [
          chip(ctx.t('wall.subview_button'), 'button', settings.subview === 'button'),
          chip(ctx.t('wall.subview_header'), 'header', settings.subview === 'header'),
        ],
        admin ? (key) => edit({ subview: key as WallSettings['subview'] }) : null,
      )}
    </section>
    <section class="fv-card pn-card">
      ${head({ icon: 'sun', title: ctx.t('wall.day_night'), ...(admin ? {} : { sub: ctx.t('scope.admin_only') }) })}
      ${options(
        (['dark', 'follow', 'sun', 'hours'] as const).map((theme) => ({
          key: theme,
          glyph:
            theme === 'dark'
              ? 'moon'
              : theme === 'follow'
                ? 'ha'
                : theme === 'sun'
                  ? 'sun'
                  : 'clock',
          label: ctx.t(`wall.theme_${theme}`),
          value: ctx.t(`wall.theme_${theme}_sub`),
          active: settings.theme === theme,
        })),
        admin ? (key: string) => edit({ theme: key as WallSettings['theme'] }) : null,
        gap(ctx),
      )}
      ${
        settings.theme === 'hours'
          ? html`<div class="pn-pair pn-times">
              <fluvy-time-field
                .value=${minutesOf(settings.from)}
                .hour12=${clock12(hass)}
                .periods=${dayPeriods(hass)}
                .label=${ctx.t('wall.from')}
                .disabled=${!admin}
                @fluvy-time=${(event: CustomEvent<TimeFieldDetail>) => edit({ from: hhmm(event.detail.value) })}
              ></fluvy-time-field>
              <fluvy-time-field
                .value=${minutesOf(settings.to)}
                .hour12=${clock12(hass)}
                .periods=${dayPeriods(hass)}
                .label=${ctx.t('wall.to')}
                .disabled=${!admin}
                @fluvy-time=${(event: CustomEvent<TimeFieldDetail>) => edit({ to: hhmm(event.detail.value) })}
              ></fluvy-time-field>
            </div>`
          : nothing
      }
      <p class="fv-label pn-label">${ctx.t('wall.night_dim')}</p>
      ${choice(
        ctx,
        WALL_NIGHT_DIM.map((share) =>
          chip(
            share === 0 ? ctx.t('wall.off') : ctx.t('wall.percent', { count: share }),
            String(share),
            settings.nightDim === share,
          ),
        ),
        admin ? (key) => edit({ nightDim: Number(key) as WallSettings['nightDim'] }) : null,
      )}
    </section>
    <section class="fv-card pn-card">
      ${head({ icon: 'palette', title: ctx.t('wall.background'), sub: ctx.t(admin ? 'wall.background_sub' : 'scope.admin_only') })}
      ${choice(
        ctx,
        [
          chip(ctx.t('wall.plain'), 'plain', settings.background === 'plain'),
          chip(ctx.t('wall.mesh'), 'wall', settings.background === 'wall'),
        ],
        admin ? (key) => edit({ background: key as WallSettings['background'] }) : null,
      )}
    </section>`;
}

/** The wall's clock and two tiles on the background chosen. */
export function wallPreview(ctx: PanelContext, preview: TemplateResult): TemplateResult {
  return html`<section class="fv-card pn-card pn-card--preview">
    ${head({ icon: 'eye', title: ctx.t('preview.title'), sub: ctx.t('wall.preview_sub') })}
    ${preview}
  </section>`;
}

/* ---------- this device ---------- */

/**
 * The size this device reads its dashboards at, as chips (90 · 100 · 110 · 125 · 150 %): its own memory, saved from
 * the apply bar like the rest and shown at once — the view alone grows, never Home Assistant's chrome. On the
 * Preferences tab for everyone, and on the Wall tab's device card, where a tablet is set up.
 */
function deviceSize(ctx: PanelContext): TemplateResult {
  const zoom = ctx.deviceEdit.zoom ?? ctx.device.zoom;
  return html`<p class="fv-label pn-label">${ctx.t('pref.size')}</p>
    ${choice(
      ctx,
      DEVICE_ZOOMS.map((size) => ({
        key: String(size),
        label: ctx.t('wall.percent', { count: size }),
        active: size === zoom,
      })),
      (key) => ctx.editDevice({ zoom: Number(key) as (typeof DEVICE_ZOOMS)[number] }),
      // five sizes on one line where the column holds them ("100 %" + the pill's sides), else three over two
      ctx.wide ? 5 : 3,
    )}`;
}

/* ---------- preferences ---------- */

export function preferences(ctx: PanelContext): TemplateResult {
  const { shown } = ctx;
  return html`<section class="fv-card pn-card">
      ${head({ icon: 'person', title: ctx.t('pref.title'), sub: ctx.t('pref.sub') })}
      <p class="fv-label pn-label">${ctx.t('pref.language')}</p>
      <fluvy-select
        .label=${ctx.t('pref.language')}
        .value=${shown.language}
        .options=${languageOptions(ctx)}
        @fluvy-change=${(event: CustomEvent<SelectChangeDetail>) =>
          ctx.editPersonal({ language: event.detail.value as CardLanguage })}
      ></fluvy-select>
      <div class="pn-rows">
        ${listRow({
          icon: 'motion',
          title: ctx.t('pref.reduce'),
          sub: ctx.t('pref.reduce_sub'),
          trailing: 'switch',
          on: shown.motion === 'reduced',
          onToggle: (on) => ctx.editPersonal({ motion: on ? 'reduced' : 'system' }),
        })}
        ${listRow({
          icon: 'haptic',
          title: ctx.t('pref.haptics'),
          sub: ctx.t('pref.haptics_sub'),
          trailing: 'switch',
          on: shown.haptics,
          onToggle: (on) => ctx.editPersonal({ haptics: on }),
        })}
        ${listRow({
          icon: 'clock',
          title: ctx.t('pref.activity_card'),
          sub: ctx.t('pref.activity_card_sub'),
          trailing: 'switch',
          on: shown.activityCard,
          onToggle: (on) => ctx.editPersonal({ activityCard: on }),
        })}
        ${listRow({
          icon: 'globe',
          title: ctx.t('pref.translate'),
          sub: ctx.t('pref.translate_sub'),
          onTap: () => window.open(TRANSLATING_URL, '_blank', 'noopener'),
        })}
      </div>
    </section>
    <section class="fv-card pn-card">
      ${head({ icon: 'frame', title: ctx.t('pref.device'), sub: ctx.t('pref.device_sub') })}
      ${deviceSize(ctx)}
      <p class="pn-hint pn-hint--after">${ctx.t('pref.size_sub')}</p>
    </section>`;
}

/** Automatic (with the language it resolves to now), then Fluvy's languages by their own names, English beside. */
function languageOptions(ctx: PanelContext): SelectOption[] {
  const resolved = LANGUAGES[resolveLanguage(ctx.hass.language)];
  return [
    { value: 'auto', label: ctx.t('pref.auto'), hint: resolved.name },
    ...offeredLanguages().map((language) => ({
      value: language.code,
      label: language.name,
      ...(language.english !== language.name ? { hint: language.english } : {}),
    })),
  ];
}

/* ---------- about ---------- */

export interface AboutInfo {
  readonly version: string;
  readonly shell: { readonly styled: number; readonly total: number } | null;
}

export interface AboutActions {
  exportSettings(): void;
  importSettings(file: File): void;
  reset(): void;
  readonly resetArmed: boolean;
}

/**
 * Fluvy itself, the last card of Preferences: its version, the look in use and how much of Home Assistant it styles
 * here, its settings as a file (export; an administrator imports), and an administrator's way back to the house's
 * defaults in two taps.
 */
export function about(ctx: PanelContext, info: AboutInfo, actions: AboutActions): TemplateResult {
  const defaults = lookTitle(
    { palette: HOUSE_DEFAULTS.palette, shape: HOUSE_DEFAULTS.shape, pills: HOUSE_DEFAULTS.pills },
    ctx.t,
  );
  const armed = actions.resetArmed;
  return html`<section class="fv-card pn-card">
    ${head({ icon: 'info', title: ctx.t('about.title'), sub: ctx.t('about.version', { version: info.version || '—' }) })}
    <div class="pn-rows">
      ${listRow({ icon: 'palette', title: ctx.t('about.look'), trailing: 'value', value: lookTitle(ctx.settings.look, ctx.t, knownPalettes(ctx.saved)) })}
      ${listRow({
        icon: 'ha',
        title: ctx.t('about.shell'),
        sub: info.shell
          ? ctx.t('about.shell_value', { styled: info.shell.styled, total: info.shell.total })
          : ctx.t('about.shell_off'),
        trailing: 'none',
      })}
    </div>
    <p class="fv-label pn-label">${ctx.t('about.file')}</p>
    <div class="pn-pair pn-pair--words" data-fill-row>
      <button class="fv-btn fv-btn--quiet" data-target @click=${actions.exportSettings}>
        ${ctx.t('about.export')}
      </button>
      ${
        ctx.admin
          ? html`<label class="fv-btn fv-btn--quiet pn-file" data-target>
              ${ctx.t('about.import')}
              <input
                type="file"
                accept="application/json"
                @change=${(event: Event) => {
                  const input = event.target as HTMLInputElement;
                  const file = input.files?.[0];
                  if (file) actions.importSettings(file);
                  input.value = '';
                }}
              />
            </label>`
          : nothing
      }
    </div>
    <p class="pn-hint pn-hint--after">${ctx.t('about.file_sub')}</p>
    ${
      ctx.admin
        ? html`<div class="pn-rows pn-reset ${armed ? 'is-armed' : ''}">
            ${listRow({
              icon: 'auto',
              tone: armed ? 'warning' : 'neutral',
              title: armed ? ctx.t('about.reset_armed') : ctx.t('about.reset'),
              sub: armed
                ? ctx.t('about.reset_cancels')
                : ctx.t('about.reset_sub', { look: defaults }),
              trailing: 'button',
              button: ctx.t('about.reset_btn'),
              onTap: actions.reset,
            })}
          </div>`
        : nothing
    }
  </section>`;
}
