// the panel's words first: they are here before anything in its chunk says them
import './english.js';
import {
  applyZoom,
  type DevicePatch,
  type DeviceSettings,
  type EffectiveSettings,
  ensureFonts,
  type HomeAssistant,
  type Look,
  type LookHandle,
  lookHandle,
  type LookPreview,
  firstWeather,
  lookRule,
  chromeOf,
  tabsOf,
  type SunLike,
  type WallSettings,
  wallDark,
  markLanguage,
  navigate,
  onWords,
  plural,
  readDevice,
  resyncCardThemes,
  strings,
  writeDevice,
} from '@fluvy/core';
import { THEME_NAME, THEME_SENTINEL } from '@fluvy/tokens/config';
import { statusesKey } from '@fluvy/tokens/runtime';

import { baseStyles, fitPills, ico, motionPreference, reducedMotion, sideScroll } from '@fluvy/ui';
import { chartStyles } from '../chart/engine/index.js';

import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';

import { keyed } from 'lit/directives/keyed.js';

import { houseEnergy } from '../strategy/home-strategy.js';
import { energySources, hasSources } from '../strategy/layout.js';

import { TextRuler } from '../shared/fit.js';
import { HOME_TEMPLATE, templateOf, type Template } from '../strategy/templates.js';
import { generateWith } from '../strategy/generate.js';
import type { FluvyStrategyConfig, View } from '../strategy/types.js';
import { knownPalettes, matchOf } from './palettes.js';

import {
  changeLines,
  sameLook,
  TABS,
  unsaved,
  withEdit,
  type DashboardEntry,
  type DashboardInfo,
  type HouseEdit,
  type PanelContext,
  type PersonalEdit,
  type StrategyEdit,
  type ShareDraft,
  type StrategyEdits,
  type StringKey,
  type Tab,
} from './model.js';
import { PreviewHouse, type EnergyMeters } from './preview.js';

import {
  about,
  appearance,
  appearancePreview,
  dashboards,
  wall,
  wallPreview,
  dashboardPreview,
  preferences,
  scope,
} from './sections.js';

import { panelStyles } from './styles.js';
import { charts, chartsPreview } from './charts.js';
import type { SeriesDraft } from './series.js';

import {
  aboutFacts,
  applyCopy,
  copyEditable,
  createDashboard,
  exportPalette,
  importPalette,
  removePalette,
  savePalette,
  exportSettings,
  importSettings,
  resetHouse,
  recreateDashboard,
  removeSet,
  saveSet,
  showInSidebar,
} from './actions.js';

const s = strings('panel');

/** What Home Assistant hands a custom panel. */
interface Route {
  readonly prefix: string;
  readonly path: string;
}

/** From this width the panel lays out as on a desktop (a 600 column inside its 24 margins). */
const WIDE = 648;
/** From this width the preview leaves the column for a side column of its own (400), always in view. */
const SIDE = 1184;
/** A card's sides (20 each): its content is the open tab's column less them. */
const CARD_SIDES = 40;
/** The side column's width (styles.ts): the preview's card in it is that less its sides. */
const SIDE_COLUMN = 400;
/** From this width the apply bar's pair stands beside its words, 352 wide (styles.ts). */
const BAR_BESIDE = 760;
/** How long the apply bar takes to leave (it enters in 220). */
const BAR_LEAVE = 160;

/**
 * fluvy's settings: the look (a palette, preset or custom, and a shape) for the house or for oneself,
 * where it applies, the automatic dashboard, a person's preferences. A Home Assistant custom panel
 * (`panel_custom`, element `fluvy-panel`), drawn with the cards' own language and wearing the look being
 * chosen, so every tap shows itself on the page it was made on. Nothing here is stored in the panel: the
 * settings live in Home Assistant (`@fluvy/core` settings store) and every change applies live on every
 * screen.
 */
export class FluvyPanel extends LitElement {
  static override properties = {
    hass: { attribute: false },
    narrow: { type: Boolean },
    route: { attribute: false },
    panel: { attribute: false },
    handle: { attribute: false },
    tab: { state: true },
    draft: { state: true },
    houseEdit: { state: true },
    personalEdit: { state: true },
    strategyEdits: { state: true },
    deviceEdit: { state: true },
    share: { state: true },
    seriesDraft: { state: true },
    showAllCommunity: { state: true },
    tryOnApp: { state: true },
    dashboards: { state: true },
    notice: { state: true },
    resetArmed: { state: true },
    recreateArmed: { state: true },
    wide: { state: true },
    side: { state: true },
    content: { state: true },
    meters: { state: true },
    leaving: { state: true },
    creating: { state: true },
    dark: { type: Boolean, reflect: true },
    noTheme: { type: Boolean, reflect: true, attribute: 'no-theme' },
  };

  // the Charts tab's tiles and previews are the chart engine's drawings (its chunk is fetched as the bundle starts)
  static override styles = [...baseStyles, chartStyles, panelStyles];

  declare hass?: HomeAssistant;
  declare narrow: boolean;
  declare route?: Route;
  declare panel?: unknown;
  /** The running look; the page's own when not given (a test or the playground hands one in). */
  declare handle?: LookHandle;
  declare tab: Tab;
  declare draft: Look | undefined;
  declare houseEdit: HouseEdit;
  declare personalEdit: PersonalEdit;
  declare strategyEdits: StrategyEdits;
  /** This device's own changes waiting in the apply bar (a wall panel or not, its size). */
  declare deviceEdit: DevicePatch;
  /** The Share card's words for the custom palette in the draft. */
  declare share: ShareDraft;
  /** The set of series colours open in the Charts tab's editor (undefined: none). */
  declare seriesDraft: SeriesDraft | undefined;
  declare showAllCommunity: boolean;
  declare tryOnApp: boolean;
  declare dashboards: readonly DashboardInfo[];

  /** The cards each automatic dashboard draws now, generated when a person opens its rows to change them. */
  private readonly previews = new Map<string, View[]>();
  declare notice: string;
  declare resetArmed: boolean;
  /** The url path of the dashboard whose Recreate row is armed ('' when none). */
  declare recreateArmed: string;
  declare wide: boolean;
  /** The preview sits in a side column, on every tab. */
  declare side: boolean;
  /** The apply bar's pair stands beside its words (`BAR_BESIDE`). */
  private beside = false;
  /** A card's content width in the open tab's column (0 until it is laid out): what its rows of choices fit. */
  declare content: number;
  /** The house's power meters for the preview's energy flow; null: it has none (the preview's own are drawn). */
  declare meters: EnergyMeters | null | undefined;
  /** The apply bar is on its way out (it keeps its last words while it goes). */
  declare leaving: boolean;
  /** The url path of the dashboard being created ('' when none: two writes, then the list reloads). */
  declare creating: string;
  declare dark: boolean;
  declare noTheme: boolean;

  private settings?: EffectiveSettings;
  /** What this browser is, as remembered. */
  private device: DeviceSettings = readDevice();
  private off: (() => void) | undefined;
  private preview?: PreviewHouse;
  /** The language the preview's cards were named in (they are made again in another). */
  private previewLanguage = '';
  /** Something is shown on the page that is not saved (the look on trial, an edit). */
  private previewing = false;
  private readonly lookSheet = new CSSStyleSheet();
  /** What the panel wears: the look being chosen, in the status colours shown, and the mode (its sheet's key). */
  private worn = '';
  private noticeTimer = 0;
  resetTimer = 0;
  recreateTimer = 0;
  /** The dashboard whose options were touched last: the one the preview draws. */
  private lastEdited = '';
  /** Home Assistant's pickers the Dashboards tab offers (what a dashboard leaves out), pulled in once. */
  private pickers: Promise<void> | undefined;
  private barTimer = 0;
  private stillTimer = 0;
  private fontTimer = 0;
  private loaded = false;
  private strip: HTMLElement | undefined;
  private stopStrip: (() => void) | undefined;
  private resize: ResizeObserver | undefined;
  /** The open tab's column, watched for its width (a tab draws a new one). */
  private column: Element | undefined;
  /** The panel's words measured in its own classes (the choices' labels), afresh when a face lands. */
  private readonly ruler = new TextRuler(() => this.renderRoot);
  private barShown = false;
  private lastBar: TemplateResult | undefined;
  /** The tab the strip was last centred on ('' until it has been). */
  private centred = '';
  /** A tab's body has been shown: from then on a new tab's body fades in (decided when it is made). */
  private entered = false;
  private fading = false;
  /** Pills are fitted to their text again once the web font lands (as the cards do), and the open tab re-centred. */
  private readonly refit = (): void => {
    if (!this.isConnected) return;
    this.fit(true);
    // the choices' labels are measured again in the face that landed
    this.ruler.clear();
    this.requestUpdate();
    // only when the pills moved: a face that loads for something else leaves a strip the person scrolled alone
    if (this.strip && this.strip.scrollWidth !== this.stripWidth) this.centre(this.strip, true);
  };
  /** The strip's scroll width when it was last centred. */
  private stripWidth = 0;

  constructor() {
    super();
    this.narrow = false;
    this.tab = 'appearance';
    this.houseEdit = {};
    this.personalEdit = {};
    this.deviceEdit = {};
    this.strategyEdits = {};
    this.tryOnApp = false;
    this.dashboards = [];
    this.notice = '';
    this.resetArmed = false;
    this.recreateArmed = '';
    this.share = { title: '', author: '' };
    this.seriesDraft = undefined;
    this.showAllCommunity = false;
    this.wide = false;
    this.side = false;
    this.content = 0;
    this.leaving = false;
    this.creating = '';
    this.dark = false;
    this.noTheme = false;
  }

  get look(): LookHandle | undefined {
    return this.handle ?? lookHandle();
  }

  private offWords: (() => void) | undefined;
  override connectedCallback(): void {
    super.connectedCallback();
    ensureFonts();
    // a language's words arriving (fetched after the first paint) re-render the page in them
    this.offWords = onWords(() => this.requestUpdate());
    this.resize = new ResizeObserver((entries) => {
      for (const { target, contentRect } of entries)
        if (target === this) {
          this.wide = contentRect.width >= WIDE;
          this.side = contentRect.width >= SIDE;
          this.beside = contentRect.width >= BAR_BESIDE;
        }
        // a column of no width (the panel hidden) is not laid out: 0, never a card's sides below it
        else this.content = Math.max(0, Math.floor(contentRect.width) - CARD_SIDES);
    });
    this.resize.observe(this);
    this.toggleAttribute('reduced-motion', motionPreference() === 'reduced');
    this.attach();
  }

  /**
   * Follows the running look's settings. Home Assistant may make the panel before the bundle has started the look
   * (the element upgrades the moment it is defined): then it attaches with the first `hass` instead.
   */
  private attach(): void {
    const handle = this.look;
    if (!handle || this.off) return;
    this.settings = handle.settings();
    this.draft = this.settings.look;
    this.off = handle.onChange((settings) => {
      const kept = this.draft && this.settings && !sameLook(this.draft, this.settings.look);
      this.settings = settings;
      if (!kept) this.draft = settings.look;
      // an edit now saved (here, or the same value on another screen) is no longer an edit
      this.houseEdit = unsaved(this.houseEdit, settings);
      this.personalEdit = unsaved(this.personalEdit, settings);
      this.toggleAttribute('reduced-motion', motionPreference() === 'reduced');
      this.requestUpdate();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.closeSaver?.();
    this.offWords?.();
    this.offWords = undefined;
    this.off?.();
    this.off = undefined;
    this.resize?.disconnect();
    this.resize = undefined;
    this.column = undefined;
    // whatever the panel showed without saving ends with it
    if (this.previewing) this.look?.preview(null);
    this.previewing = false;
    this.tryOnApp = false;
    for (const timer of [
      this.noticeTimer,
      this.resetTimer,
      this.recreateTimer,
      this.barTimer,
      this.stillTimer,
      this.fontTimer,
    ])
      clearTimeout(timer);
    (document.fonts as FontFaceSet | undefined)?.removeEventListener('loadingdone', this.refit);
    this.stopStrip?.();
    this.stopStrip = undefined;
    this.strip = undefined;
    this.centred = '';
  }

  protected override firstUpdated(): void {
    const root = this.renderRoot as ShadowRoot;
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, this.lookSheet];
    // (a test's DOM may have no font loading at all)
    const fonts = document.fonts as FontFaceSet | undefined;
    fonts?.addEventListener('loadingdone', this.refit);
    void fonts?.ready.then(this.refit);
    this.fontTimer = window.setTimeout(this.refit, 1200); // a face can become usable a frame after `ready` says so
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('route') && this.route) {
      const segment = this.route.path.split('/')[1];
      // `/fluvy/about` (a link from before 1.5) opens Preferences, where Fluvy's own card now is
      const tab = (segment === 'about' ? 'preferences' : segment) as Tab | undefined;
      if (tab && TABS.includes(tab)) this.tab = tab;
    }
    if (changed.has('hass') && this.hass) {
      if (!this.off) this.attach();
      this.dark = this.hass.themes?.darkMode ?? false;
      this.noTheme = getComputedStyle(this).getPropertyValue(THEME_SENTINEL).trim() === '';
      // the dashboards as the sidebar lists them: again whenever that list changes (one created, renamed, removed)
      const panels = this.hass.panels;
      if (!this.loaded || panels !== changed.get('hass')?.panels) {
        this.loaded = true;
        void this.loadDashboards();
      }
      this.previewHouse().update(this.hass);
    }
    // the whole panel wears the look being chosen, in the status colours shown: a tap on a palette or a status's
    // colour re-skins the page it was made on
    const statuses = this.houseEdit.statuses ?? this.settings?.statuses ?? {};
    const worn = `${statusesKey(statuses)}|${this.dark}`;
    if ((changed.has('draft') || worn !== this.worn) && this.draft) {
      this.worn = worn;
      this.lookSheet.replaceSync(
        // the panel in the app's mode; a wall preview at night in the dark one, scoped to it
        lookRule(this.draft, this.dark ? 'dark' : 'light', ':host', false, statuses) +
          lookRule(this.draft, 'dark', '.pn-night', false, statuses) +
          // the Charts tab draws both modes side by side: the day's tokens scoped to its light half
          lookRule(this.draft, 'light', '.pn-day', false, statuses),
      );
      // the preview's cards derive their colours on the look being chosen: read again when it changes, never on a
      // tick of the house (a card attached again reads its own)
      resyncCardThemes();
    }
    if (
      changed.has('tryOnApp') ||
      changed.has('houseEdit') ||
      changed.has('personalEdit') ||
      (changed.has('draft') && this.tryOnApp)
    )
      this.showEdits();
    // its words in the language chosen (on trial too), marked where it is not the page's
    markLanguage(this, this.hass?.language);
    // the bar leaves the way it came, keeping its words while it goes
    const shown = this.pending();
    if (this.barShown && !shown) {
      this.leaving = !reducedMotion();
      clearTimeout(this.barTimer);
      this.barTimer = window.setTimeout(() => (this.leaving = false), BAR_LEAVE);
    }
    if (shown) this.leaving = false;
    this.barShown = shown;
  }

  /**
   * Fits the pills to their text, keeping the tab strip where it was scrolled: measuring shrinks every pill for a
   * moment, and the browser clamps the strip's scroll to the shorter row (the last tab ended half out of view).
   */
  private fit(force = false): void {
    const strip = this.strip;
    const left = strip?.scrollLeft ?? 0;
    fitPills(this.renderRoot, force);
    if (strip && strip.scrollLeft !== left) strip.scrollLeft = left;
  }

  protected override updated(): void {
    this.fit();
    // the open tab's column (a new one a tab): its width lays out the rows of choices
    const column = this.renderRoot.querySelector('.pn-body') ?? undefined;
    if (column !== this.column) {
      if (this.column) this.resize?.unobserve(this.column);
      this.column = column;
      if (column) this.resize?.observe(column);
    }
    // the cards rise in once (420 ms, up to 240 ms staggered) with the first body that has them; after that a
    // tab change only fades its body in
    if (!this.entered && this.renderRoot.querySelector('.pn-body .fv-card')) {
      this.entered = true;
      this.stillTimer = window.setTimeout(() => this.setAttribute('still', ''), 700);
    }
    // the tab strip scrolls sideways on a phone: a mouse drags it too
    const strip = this.renderRoot.querySelector<HTMLElement>('.pn-tabs__row');
    if (strip !== this.strip) {
      this.stopStrip?.();
      this.strip = strip ?? undefined;
      this.stopStrip = strip ? sideScroll(strip) : undefined;
      this.centred = '';
    }
    // the open tab in the middle: when it changes, and again at once when the pills were fitted to new widths
    if (strip && this.centred !== this.tab) this.centre(strip, this.centred === '');
    else if (strip && strip.scrollWidth !== this.stripWidth) this.centre(strip, true);
  }

  /** Scrolls the open tab into the middle of the strip (at once the first time, gliding after). */
  private centre(strip: HTMLElement, first: boolean): void {
    this.centred = this.tab;
    this.stripWidth = strip.scrollWidth;
    const active = strip.querySelector<HTMLElement>('.fv-chip.is-active');
    if (!active || strip.scrollWidth <= strip.clientWidth) return this.onStrip(strip);
    const most = strip.scrollWidth - strip.clientWidth;
    const middle = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
    // within a fade's width of an end, the end itself (the first pill never half faded for 2 px of scroll)
    const left = middle < 24 ? 0 : most - middle < 24 ? most : middle;
    strip.scrollTo({ left, behavior: first || reducedMotion() ? 'instant' : 'smooth' });
    if (first) this.onStrip(strip);
  }

  /** The strip fades only on a side where it goes on (drawn straight on the row: nothing to re-render). */
  private onStrip(strip: HTMLElement): void {
    strip.classList.toggle('is-start', strip.scrollLeft <= 1);
    strip.classList.toggle('is-end', strip.scrollLeft >= strip.scrollWidth - strip.clientWidth - 1);
  }

  /* ---------- state ---------- */

  /** The panel's words, in the language fluvy's settings chose. */
  readonly t = (key: StringKey, values?: Record<string, string | number>): string =>
    s(this.hass, key, values);

  /** The preview's little house, its rooms named in the panel's language. */
  private previewHouse(): PreviewHouse {
    const language = this.t('preview.living');
    if (!this.preview || this.previewLanguage !== language) {
      this.previewLanguage = language;
      this.preview = new PreviewHouse({
        living: this.t('preview.living'),
        kitchen: this.t('preview.kitchen'),
        bedroom: this.t('preview.bedroom'),
        blinds: this.t('preview.blinds'),
        temperature: this.t('preview.temperature'),
        solar: this.t('preview.solar'),
        grid: this.t('preview.grid'),
        battery: this.t('preview.battery'),
        alarm: this.t('preview.alarm'),
        door: this.t('preview.door'),
      });
      if (this.hass) this.preview.update(this.hass);
    }
    return this.preview;
  }

  /** Something to save or to stop: a look chosen, an edit, or the look worn by the whole app on trial. */
  private pending(): boolean {
    return (
      this.tryOnApp ||
      (!!this.draft && !!this.settings && !sameLook(this.draft, this.settings.look)) ||
      Object.keys(this.houseEdit).length > 0 ||
      Object.keys(this.personalEdit).length > 0 ||
      Object.keys(this.strategyEdits).length > 0 ||
      Object.keys(this.deviceEdit).length > 0
    );
  }

  /**
   * Shows on the whole screen what is not saved: the look on trial, where it applies (the menus, the frame) and
   * the person's preferences (the cards' language, motion). The look itself is always on the panel.
   */
  private showEdits(): void {
    const preview: LookPreview = {
      ...(this.tryOnApp && this.draft ? { look: this.draft } : {}),
      ...this.houseEdit,
      ...this.personalEdit,
    };
    const showing = Object.keys(preview).length > 0;
    if (!showing && !this.previewing) return;
    this.previewing = showing;
    this.look?.preview(showing ? preview : null);
    this.toggleAttribute('reduced-motion', motionPreference() === 'reduced');
  }

  private show(notice: string): void {
    this.notice = notice;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => (this.notice = ''), 2400);
  }

  /** Runs a change against Home Assistant; what it refuses (a non-admin writing the house's settings) shows as the notice. */
  readonly run = (task: () => Promise<unknown>, done?: StringKey): void => {
    void task().then(
      () => this.show(this.t(done ?? 'saved')),
      (error: unknown) => this.show(error instanceof Error ? error.message : String(error)),
    );
  };

  /**
   * The house's dashboards as this person's own frontend lists them (`hass.panels`: admin or not, the same
   * sidebar they see), and which one is the automatic dashboard (its config names our strategy). Reading is for
   * everyone; only writing is an administrator's.
   */
  async loadDashboards(): Promise<void> {
    const hass = this.hass;
    if (!hass) return;
    const panels = Object.values(hass.panels ?? {}).filter(
      (panel) => panel.component_name === 'lovelace' && panel.url_path,
    );
    const overview = (): string => {
      const own = hass.localize?.('panel.states');
      return own && own !== 'panel.states' ? own : this.t('scope.overview');
    };
    // the dashboards collection (an administrator's list): each one's id and whether the sidebar lists it
    const listed = hass.user?.is_admin
      ? await hass
          .callWS<readonly DashboardEntry[]>({ type: 'lovelace/dashboards/list' })
          .catch(() => [])
      : [];
    const entries = new Map(
      (Array.isArray(listed) ? listed : []).map((entry) => [entry.url_path, entry]),
    );
    this.dashboards = await Promise.all(
      panels.map(async (panel): Promise<DashboardInfo> => {
        const entry = entries.get(panel.url_path);
        // a dashboard kept out of the sidebar has no panel title or icon; the collection still knows them
        const icon = panel.icon ?? entry?.icon ?? undefined;
        const info: DashboardInfo = {
          urlPath: panel.url_path,
          title:
            panel.title ||
            entry?.title ||
            (panel.url_path === 'lovelace' ? overview() : panel.url_path),
          ...(icon ? { icon } : {}),
          ...(entry ? { id: entry.id, inSidebar: entry.show_in_sidebar } : {}),
        };
        const config = await hass
          .callWS<{ strategy?: Record<string, unknown> }>({
            type: 'lovelace/config',
            url_path: panel.url_path === 'lovelace' ? null : panel.url_path,
          })
          .catch(() => undefined);
        const strategy = config?.strategy;
        const template = templateOf(strategy?.['type']);
        return strategy && template ? { ...info, strategy, template } : info;
      }),
    );
    // the edits that still change something, dashboard by dashboard
    const edits: Record<string, StrategyEdit> = {};
    for (const dashboard of this.dashboards) {
      const edit = this.strategyEdits[dashboard.urlPath];
      if (!edit || !dashboard.strategy) continue;
      const kept = this.unsavedStrategy(edit, dashboard.strategy);
      if (Object.keys(kept).length) edits[dashboard.urlPath] = kept;
    }
    this.strategyEdits = edits;
  }

  /** The dashboard the Dashboards tab previews: the one touched last, else the first of ours. */
  private previewed(): DashboardInfo | undefined {
    const ours = this.dashboards.filter((d) => d.template);
    return ours.find((d) => d.urlPath === this.lastEdited) ?? ours[0];
  }

  /**
   * The house's power meters as the automatic dashboard finds them, asked once (the preview's energy flow is drawn
   * on them when there are any, on the preview's own when there are none).
   */
  private async loadMeters(): Promise<void> {
    const hass = this.hass;
    if (!hass || this.meters !== undefined) return;
    this.meters = null;
    const roles = await houseEnergy(hass).catch(() => undefined);
    if (!roles || !hasSources(roles)) return;
    const sources = energySources(roles);
    this.meters = {
      ...(sources.length ? { sources } : {}),
      ...(roles.homePower ? { home: roles.homePower } : {}),
    };
  }

  /** The strategy edits that still change something (a key taken away that is not there is no edit). */
  private unsavedStrategy(
    edit: StrategyEdit,
    saved: Readonly<Record<string, unknown>>,
  ): StrategyEdit {
    return Object.fromEntries(
      Object.entries(unsaved(edit, saved)).filter(
        ([key, value]) => value !== undefined || key in saved,
      ),
    );
  }

  /**
   * Generates a dashboard's cards so a person can change them here: the template's own, with no edits on top, so the
   * rows say what the house draws and what the person changed stands beside them.
   */
  private async loadPreview(urlPath: string): Promise<void> {
    if (this.previews.has(urlPath)) return;
    const info = this.dashboards.find((d) => d.urlPath === urlPath);
    const template = info?.template;
    const strategy = info?.strategy;
    const hass = this.hass;
    if (!template || !strategy || !hass) return;
    const { views } = await generateWith(template, strategy as unknown as FluvyStrategyConfig, hass, `/${urlPath}`);
    this.previews.set(urlPath, views);
    this.requestUpdate();
  }

  private context(): PanelContext | undefined {
    const handle = this.look;
    const hass = this.hass;
    const settings = this.settings;
    if (!handle || !hass || !settings || !this.draft) return undefined;
    const draft = this.draft;
    const savedStrategy = (urlPath: string): Record<string, unknown> | undefined =>
      this.dashboards.find((d) => d.urlPath === urlPath)?.strategy;
    return {
      hass,
      t: this.t,
      admin: hass.user?.is_admin ?? false,
      mode: this.dark ? 'dark' : 'light',
      wide: this.wide,
      fit: this.content > 0 ? { ruler: this.ruler, width: this.content } : undefined,
      handle,
      settings,
      shown: { ...settings, ...this.houseEdit, ...this.personalEdit },
      draft,
      dirty: !sameLook(draft, settings.look),
      houseEdit: this.houseEdit,
      personalEdit: this.personalEdit,
      strategyEdits: this.strategyEdits,
      device: this.device,
      deviceEdit: this.deviceEdit,
      saved: handle.store.house.palettes,
      share: this.share,
      showAllCommunity: this.showAllCommunity,
      tryOnApp: this.tryOnApp,
      dashboards: this.dashboards,
      strategyOf: (urlPath) => {
        const saved = savedStrategy(urlPath);
        return saved && withEdit(saved, this.strategyEdits[urlPath] ?? {});
      },
      previewOf: (urlPath) => this.previews.get(urlPath),
      loadPreview: (urlPath) => {
        void this.loadPreview(urlPath);
      },
      setDraft: (look) => {
        this.draft = { ...(this.draft ?? draft), ...look };
        // a palette that is a saved or community one brings its words to the Share card
        if (look.palette !== undefined) {
          const match = matchOf(look.palette, knownPalettes(handle.store.house.palettes));
          if (match) this.share = { title: match.title, author: match.author ?? '' };
        }
      },
      editHouse: (edit) => {
        if (this.settings) this.houseEdit = unsaved({ ...this.houseEdit, ...edit }, this.settings);
      },
      editWall: (patch) => {
        if (!this.settings) return;
        const wall = { ...(this.houseEdit.wall ?? this.settings.wall), ...patch };
        this.houseEdit = unsaved({ ...this.houseEdit, wall }, this.settings);
      },
      editCharts: (patch) => {
        if (!this.settings) return;
        const next = { ...(this.houseEdit.charts ?? this.settings.charts), ...patch };
        this.houseEdit = unsaved({ ...this.houseEdit, charts: next }, this.settings);
      },
      seriesDraft: this.seriesDraft,
      setSeriesDraft: (draft) => {
        this.seriesDraft = draft;
      },
      editPersonal: (edit) => {
        if (this.settings)
          this.personalEdit = unsaved({ ...this.personalEdit, ...edit }, this.settings);
      },
      editStrategy: (urlPath, edit) => {
        const saved = savedStrategy(urlPath);
        if (!saved) return;
        const kept = this.unsavedStrategy(
          { ...(this.strategyEdits[urlPath] ?? {}), ...edit },
          saved,
        );
        const next: Record<string, StrategyEdit> = { ...this.strategyEdits };
        if (Object.keys(kept).length) next[urlPath] = kept;
        else delete next[urlPath];
        this.strategyEdits = next;
        this.lastEdited = urlPath;
      },
      editDevice: (patch) => {
        this.deviceEdit = unsaved({ ...this.deviceEdit, ...patch }, this.device);
      },
      previewScreensaver: () => this.previewScreensaver(),
      setTryOnApp: (on) => {
        this.tryOnApp = on;
      },
      notify: (key) => this.show(this.t(key)),
      setShare: (patch) => {
        this.share = { ...this.share, ...patch };
      },
      setShowAllCommunity: (on) => {
        this.showAllCommunity = on;
      },
      apply: (to) => this.run(() => this.save(to)),
      discard: () => {
        this.draft = this.settings?.look;
        this.houseEdit = {};
        this.personalEdit = {};
        this.strategyEdits = {};
        this.deviceEdit = {};
        this.tryOnApp = false;
      },
      run: (task, done) => this.run(task, done),
    };
  }

  /**
   * Saves every edit: the look (for the house, which ends a person's own look, or for this person), the house's
   * settings, this person's preferences and the automatic dashboard's options. An edit clears itself when Home
   * Assistant hands the saved value back, so nothing flickers to the old one in between.
   */
  private async save(to: 'house' | 'me'): Promise<void> {
    const handle = this.look;
    const settings = this.settings;
    if (!handle || !settings || !this.draft) return;
    const { store } = handle;
    if (!sameLook(this.draft, settings.look)) {
      const { palette, shape, pills } = this.draft;
      const tabs = tabsOf(this.draft);
      const chrome = chromeOf(this.draft);
      if (to === 'house') {
        await store.saveHouse({ palette, shape, pills, tabs, chrome });
        if (settings.personalLook)
          await store.savePersonal({
            palette: undefined,
            shape: undefined,
            pills: undefined,
            tabs: undefined,
            chrome: undefined,
          });
      } else await store.savePersonal({ palette, shape, pills, tabs, chrome });
    }
    if (Object.keys(this.houseEdit).length) await store.saveHouse(this.houseEdit);
    if (Object.keys(this.personalEdit).length) await store.savePersonal(this.personalEdit);
    let written = false;
    for (const [urlPath, edit] of Object.entries(this.strategyEdits)) {
      const saved = this.dashboards.find((d) => d.urlPath === urlPath)?.strategy;
      if (!saved || !Object.keys(edit).length) continue;
      await this.hass?.callWS({
        type: 'lovelace/config/save',
        url_path: urlPath,
        config: { strategy: withEdit(saved, edit) },
      });
      written = true;
      // what the rows show is the automatic drawing again: the edits only stand beside it, as their own rules
      this.previews.delete(urlPath);
    }
    if (written) await this.loadDashboards();
    if (Object.keys(this.deviceEdit).length) {
      // the device's own memory: the wall's controller, in every page, reads it again; the size shows at once
      const edit = this.deviceEdit;
      this.device = writeDevice(edit);
      this.deviceEdit = {};
      if (edit.wall !== undefined)
        (window as { __fluvy?: { wall?: { refresh?: () => void } } }).__fluvy?.wall?.refresh?.();
      if (edit.zoom !== undefined) applyZoom(this.device.zoom);
    }
    this.tryOnApp = false;
  }

  /**
   * The Fluvy theme chosen in Home Assistant itself (this person's profile, or the house's default theme) wears the
   * look on every page whatever the scope: the Scope tab says so, and offers Home Assistant's own way back.
   */
  private themeSource(): 'profile' | 'house' | 'other' | null {
    const hass = this.hass;
    if (hass?.selectedTheme?.theme === THEME_NAME) return 'profile';
    const theme = hass?.themes?.theme;
    if (!theme) return null;
    return theme === THEME_NAME ? 'house' : 'other';
  }

  /** The theme Home Assistant wears, as its profile lists it (its own default is "Home Assistant"). */
  private themeName(): string {
    const theme = this.hass?.themes?.theme ?? '';
    return theme === 'default' ? 'Home Assistant' : theme;
  }

  private leaveTheme(source: 'profile' | 'house' | 'other'): void {
    const hass = this.hass;
    if (!hass) return;
    // the profile's theme picker's own event: Home Assistant stores the choice for this person (every device)
    const settheme = (theme: string): boolean =>
      this.dispatchEvent(
        new CustomEvent('settheme', { detail: { theme }, bubbles: true, composed: true }),
      );
    if (source === 'other') settheme(THEME_NAME);
    else if (source === 'profile') settheme('');
    else
      this.run(async () => {
        await hass.callService('frontend', 'set_theme', { name: 'default' });
        if (hass.themes.default_dark_theme === THEME_NAME)
          await hass.callService('frontend', 'set_theme', { name: 'none', mode: 'dark' });
      });
  }

  /* ---------- render ---------- */

  private select(tab: Tab): void {
    // a body made by a tab change fades in; the first one rose in with its cards
    if (this.entered) this.fading = true;
    this.tab = tab;
    if (this.route) navigate(`${this.route.prefix}/${tab}`, true);
  }

  /** The tab row as a tab list: the arrows move along it (wrapping), Home and End to its ends. */
  private onTabKey(event: KeyboardEvent): void {
    const index = TABS.indexOf(this.tab);
    const next =
      event.key === 'ArrowRight'
        ? TABS[(index + 1) % TABS.length]
        : event.key === 'ArrowLeft'
          ? TABS[(index - 1 + TABS.length) % TABS.length]
          : event.key === 'Home'
            ? TABS[0]
            : event.key === 'End'
              ? TABS[TABS.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    this.select(next);
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLElement>(`#pn-tab-${next}`)?.focus(),
    );
  }

  /** The open tab's cards (its preview apart: it goes under them, or beside them in a side column). */
  private body(ctx: PanelContext): TemplateResult {
    switch (this.tab) {
      case 'appearance':
        return appearance(ctx, {
          exportPalette,
          importPalette: (file) => importPalette(this, ctx, file),
          savePalette: (file) => savePalette(this, ctx, file),
          removePalette: (name) => removePalette(this, ctx, name),
        });
      case 'charts':
        return charts(ctx, {
          saveSet: (draft) => saveSet(this, ctx, draft),
          removeSet: (id) => removeSet(this, ctx, id),
        });
      case 'scope': {
        const source = this.themeSource();
        return scope(
          ctx,
          source ? { source, name: this.themeName(), leave: () => this.leaveTheme(source) } : null,
        );
      }
      case 'dashboard':
        // Home Assistant's entity picker is its editors': pulled in as a card's editor pulls them
        this.pickers ??= import('../shared/rows-editor.js').then((editor) =>
          editor.ensureEditorElements(),
        );
        return dashboards(ctx, {
          create: (template) => createDashboard(this, ctx, template),
          recreate: (urlPath) => recreateDashboard(this, ctx, urlPath),
          copyEditable: (urlPath) => copyEditable(this, ctx, urlPath),
          applyCopy: (urlPath) => applyCopy(this, ctx, urlPath),
          hasCopy: (urlPath) => this.dashboards.some((d) => d.urlPath === `${urlPath}-custom`),
          open: (urlPath) => navigate(`/${urlPath}`),
          showInSidebar: (urlPath, on) => showInSidebar(this, ctx, urlPath, on),
          creating: this.creating,
          recreateArmed: this.recreateArmed,
        });
      case 'wall':
        return wall(ctx);
      case 'preferences':
        // this person's choices, this device's, then Fluvy itself
        return html`${preferences(ctx)}
        ${about(ctx, aboutFacts(), {
          exportSettings: () => exportSettings(this, ctx),
          importSettings: (file) => importSettings(this, file),
          reset: () => resetHouse(this),
          resetArmed: this.resetArmed,
        })}`;
    }
  }

  /**
   * What the open tab's changes look like on real cards: the automatic dashboard's options on its tab, the look
   * everywhere else. Under the cards of the tabs that have one; in the side column, on every tab.
   */
  private previewCard(ctx: PanelContext): TemplateResult | undefined {
    const house = this.previewHouse();
    if (this.tab === 'dashboard') {
      const previewed = this.previewed();
      if (!previewed) return undefined;
      void this.loadMeters();
      return dashboardPreview(
        ctx,
        this.templatePreview(
          previewed.template ?? HOME_TEMPLATE,
          ctx.strategyOf(previewed.urlPath) ?? {},
        ),
        previewed.title,
      );
    }
    if (this.tab === 'wall') {
      // the wall as it would be now: its background, its night (the dark tokens scoped to the preview, the
      // cards told the mode) and the veil the night darkens it with
      const wall = ctx.shown.wall;
      const night = this.wallNight(wall);
      house.setDark(night);
      const classes = [
        'pn-preview pn-preview--wall',
        wall.background === 'wall' ? 'fv-bg--wall' : '',
        night ? 'pn-night' : '',
      ].join(' ');
      return wallPreview(
        ctx,
        html`<div class=${classes}>
          ${house.clock()}
          <div class="pn-preview__tiles">${house.tile('living')}${house.tile('kitchen')}</div>
          ${night && wall.nightDim > 0 ? html`<div class="pn-preview__veil" style="opacity:${wall.nightDim / 100}"></div>` : nothing}
        </div>`,
      );
    }
    house.setDark(undefined);
    // the charts as the settings draw them: in the side column (its 400 less a card's sides), or under the cards
    if (this.tab === 'charts')
      return chartsPreview(ctx, this.side ? SIDE_COLUMN - CARD_SIDES : this.content || undefined);
    if (this.tab !== 'appearance' && !this.side) return undefined;
    // see-through cards are judged on what shows through them: a picture stands in for a view's background
    const glass = ctx.shown.cards.opacity < 100;
    return appearancePreview(
      ctx,
      html`<div class="pn-preview ${glass ? 'pn-preview--glass' : ''}">
        <div class="pn-preview__hello">${house.hello()}</div>
        <div class="pn-preview__tiles">
          ${house.tile('living')}${house.tile('kitchen')}
          <div class="pn-preview__extra">${house.tile('blinds')}</div>
          <div class="pn-preview__extra">${house.tile('temperature')}</div>
        </div>
        ${house.thermostat('compact')}
      </div>`,
    );
  }

  /** Whether the wall would be dark now, by the settings shown: its own rule, else the app's mode. */
  private wallNight(wall: WallSettings): boolean {
    const sun = this.hass?.states['sun.sun'] as SunLike | undefined;
    return wallDark(wall, new Date(), sun) ?? this.dark;
  }

  private closeSaver: (() => void) | undefined;

  /**
   * The screensaver as the wall would show it now, over this page until a tap: the settings shown (the clock or
   * black, the wall's background, its day or night), the real piece, mounted under the panel's look — in the
   * night's tokens when it is night — and taken down by the tap that would wake the wall.
   */
  private previewScreensaver(): void {
    this.closeSaver?.();
    const wall = { ...this.settings?.wall, ...this.houseEdit.wall } as WallSettings;
    const hass = this.hass;
    if (!hass || !this.settings) return;
    const night = this.wallNight(wall);
    const host = document.createElement('div');
    host.className = night ? 'pn-night' : '';
    this.renderRoot.append(host);
    const shown = (): HomeAssistant | undefined =>
      this.hass &&
      ({ ...this.hass, themes: { ...this.hass.themes, darkMode: night } } as HomeAssistant);
    void import('../wall/index.js').then(({ sleep }) => {
      if (!host.isConnected) return; // the panel left meanwhile
      const close = sleep({
        clock: wall.clock,
        dim: wall.dim,
        weather: firstWeather(hass),
        hass: shown,
        host,
        preview: true,
        onWake: () => this.closeSaver?.(),
      });
      this.closeSaver = () => {
        this.closeSaver = undefined;
        close();
        host.remove();
      };
    });
  }

  /** A template's cards as its dashboard will draw them, in the options chosen. */
  private templatePreview(
    template: Template,
    strategy: Readonly<Record<string, unknown>>,
  ): TemplateResult {
    const house = this.previewHouse();
    const word = (key: string, fallback: string): string =>
      typeof strategy[key] === 'string' ? (strategy[key] as string) : fallback;
    const size = word('tile_size', 'large') === 'compact' ? 'compact' : 'large';
    const variant = word('thermostat_variant', 'dial');
    const flow = word('flow_style', 'stream');
    const room = word('room_variant', 'tile');
    switch (template.id) {
      case 'rooms':
        return html`<div class="pn-preview pn-preview--dash">
          <div class="pn-preview__tiles">
            ${house.room('living', room)}${house.room('kitchen', room)}
          </div>
          <div class="pn-preview__side">${house.thermostat(variant)}</div>
          ${house.tile('living', size)}
        </div>`;
      case 'energy':
        return html`<div class="pn-preview">${house.energy(flow, this.meters ?? null)}</div>`;
      case 'security':
        return html`<div class="pn-preview pn-preview--dash">
          <div class="pn-preview__tiles">${house.tile('blinds')}${house.lock()}</div>
          <div class="pn-preview__side">${house.alarm()}</div>
        </div>`;
      case 'wall':
        return html`<div class="pn-preview pn-preview--dash">
          <div class="pn-preview__tiles">
            ${house.room('living', 'tile')}${house.room('kitchen', 'tile')}
          </div>
          <div class="pn-preview__side">${house.thermostat(variant)}</div>
          ${house.clock()}
        </div>`;
      default:
        return html`<div class="pn-preview pn-preview--dash">
          <div class="pn-preview__tiles">
            ${house.tile('living', size)}${house.tile('kitchen', size)}
          </div>
          <div class="pn-preview__side">${house.thermostat(variant)}</div>
          ${house.energy(flow, this.meters ?? null)}
        </div>`;
    }
  }

  /**
   * The apply bar, on every tab while something is pending: what changes ("Linen → Volt · Round", or how many
   * things), Discard, and how to save. A changed look is applied as an equal pair, for the house or only for me
   * (one button for someone who may not change the house's); anything else is saved. A look worn on trial with
   * nothing changed offers only to stop.
   */
  private bar(ctx: PanelContext): TemplateResult | undefined {
    const lines = changeLines(ctx);
    if (!lines.length && !ctx.tryOnApp) return undefined;
    const text =
      lines.length === 1
        ? lines[0]
        : lines.length
          ? plural(ctx.hass, 'panel.apply.changes', lines.length)
          : ctx.t('apply.trying');
    const pair = ctx.dirty && ctx.admin;
    // an equal pair while the longer label holds its half (the bar's 12 sides and the 8 between them); else one over
    // the other, as wide as the bar (fr "Appliquer à la maison" on a phone)
    const half = ((this.beside ? 352 : this.content + CARD_SIDES - 24) - 8) / 2;
    const stack =
      pair &&
      this.content > 0 &&
      [ctx.t('apply.me'), ctx.t('apply.house')].some(
        (label) => this.ruler.width('fv-btn', label) + 32 > half,
      );
    return html`<div
      class="pn-bar ${pair ? '' : 'pn-bar--single'} ${lines.length ? '' : 'pn-bar--trial'}"
      role="region"
      aria-label=${ctx.t('apply.region')}
    >
      <span class="pn-bar__text">${text}</span>
      <button
        class="fv-btn fv-btn--quiet pn-bar__discard"
        data-target
        data-fit="32"
        @click=${ctx.discard}
      >
        ${ctx.t(lines.length ? 'apply.discard' : 'apply.stop')}
      </button>
      ${
        !lines.length
          ? nothing
          : pair
            ? html`<div
                class="pn-bar__pair ${stack ? 'pn-bar__pair--stack' : ''}"
                data-fill-row=${stack ? nothing : ''}
              >
                <button class="fv-btn fv-btn--quiet" data-target @click=${() => ctx.apply('me')}>
                  ${ctx.t('apply.me')}
                </button>
                <button
                  class="fv-btn fv-btn--accent"
                  data-target
                  @click=${() => ctx.apply('house')}
                >
                  ${ctx.t('apply.house')}
                </button>
              </div>`
            : html`<div class="pn-bar__pair" data-fill-row>
                <button class="fv-btn fv-btn--accent" data-target @click=${() => ctx.apply('me')}>
                  ${ctx.t(ctx.dirty ? 'apply.mine' : 'apply.save')}
                </button>
              </div>`
      }
    </div>`;
  }

  private tabs(): TemplateResult {
    // a wide panel's tabs share the column as a filling row; a phone's are content-sized
    const fill = this.wide;
    const row = html`<div
      class="pn-tabs__row ${fill ? 'fv-chips--fill' : ''}"
      role="tablist"
      data-scroll-row
      @scroll=${(event: Event) => this.onStrip(event.currentTarget as HTMLElement)}
      @keydown=${(event: KeyboardEvent) => this.onTabKey(event)}
    >
      ${TABS.map(
        (tab) =>
          html`<button
            class="fv-chip ${this.tab === tab ? 'is-active' : ''}"
            id="pn-tab-${tab}"
            role="tab"
            aria-selected=${this.tab === tab ? 'true' : 'false'}
            aria-controls="pn-body"
            tabindex=${this.tab === tab ? 0 : -1}
            data-target
            data-fit=${fill ? nothing : '32'}
            @click=${() => this.select(tab)}
          >
            <span class="fv-chip__pill" data-control>${this.t(`tab.${tab}`)}</span>
          </button>`,
      )}
    </div>`;
    // a wide panel lays the tabs out as a full row; a phone scrolls content-sized pills (fresh nodes either way,
    // so no measured width outlives its layout)
    return html`<nav class="pn-tabs ${fill ? 'is-wide' : ''}">${keyed(fill, row)}</nav>`;
  }

  protected override render(): TemplateResult {
    const ctx = this.context();
    if (!ctx) return html`<div class="pn"></div>`;
    const bar = this.bar(ctx);
    if (bar) this.lastBar = bar;
    const foot = bar
      ? html`<div class="pn-foot">${bar}</div>`
      : this.leaving && this.lastBar
        ? html`<div class="pn-foot is-leaving">${this.lastBar}</div>`
        : nothing;
    const notice = this.notice
      ? html`<div class="pn-notice" role="status" data-fit="40" data-align="center">
          ${this.notice}
        </div>`
      : nothing;
    const preview = this.previewCard(ctx);
    return html`<div class="pn ${this.wide ? 'is-wide' : ''} ${this.side ? 'is-side' : ''}">
      <div class="pn-col">
        <header class="pn-top">
          ${
            this.narrow
              ? ico('menu', 'neutral', {
                  label: this.t('menu'),
                  onTap: () =>
                    this.dispatchEvent(
                      new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }),
                    ),
                })
              : nothing
          }
          <div class="pn-titles">
            <h1 class="pn-title">${this.t('title')}</h1>
            <p class="pn-sub">${this.t('subtitle')}</p>
          </div>
        </header>
        ${this.tabs()}
        ${keyed(
          this.tab,
          html`<div
            class="pn-body ${this.fading ? 'is-new' : ''}"
            id="pn-body"
            role="tabpanel"
            aria-labelledby="pn-tab-${this.tab}"
          >
            ${this.body(ctx)} ${this.side ? nothing : (preview ?? nothing)}
          </div>`,
        )}
        <div class="pn-dock">${foot}${notice}</div>
      </div>
      ${this.side && preview ? html`<aside class="pn-aside">${preview}</aside>` : nothing}
    </div>`;
  }
}
