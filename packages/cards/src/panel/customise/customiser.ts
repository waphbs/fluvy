// Customise's words first: they are here before anything in its chunk says them
import './english.js';
import { domainOf, type HomeAssistant, localize, plain, strings } from '@fluvy/core';
import {
  actions,
  type ActionItem,
  addGlyphs,
  badge,
  button,
  emptyState,
  glyph,
  head,
  icon,
  listRow,
  reducedMotion,
  round,
  toggle,
  type Tone,
} from '@fluvy/ui';
import { html, nothing, type TemplateResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';
import type { Card as CardClass } from '../../shared/base.js';
import { loadChartEngine } from '../../shared/chart-load.js';
import { COMMON_ALIASES, normaliseConfig } from '../../shared/config.js';
import { edited, editOf, hiddenBy, pinned, withOptions } from '../../strategy/edit.js';
import { generateWith } from '../../strategy/generate.js';
import type { Card, DashboardEdit, FluvyStrategyConfig, ListEdit } from '../../strategy/types.js';
import type { DashboardInfo, PanelContext } from '../model.js';
import { localizeCatalogue } from './catalogue.js';
import { choice } from '../sections.js';
import {
  alsoOf,
  leading,
  moved,
  optionsOf,
  patched,
  pinsFor,
  withAlso,
  withoutAlso,
  withoutOwn,
  withoutPart,
  withoutView,
  written,
} from './draft.js';
import {
  automatic,
  iconOf,
  itemCard,
  listKey,
  nameOf,
  outlineOf,
  portable,
  subjectOf,
  type PartOutline,
  type ViewOutline,
} from './outline.js';

const say = strings('customise');

/** Customise's own glyphs, in the set's hand: a row's handle (six dots), and a chevron against the bar of an end. */
addGlyphs({
  grip: '<g fill="currentColor" stroke="none"><circle cx="9.5" cy="6" r="1.4"/><circle cx="14.5" cy="6" r="1.4"/><circle cx="9.5" cy="12" r="1.4"/><circle cx="14.5" cy="12" r="1.4"/><circle cx="9.5" cy="18" r="1.4"/><circle cx="14.5" cy="18" r="1.4"/></g>',
  toTop: '<path d="M6 6h12"/><path d="m6 17 6-6 6 6"/>',
  toBottom: '<path d="M6 18h12"/><path d="m6 7 6 6 6-6"/>',
});

/** What the panel is to Customise: what draws it again, and how it is left. */
export interface CustomiseHost {
  requestUpdate(): void;
  /** Opens Customise on a dashboard (its url path); none closes it. */
  customise(urlPath: string): void;
}

/**
 * A dashboard as it was read, for the options it had and the house's registries as they were: its views, none yet
 * while it is read, none ever where it could not be.
 */
interface Outline {
  readonly options: string;
  readonly house: readonly unknown[];
  views?: readonly ViewOutline[];
  failed?: boolean;
}

/** A card of the preview: the element that draws it, kept while its config stays the same. */
interface Drawn {
  readonly key: string;
  readonly element: HTMLElement & { hass?: HomeAssistant };
}

/** A card's own form in the sheet: a part's options, or a card of the person's own (one being made, or one of the view's). */
interface FormSheet {
  readonly kind: 'form';
  readonly title: string;
  readonly icon: string;
  /** What the form is of, under its title. */
  sub(ctx: PanelContext): string;
  /** What stays of it, in a line over the form: said of a part's options alone. */
  hint?(ctx: PanelContext): string;
  /** The card the form opens on: what a change is told apart from. */
  readonly card: Card;
  /** The keys Customise edits itself, never the form. */
  readonly omit: ReadonlySet<string>;
  /** The card as the form holds it now, with what the person changed so far. */
  shown(): Card;
  /** Keeps what the form says (`said`: all but what the card does by itself); `read` is the card as its form reads it. */
  keep(said: Readonly<Record<string, unknown>>, read: Card): void;
  /** The buttons at the sheet's foot. */
  foot(ctx: PanelContext): TemplateResult;
  /**
   * A card being made is drawn over its form as it will be: the element that draws it, and what the card says of a
   * config it refuses ('' once it takes it).
   */
  drawing?: {
    readonly element: Drawn['element'] & { setConfig(config: Card): void };
    readonly refused: string;
  };
  /** The card's own form, once its editor has landed. */
  editor?: HTMLElement & { hass?: HomeAssistant; setConfig(config: Card): void };
  leaving: boolean;
}

/** The ways a card is added to a view: one of the dashboard's other views', one of Fluvy's, or YAML. */
const WAYS = ['dashboard', 'fluvy', 'yaml'] as const;
type Way = (typeof WAYS)[number];

/** A card being added to a view, in the sheet: the way chosen, and what was searched for, picked or written so far. */
interface AddSheet {
  readonly kind: 'add';
  readonly view: ViewOutline;
  way: Way;
  query: string;
  /** The parts of other views picked to be shown on this one, by their ids. */
  picked: readonly string[];
  /** The card being written as YAML. */
  yaml: unknown;
  leaving: boolean;
}

type Sheet = FormSheet | AddSheet;

/** What a card suggests for a house, as Home Assistant's card picker asks it: its type's keys, its first entities. */
type Stub = (
  hass: HomeAssistant | undefined,
  entities: readonly string[],
  fallback: readonly string[],
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/** How long a reset stays armed, a sheet takes to leave, and the preview waits for the edit to rest. */
const ARMED_MS = 4000;
const LEAVE_MS = 200;
const PREVIEW_MS = 160;
/** The sheet's width at most, as its style draws it: its rows of chips are fitted to it. */
const SHEET_WIDTH = 480;
/** The rows a view shows before it is searched: what a phone holds on one screen. */
const MANY = 8;

/** Whether what was typed is found in one of a row's words, read by their plain letters ("kuche" finds "Küche"). */
const found = (query: string, ...words: readonly string[]): boolean => {
  const asked = plain(query.trim());
  return !asked || words.some((word) => plain(word).includes(asked));
};

/** The part kinds the catalogue has a word for (`customise.kind.*`). */
const KINDS = [
  'thermostat',
  'weather',
  'clock',
  'flow',
  'curve',
  'media',
  'vacuum',
  'printer',
  'todo',
  'room',
  'floor',
  'back',
  'balance',
  'sources',
  'grid',
  'grid_gauge',
  'batteries',
  'charger',
  'day_flow',
  'sankey',
  'score',
  'day_balance',
  'gauges',
  'production',
  'tomorrow',
  'ahead',
  'history',
  'water',
  'period',
  'usage',
  'usage_water',
  'usage_gas',
  'map',
  'camera',
  'hello',
  'own',
] as const;
const isKind = (kind: string): kind is (typeof KINDS)[number] =>
  (KINDS as readonly string[]).includes(kind);

/** A card type as the card picker names it, without Fluvy's own mark ("Fluvy · Clock" → "Clock"). */
const typeName = (type: string): string => {
  const tag = type.replace(/^custom:/, '');
  const name = window.customCards?.find((card) => card.type === tag)?.name;
  return name ? name.replace(/^Fluvy\s·\s/, '') : tag;
};

/** Escape closes the sheet alone, whatever else listens for it on the window (Home Assistant's dialogs). */
const keepEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') event.stopPropagation();
};

/** A row's circle with its handle before it: six dots in the gutter, what a mouse or a finger drags the row by. */
const gripped = (ref: string | TemplateResult, tone: Tone = 'neutral'): TemplateResult =>
  html`<span class="cz-grip" aria-hidden="true">${icon('grip')}</span
    ><span class="fv-ico fv-ico--${tone}" data-icon
      >${typeof ref === 'string' ? icon(ref) : ref}</span
    >`;

/** What a list that stands still asks of Home Assistant's sorting: no row slides out of the way. */
const STILL = { animation: 0 };

/**
 * A list whose rows are dragged by their handles: Home Assistant's own sorting (`ha-sortable`, as the cards' editor
 * uses it), a mouse's or a finger's — the buttons are the keyboard's. `list` is the element that holds the rows
 * (`row`: their class; one that `is-fixed` stays where it is); `dropped` is told the place a row left and the one it
 * was dropped on. The rows between slide out of its way, or stand still where the page asks for less motion.
 */
const sortable = (
  row: 'cz-part' | 'cz-item',
  list: TemplateResult,
  dropped: (from: number, to: number) => void,
): TemplateResult =>
  html`<ha-sortable
    no-style
    handle-selector=".${row} > .fv-row > .cz-grip"
    draggable-selector=".${row}:not(.is-fixed)"
    .options=${reducedMotion() ? STILL : undefined}
    @item-moved=${(event: CustomEvent<{ oldIndex: number; newIndex: number }>) => {
      event.stopPropagation();
      dropped(event.detail.oldIndex, event.detail.newIndex);
    }}
    >${list}</ha-sortable
  >`;

/** The ways a row moves by the keyboard, as its first buttons stand: to the top, up, down, to the bottom. */
const MOVES = ['top', 'up', 'down', 'bottom'] as const;
type Move = (typeof MOVES)[number];
const isMove = (key: string): key is Move => (MOVES as readonly string[]).includes(key);
const MOVE_GLYPHS: Readonly<Record<Move, string>> = {
  top: 'toTop',
  up: 'up',
  down: 'down',
  bottom: 'toBottom',
};
/** The place a move takes a row to, from its place `at` among `count`. */
const placeOf = (move: Move, at: number, count: number): number =>
  move === 'top' ? 0 : move === 'up' ? at - 1 : move === 'down' ? at + 1 : count - 1;

/**
 * Customise (#170): an automatic dashboard's views and cards as rows — hidden, moved, tuned, their lists thinned out
 * and added to, cards of the person's own after them — every change an edit of the dashboard's `edit`, laid over what
 * is there and saved from the panel's bar with the rest. Since 1.21 (#188) a row is dragged to its place by its
 * handle or sent to an end by a button, a view of many cards is searched, and a card is added from a sheet: one of
 * the dashboard's other views', one of Fluvy's in its own form, or YAML. It keeps what it shows (the dashboard as it
 * was read, the open view, the open row, the armed reset, the sheet) and draws inside the panel, in its language.
 */
export class Customiser {
  private ctx: PanelContext | undefined;
  private urlPath = '';
  private readonly outlines = new Map<string, Outline>();
  private viewId = '';
  private openPart = '';
  private openItem = '';
  /** The tabs unfolded under the open view's place among them. */
  private openTabs = false;
  /** What the open view's rows are searched for. */
  private query = '';
  /** What a second tap would reset: a part's id, `view`, `all` ('' none). */
  private armed = '';
  private armTimer = 0;
  private sheet: Sheet | undefined;
  private leaveTimer = 0;
  /** The way a card was last added: the sheet opens on it again. */
  private way: Way = 'dashboard';
  /** Counts the entities added: the picker starts empty again after each. */
  private picked = 0;
  /** The open view's cards as the dashboard will draw them, and what they were drawn for. */
  private drawn: readonly Drawn[] | undefined;
  private drawnFor = '';
  private drawTimer = 0;
  /** The sheet's dialog while it is open: closed as a dialog is, so the focus goes back to what opened it. */
  private dialog: HTMLDialogElement | undefined;
  /** The button a move was made with (its row's id, an entity's where it is one's, and its place among the row's buttons): the focus goes back to it once the row has moved. */
  private moved: { readonly part: string; readonly item?: string; readonly at: number } | undefined;

  constructor(private readonly host: CustomiseHost) {}

  /** The panel is gone: nothing armed, nothing leaving. */
  dispose(): void {
    clearTimeout(this.armTimer);
    clearTimeout(this.leaveTimer);
    clearTimeout(this.drawTimer);
    this.sheet = undefined;
    this.drawn = undefined;
    this.drawnFor = '';
  }

  /**
   * After the panel has drawn: the sheet opens over the page, in the top layer; and a row that moved (the page moves
   * its node, which drops the focus) gives the focus back to the button that moved it, for the next press.
   */
  updated(root: ParentNode): void {
    const dialog = root.querySelector<HTMLDialogElement>('dialog.cz-dialog') ?? undefined;
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    this.dialog = dialog;
    const moved = this.moved;
    if (!moved) return;
    this.moved = undefined;
    const row = [...root.querySelectorAll<HTMLElement>('.cz-part')].find(
      (candidate) => candidate.dataset['part'] === moved.part,
    );
    const within = moved.item
      ? [...(row?.querySelectorAll<HTMLElement>('.cz-item') ?? [])].find(
          (candidate) => candidate.dataset['item'] === moved.item,
        )
      : row?.querySelector<HTMLElement>(':scope > .cz-detail > .cz-actions');
    // at an end the button that brought it there has nowhere left to go: the nearest move that still has takes it
    const buttons = [...(within?.querySelectorAll<HTMLButtonElement>('.fv-action') ?? [])];
    const near = [0, 1, -1, 2, -2, 3, -3].map((step) => buttons[moved.at + step]);
    near.find((button) => button && !button.disabled)?.focus();
  }

  /* ---------- the dashboard ---------- */

  private get edit(): DashboardEdit {
    return editOf(this.ctx?.strategyOf(this.urlPath)?.['edit']);
  }

  /** Keeps an edit as the dashboard's pending one: gone from its configuration once nothing is left of it. */
  private change(next: DashboardEdit): void {
    this.ctx?.editStrategy(this.urlPath, { edit: written(next) });
  }

  /**
   * The dashboard as the house draws it: read once for the options it has now, and again when they change or the
   * house gains or loses an entity, a device or a room.
   */
  private outline(ctx: PanelContext, dashboard: DashboardInfo): Outline {
    const strategy = ctx.strategyOf(dashboard.urlPath) ?? {};
    const options = JSON.stringify(automatic(strategy));
    const house = [ctx.hass.entities, ctx.hass.devices, ctx.hass.areas];
    const known = this.outlines.get(dashboard.urlPath);
    if (known?.options === options && known.house.every((registry, at) => registry === house[at]))
      return known;
    const outline: Outline = { options, house };
    this.outlines.set(dashboard.urlPath, outline);
    if (dashboard.template)
      void outlineOf(dashboard.template, strategy, ctx.hass, dashboard.urlPath)
        .then(
          (views) => (outline.views = views),
          () => (outline.failed = true),
        )
        .then(() => this.host.requestUpdate());
    return outline;
  }

  /**
   * A dashboard as Customise shows it: its tabs (as the house orders them, and as the person placed them), its
   * pages, and the open view — the one picked, else the first tab as they stand, else the first page.
   */
  private shown(ctx: PanelContext, dashboard: DashboardInfo) {
    const outline = this.outline(ctx, dashboard);
    const edit = editOf(ctx.strategyOf(dashboard.urlPath)?.['edit']);
    const tabs = (outline.views ?? []).filter((view) => view.tab);
    const pages = (outline.views ?? []).filter((view) => !view.tab);
    const placed = pinned(tabs, (view) => edit.views?.[view.id]?.order);
    const view =
      outline.views?.find((candidate) => candidate.id === this.viewId) ?? placed[0] ?? pages[0];
    return { outline, tabs, pages, placed, view };
  }

  /**
   * A view's parts as the dashboard's `edit` names them: the house's, then the person's own cards, then the parts
   * of the dashboard's other views (`views`) it shows as well, each as its own view builds it — one the dashboard no
   * longer has keeps its place among them and has no row.
   */
  private partsOf(
    view: ViewOutline,
    edit: DashboardEdit,
    views: readonly ViewOutline[],
  ): PartOutline[] {
    const own = edit.views?.[view.id]?.add;
    return [
      ...view.parts,
      // each by its place in the list, as the dashboard names it; what names no type is no card
      ...(Array.isArray(own) ? own : []).flatMap((card: unknown, index): PartOutline[] =>
        isCard(card)
          ? [
              {
                id: `${view.id}/own:${index}`,
                kind: 'own',
                cards: [card],
                off: false,
                card,
                list: undefined,
              },
            ]
          : [],
      ),
      ...alsoOf(edit, view.id).map((id): PartOutline => {
        const from = views.find((other) => other !== view && id.startsWith(`${other.id}/`));
        const part = from?.parts.find((other) => other.id === id);
        return {
          id: `${view.id}/also:${id}`,
          kind: 'also',
          cards: part?.cards ?? [],
          off: false,
          card: part?.card,
          list: undefined,
          ...(from && part ? { taken: { view: from, part } } : {}),
        };
      }),
    ];
  }

  /* ---------- what a tap does ---------- */

  private arm(what: string, act: () => void): void {
    clearTimeout(this.armTimer);
    if (this.armed === what) {
      this.armed = '';
      act();
    } else {
      this.armed = what;
      this.armTimer = window.setTimeout(() => {
        this.armed = '';
        this.host.requestUpdate();
      }, ARMED_MS);
    }
    this.host.requestUpdate();
  }

  private pick(view: string): void {
    this.viewId = view;
    this.openPart = '';
    this.openItem = '';
    this.query = '';
    this.host.requestUpdate();
  }

  private toggleOpen(part: string): void {
    this.openPart = this.openPart === part ? '' : part;
    this.openItem = '';
    this.host.requestUpdate();
  }

  /** Puts `ids` (the house's order) in the order asked for, with the fewest places: each entry's `order` set or gone. */
  private reorder(
    table: 'views' | 'cards',
    ids: readonly string[],
    asked: readonly string[],
  ): void {
    const pins = pinsFor(ids, asked);
    let next = this.edit;
    for (const id of ids)
      if (next[table]?.[id]?.order !== pins.get(id))
        next = patched(next, table, id, { order: pins.get(id) });
    this.change(next);
  }

  private editList(
    part: PartOutline,
    patch: Partial<Record<keyof ListEdit, readonly string[]>>,
  ): void {
    this.change(patched(this.edit, 'entities', part.id, patch));
  }

  /** Shows an entity of a list, or leaves it out: one the house gives is dropped, one the person added is taken back. */
  private toggleItem(part: PartOutline, item: string, on: boolean): void {
    const own = this.edit.entities?.[part.id];
    const without = (list: readonly string[] | undefined): string[] =>
      (list ?? []).filter((other) => other !== item);
    if (on) this.editList(part, { drop: without(own?.drop) });
    else if (part.list?.items.includes(item))
      this.editList(part, { drop: [...without(own?.drop), item], order: without(own?.order) });
    else this.editList(part, { add: without(own?.add), order: without(own?.order) });
  }

  private addItem(part: PartOutline, item: string): void {
    const own = this.edit.entities?.[part.id];
    this.picked++;
    if (own?.drop?.includes(item))
      this.editList(part, { drop: own.drop.filter((other) => other !== item) });
    else if (!part.list?.items.includes(item) && !own?.add?.includes(item))
      this.editList(part, { add: [...(own?.add ?? []), item] });
    else this.host.requestUpdate();
  }

  /* ---------- the sheet ---------- */

  /** Opens a sheet over the page; the one that was there gives way to it. */
  private open<S extends Sheet>(sheet: S): S {
    clearTimeout(this.leaveTimer);
    this.sheet = sheet;
    this.host.requestUpdate();
    return sheet;
  }

  /**
   * Opens a card's own form in the sheet: its editor, fetched as Home Assistant's dialog fetches it (a card of a
   * family may still be landing), without the fields Customise edits itself. What the form says is kept without the
   * keys put back to what the card does by itself: they say nothing the card did not.
   */
  private openForm(spec: Omit<FormSheet, 'kind' | 'leaving' | 'editor'>): FormSheet {
    const sheet = this.open<FormSheet>({ ...spec, kind: 'form', leaving: false });
    const { card, omit } = sheet;
    const tag = card.type.replace(/^custom:/, '');
    void customElements
      .whenDefined(tag)
      .then(async () => {
        const element = customElements.get(tag) as unknown as typeof CardClass;
        const [{ editorDefaults, listsEditor, withoutLists }, editor] = await Promise.all([
          import('../../shared/rows-editor.js'),
          element.editor(),
          loadChartEngine(),
        ]);
        if (this.sheet !== sheet) return;
        const form = editor.getConfigForm();
        const aliases = [...(element.aliases ? [element.aliases] : []), COMMON_ALIASES];
        const made = listsEditor(
          { ...form, schema: withoutLists(form.schema, omit) },
          (editor.lists ?? []).filter((list) => !omit.has(list.key)),
          editor.defaults,
          aliases,
          editor.choices,
        ) as NonNullable<FormSheet['editor']>;
        made.setConfig(sheet.shown());
        // the card as its form reads it (an older name the house wrote, under its newer one): what a change is told from
        const read = normaliseConfig(card, ...aliases) as Card;
        const defaults = editorDefaults(form, editor.defaults);
        made.addEventListener('config-changed', (event) => {
          event.stopPropagation();
          const { config } = (event as CustomEvent<{ config: Card }>).detail;
          const own = defaults?.(config, this.ctx?.hass) ?? {};
          sheet.keep(
            Object.fromEntries(
              Object.entries(config).filter(
                ([key, value]) => key in read || JSON.stringify(value) !== JSON.stringify(own[key]),
              ),
            ),
            read,
          );
        });
        sheet.editor = made;
        this.host.requestUpdate();
      })
      // an editor that cannot be fetched (the page outlived an update) leaves the sheet waiting: its buttons close it
      .catch(() => undefined);
    return sheet;
  }

  /** A part's options: its card's form, of which only what leaves the card the house builds is kept. */
  private openOptions(
    id: string,
    title: string,
    icon: string,
    generated: Card,
    omit: string[],
  ): void {
    const kept = new Set(omit);
    const sheet = this.openForm({
      title,
      icon,
      sub: (ctx) => say(ctx.hass, 'options'),
      hint: (ctx) => say(ctx.hass, 'options_hint'),
      card: generated,
      omit: kept,
      shown: () => withOptions(generated, this.edit.cards?.[id]?.options),
      keep: (said, read) =>
        this.change(
          patched(this.edit, 'cards', id, {
            // nothing changed, no options; else what leaves the generated card as the form holds it
            options: optionsOf(read, said, kept) && optionsOf(generated, said, kept),
          }),
        ),
      foot: (ctx) =>
        html`<div class="cz-pair" data-fill-row>
          ${button(
            ctx.t('about.reset_btn'),
            'quiet',
            () => {
              this.change(patched(this.edit, 'cards', id, { options: undefined }));
              sheet.editor?.setConfig(generated);
            },
            true,
            this.edit.cards?.[id]?.options === undefined,
          )}
          ${button(localize(ctx.hass, 'page.done'), 'accent', () => this.closeSheet(), true)}
        </div>`,
    });
  }

  /**
   * A card of Fluvy's being made for a view: its own form on what the card suggests for this house (its stub, as
   * Home Assistant's card picker asks for it), the card drawn over the form as it will be — the real one on the real
   * house, looked at and never touched — and added to the view's own once it takes what the form holds.
   */
  private async openNew(view: ViewOutline, tag: string): Promise<void> {
    const hass = this.ctx?.hass;
    const type = `custom:${tag}`;
    const entities = Object.keys(hass?.states ?? {});
    let stub: Record<string, unknown> | undefined;
    try {
      stub = await (
        customElements.get(tag) as { getStubConfig?: Stub } | undefined
      )?.getStubConfig?.(hass, entities, entities);
    } catch {
      // a card that fails to suggest anything opens on its type alone
    }
    let draft: Card = { ...stub, type };
    const element = document.createElement(tag) as NonNullable<FormSheet['drawing']>['element'];
    /** The card takes the draft, or says why not: until it does there is nothing to add. */
    const take = (): string => {
      try {
        element.setConfig(draft);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    const sheet = this.openForm({
      title: typeName(type),
      icon: 'plus',
      sub: (ctx) => say(ctx.hass, 'add_card'),
      card: draft,
      omit: new Set(),
      shown: () => draft,
      keep: (said) => {
        draft = { ...said, type };
        sheet.drawing = { element, refused: take() };
        this.host.requestUpdate();
      },
      foot: (ctx) =>
        html`<div class="cz-pair" data-fill-row>
          ${button(ctx.t('charts.cancel'), 'quiet', () => this.closeSheet(), true)}
          ${button(
            say(ctx.hass, 'add'),
            'accent',
            () => {
              const cards = [...(this.edit.views?.[view.id]?.add ?? []), draft];
              this.change(patched(this.edit, 'views', view.id, { add: cards }));
              this.closeSheet();
            },
            true,
            sheet.drawing?.refused !== '',
          )}
        </div>`,
    });
    sheet.drawing = { element, refused: take() };
  }

  /** One of the view's own cards that is Fluvy's, in its own form: what the form says is the card, as its YAML is. */
  private openOwn(view: ViewOutline, index: number, card: Card, icon: string): void {
    this.openForm({
      title: typeName(card.type),
      icon,
      sub: (ctx) => say(ctx.hass, 'kind.own'),
      card,
      omit: new Set(),
      shown: () => this.edit.views?.[view.id]?.add?.[index] ?? card,
      keep: (said) => {
        const cards = [...(this.edit.views?.[view.id]?.add ?? [])];
        cards[index] = { ...said, type: card.type };
        this.change(patched(this.edit, 'views', view.id, { add: cards }));
      },
      foot: (ctx) =>
        button(localize(ctx.hass, 'page.done'), 'accent', () => this.closeSheet(), true),
    });
  }

  private closeSheet(): void {
    const sheet = this.sheet;
    if (!sheet || sheet.leaving) return;
    sheet.leaving = true;
    this.leaveTimer = window.setTimeout(() => {
      // closed as a dialog closes: the focus goes back to the button that opened it
      if (this.dialog?.open) this.dialog.close();
      this.sheet = undefined;
      this.host.requestUpdate();
    }, LEAVE_MS);
    this.host.requestUpdate();
  }

  /** A card's form as the sheet holds it: the card being made over it where there is one, then the form, then its buttons. */
  private formSheet(ctx: PanelContext, sheet: FormSheet): TemplateResult {
    if (sheet.editor) sheet.editor.hass = ctx.hass;
    const { drawing } = sheet;
    if (drawing) drawing.element.hass = ctx.hass;
    return html`<div class="cz-sheet__body">
        ${sheet.hint ? html`<p class="pn-hint cz-sheet__hint">${sheet.hint(ctx)}</p>` : nothing}
        ${
          // the card is the dashboard's own, measured on its sheet: here it is only looked at
          drawing && !drawing.refused
            ? html`<div class="cz-preview cz-sheet__card" inert data-measure="skip">
                ${drawing.element}
              </div>`
            : nothing
        }
        ${
          // what the card says of a config it refuses, in its own words: there is nothing to add until it takes it
          drawing?.refused
            ? html`<p class="pn-hint cz-armed" role="status" data-name>${drawing.refused}</p>`
            : nothing
        }
        ${sheet.editor ?? html`<div class="cz-wait" aria-busy="true"></div>`}
      </div>
      ${sheet.foot(ctx)}`;
  }

  /** The house's bottom sheet over the page, in the top layer: a card's form, or the ways to add a card. */
  private sheetLayer(
    ctx: PanelContext,
    views: readonly ViewOutline[],
  ): TemplateResult | typeof nothing {
    const sheet = this.sheet;
    if (!sheet) return nothing;
    const adding = sheet.kind === 'add';
    const title = adding ? say(ctx.hass, 'add_card') : sheet.title;
    return html`<dialog
      class="cz-dialog ${sheet.leaving ? 'is-leaving' : ''}"
      aria-label=${title}
      @cancel=${(event: Event) => {
        event.preventDefault();
        this.closeSheet();
      }}
      @click=${(event: MouseEvent) => {
        if (event.target === event.currentTarget) this.closeSheet();
      }}
      @keydown=${keepEscape}
    >
      <div class="fv-sheet cz-sheet" data-card tabindex="-1" autofocus>
        <div class="fv-sheet__grabber"><span></span></div>
        ${head({
          icon: adding ? 'plus' : sheet.icon,
          title,
          sub: adding ? sheet.view.title : sheet.sub(ctx),
          name: !adding,
          trailing: round('close', 'bare', localize(ctx.hass, 'page.done'), () =>
            this.closeSheet(),
          ),
        })}
        ${adding ? this.addSheet(ctx, sheet, views) : this.formSheet(ctx, sheet)}
      </div>
    </dialog>`;
  }

  /* ---------- a card added ---------- */

  /**
   * A search field (the language's, its glyph leading, two pixels out as the field draws it): what is typed narrows
   * the rows under it, and never leaves the field — Home Assistant binds single-letter shortcuts on the window.
   */
  private search(ctx: PanelContext, query: string, typed: (query: string) => void): TemplateResult {
    const label = say(ctx.hass, 'search');
    return html`<label class="fv-field cz-search" data-align="optical"
      >${glyph('search')}<input
        class="fv-field__input"
        type="text"
        inputmode="search"
        enterkeyhint="search"
        autocomplete="off"
        spellcheck="false"
        placeholder=${label}
        aria-label=${label}
        .value=${query}
        @input=${(event: Event) => typed((event.target as HTMLInputElement).value)}
        @keydown=${(event: KeyboardEvent) => event.stopPropagation()}
    /></label>`;
  }

  /**
   * The ways to add a card to a view, as chips, and the chosen one under them: the cards of the dashboard's other
   * views to show here as well (picked by their switches, then shown here too or moved here), Fluvy's cards to make
   * one of in its own form, or a card's YAML.
   */
  private addSheet(
    ctx: PanelContext,
    sheet: AddSheet,
    views: readonly ViewOutline[],
  ): TemplateResult {
    const set = (patch: Partial<Pick<AddSheet, 'way' | 'query' | 'picked' | 'yaml'>>): void => {
      Object.assign(sheet, patch);
      this.host.requestUpdate();
    };
    // the chips are fitted to the sheet's own column, not to the panel's
    const fit = ctx.fit && { ...ctx.fit, width: Math.min(SHEET_WIDTH, window.innerWidth) - 32 };
    const ways = choice(
      { ...ctx, fit },
      WAYS.map((way) => ({
        key: way,
        label: way === 'yaml' ? 'YAML' : say(ctx.hass, `way_${way}`),
        active: sheet.way === way,
      })),
      (key) => {
        this.way = key as Way;
        set({ way: this.way, query: '' });
      },
    );
    const none = emptyState('search', say(ctx.hass, 'no_match'));
    if (sheet.way === 'dashboard') {
      const here = new Set(alsoOf(this.edit, sheet.view.id));
      const groups = views.flatMap((view) => {
        const rows =
          view === sheet.view
            ? []
            : view.parts.flatMap((part) => {
                // what a view has nothing for, its headings, and what is already shown here are not offered
                if (!portable(part) || here.has(part.id)) return [];
                const words = this.wordsOf(part, ctx);
                return found(sheet.query, view.title, words.title, words.kind)
                  ? [{ part, words }]
                  : [];
              });
        return rows.length ? [{ view, rows }] : [];
      });
      const bring = (move: boolean): void => {
        this.change(withAlso(this.edit, sheet.view.id, sheet.picked, move));
        this.closeSheet();
      };
      return html`${ways}
        <div class="cz-sheet__body">
          <p class="pn-hint cz-sheet__hint">${say(ctx.hass, 'way_dashboard_hint')}</p>
          ${this.search(ctx, sheet.query, (query) => set({ query }))}
          ${
            groups.length
              ? groups.map(
                  ({ view, rows }) =>
                    html`<p class="fv-label cz-label" data-name>${view.title}</p>
                      <div class="pn-rows">
                        ${repeat(
                          rows,
                          ({ part }) => part.id,
                          ({ part, words }) => {
                            const picked = sheet.picked.includes(part.id);
                            const pick = (on: boolean): void =>
                              set({
                                picked: on
                                  ? [...sheet.picked, part.id]
                                  : sheet.picked.filter((id) => id !== part.id),
                              });
                            return listRow({
                              icon: iconOf(part, ctx.hass),
                              tone: picked ? 'accent' : 'neutral',
                              title: words.title,
                              name: words.name,
                              ...(words.kind ? { sub: words.kind } : {}),
                              trailing: toggle(picked, 'accent', pick, words.title),
                              onTap: () => pick(!picked),
                            });
                          },
                        )}
                      </div>`,
                )
              : none
          }
        </div>
        <div class="cz-pair" data-fill-row>
          ${button(
            say(ctx.hass, 'move_here'),
            'quiet',
            () => bring(true),
            true,
            !sheet.picked.length,
          )}
          ${button(
            say(ctx.hass, 'show_too'),
            'accent',
            () => bring(false),
            true,
            !sheet.picked.length,
          )}
        </div>`;
    }
    if (sheet.way === 'fluvy') {
      // Fluvy's own cards as the card picker lists them, each once its element has landed
      const cards = (window.customCards ?? []).filter(
        (card) =>
          card.type.startsWith('fluvy-') &&
          customElements.get(card.type) &&
          found(sheet.query, card.name ?? '', card.description ?? ''),
      );
      return html`${ways}
        <div class="cz-sheet__body">
          ${this.search(ctx, sheet.query, (query) => set({ query }))}
          ${
            cards.length
              ? html`<div class="pn-rows">
                  ${repeat(
                    cards,
                    (card) => card.type,
                    (card) =>
                      listRow({
                        icon: null,
                        title: typeName(card.type),
                        ...(card.description ? { sub: card.description } : {}),
                        onTap: () => void this.openNew(sheet.view, card.type),
                      }),
                  )}
                </div>`
              : none
          }
        </div>`;
    }
    return html`${ways}
      <div class="cz-sheet__body">
        <p class="pn-hint cz-sheet__hint">${say(ctx.hass, 'add_card_hint')}</p>
        ${this.yaml(ctx, sheet.yaml, (value) => set({ yaml: value ?? { type: '' } }))}
      </div>
      <div class="cz-pair" data-fill-row>
        ${button(ctx.t('charts.cancel'), 'quiet', () => this.closeSheet(), true)}
        ${button(
          say(ctx.hass, 'add'),
          'accent',
          () => {
            const { yaml } = sheet;
            if (!isCard(yaml)) return;
            const cards = [...(this.edit.views?.[sheet.view.id]?.add ?? []), yaml];
            this.change(patched(this.edit, 'views', sheet.view.id, { add: cards }));
            this.closeSheet();
          },
          true,
          !isCard(sheet.yaml),
        )}
      </div>`;
  }

  /* ---------- the view as it will be drawn ---------- */

  /**
   * The open view's cards as the dashboard will draw them with what is pending, stacked as a phone stacks them: the
   * real cards on the real house, looked at and never touched (`inert`: a tap here switches nothing at home). Built
   * again a moment after the edit rests, each card kept while its config stays the same. Undefined until there is one.
   */
  preview(ctx: PanelContext, urlPath: string): TemplateResult | undefined {
    const dashboard = ctx.dashboards.find((candidate) => candidate.urlPath === urlPath);
    const strategy = ctx.strategyOf(urlPath);
    const view = dashboard && this.shown(ctx, dashboard).view?.id;
    if (!dashboard?.template || !strategy || !view) return undefined;
    const key = `${urlPath}|${view}|${JSON.stringify(strategy)}`;
    if (key !== this.drawnFor) {
      this.drawnFor = key;
      const { template } = dashboard;
      clearTimeout(this.drawTimer);
      this.drawTimer = window.setTimeout(
        () =>
          void generateWith(
            template,
            strategy as unknown as FluvyStrategyConfig,
            ctx.hass,
            `/${urlPath}`,
          ).then(
            ({ views }) => {
              if (this.drawnFor !== key) return;
              const cards =
                views
                  .find((candidate) => candidate.path === view)
                  ?.sections.flatMap((section) => section.cards) ?? [];
              const spare = [...(this.drawn ?? [])];
              this.drawn = cards.map((card) => this.draw(card, spare));
              this.host.requestUpdate();
            },
            // a dashboard that cannot be built keeps the view as it was last drawn
            () => undefined,
          ),
        this.drawn ? PREVIEW_MS : 0,
      );
    }
    if (!this.drawn) return undefined;
    for (const { element } of this.drawn) element.hass = ctx.hass;
    // the cards are the dashboard's own, measured on their sheets: the panel answers for the column they stand in
    return html`<div class="cz-preview" inert data-measure="skip">
      ${
        this.drawn.length
          ? repeat(
              this.drawn,
              (card) => card.element,
              (card) => card.element,
            )
          : emptyState('eye', say(ctx.hass, 'hidden'))
      }
    </div>`;
  }

  /**
   * A card's element: one of `spare` (the cards drawn before) that already draws this very config, taken out of
   * them, else a new one, configured once its tag is defined.
   */
  private draw(card: Card, spare: Drawn[]): Drawn {
    const key = JSON.stringify(card);
    const kept = spare.findIndex((drawn) => drawn.key === key);
    if (kept >= 0) return spare.splice(kept, 1)[0] as Drawn;
    const tag = card.type.startsWith('custom:') ? card.type.slice(7) : '';
    const element: Drawn['element'] = document.createElement(tag || 'div');
    // half a section wide (`grid_options.columns: 6`): two stand side by side
    element.toggleAttribute('data-half', card.grid_options?.columns === 6);
    if (tag)
      void customElements.whenDefined(tag).then(() => {
        try {
          (element as unknown as { setConfig(config: Card): void }).setConfig(card);
        } catch {
          // a config its card refuses draws nothing here: the dashboard says what is wrong with it
        }
      });
    else {
      // a card of Home Assistant's own is drawn by Home Assistant: here, its name where it will stand
      element.className = 'cz-preview__own';
      element.textContent = card.type;
    }
    return { key, element };
  }

  /* ---------- a part's row ---------- */

  /**
   * What a part's row says: its own name, and under it what it is where the name alone would not say. `name`: the
   * title is the house's own (an entity's, a room's, a floor's: a part with a key, or one named by what its card
   * draws), which may end in an ellipsis as names do; Fluvy's own words never do.
   */
  private wordsOf(
    part: PartOutline,
    ctx: PanelContext,
  ): { title: string; kind: string; name: boolean } {
    const { card, kind } = part;
    const word = isKind(kind) ? say(ctx.hass, `kind.${kind}`) : '';
    const text = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim() ? value : undefined;
    const subject = subjectOf(card);
    const own = part.list?.title ?? text(card?.['title']) ?? text(card?.['name']);
    const named = own ?? (subject ? nameOf(ctx.hass, subject) : undefined);
    if (kind === 'own') return { title: typeName(card?.type ?? ''), kind: word, name: true };
    return named
      ? { title: named, kind: word === named ? '' : word, name: !own || part.id.includes(':') }
      : { title: word || typeName(card?.type ?? ''), kind: '', name: false };
  }

  /**
   * A row of glyph buttons under an open row: equal whole-pixel cells, as many as it has buttons — or, in a column
   * that would leave them under a finger's 44 (six on a phone), two rows: its four moves, then the others.
   */
  private buttons(
    ctx: PanelContext,
    items: readonly ActionItem[],
    run: (key: string) => void,
  ): TemplateResult {
    const width = ctx.fit?.width ?? 0;
    const row = (cells: readonly ActionItem[]): TemplateResult =>
      html`<div class="cz-actions" style="--cz-cells:${cells.length}">${actions(cells, run)}</div>`;
    return width && (width - (items.length - 1) * 8) / items.length < 44
      ? html`${row(items.slice(0, MOVES.length))}${row(items.slice(MOVES.length))}`
      : row(items);
  }

  /** A row's four moves, from its place `at` among `count`: each still where it has nowhere to go. */
  private moves(ctx: PanelContext, at: number, count: number): ActionItem[] {
    return MOVES.map((key) => ({
      key,
      glyph: MOVE_GLYPHS[key],
      label: say(ctx.hass, key),
      disabled: key === 'top' || key === 'up' ? at <= 0 : at >= count - 1,
    }));
  }

  /** A part's row among the rows drawn (`seen`: their ids in order); `place` puts one of them on a place among them. */
  private partRow(
    ctx: PanelContext,
    view: ViewOutline,
    part: PartOutline,
    seen: readonly string[],
    place: (id: string, to: number) => void,
  ): TemplateResult {
    const edit = this.edit;
    const own = part.kind === 'own';
    const { taken } = part;
    // what the person put on the view (a card of their own, a part of another view) is taken away again, never
    // hidden nor reset; one taken from another view is named as it is there
    const added = own || part.kind === 'also';
    const said = taken?.part ?? part;
    const hidden = !added && hiddenBy(edit.cards?.[part.id], part.off);
    // one taken from another view is edited once it has options of its own here; its place alone is no edit of it
    const changed = added
      ? edit.cards?.[part.id]?.options !== undefined
      : Object.keys(edit.cards ?? {}).some(
          (id) => id === part.id || id.startsWith(`${part.id}:`),
        ) || edit.entities?.[part.id] !== undefined;
    const { title, kind, name } = this.wordsOf(said, ctx);
    const symbol = iconOf(said, ctx.hass);
    const list = part.list;
    const shown = list ? this.itemsOf(ctx, part) : [];
    // what it is, where it comes from, or how much of its list shows; before it, that it is hidden or that a person
    // changed it
    const sub = [
      hidden ? say(ctx.hass, 'hidden') : changed ? say(ctx.hass, 'edited') : '',
      taken
        ? say(ctx.hass, 'from_view', { view: taken.view.title })
        : !list
          ? kind
          : hidden
            ? ''
            : say(ctx.hass, 'shown', {
                shown: shown.length,
                // of the house's and what the person added
                count: new Set([...list.items, ...shown]).size,
              }),
    ]
      .filter(Boolean)
      .join(' · ');
    const open = this.openPart === part.id;
    const at = seen.indexOf(part.id);
    // the card its form opens on: one taken from another view as that view shows it, with its options there
    const card =
      taken && part.card ? withOptions(part.card, edit.cards?.[taken.part.id]?.options) : part.card;
    // a card's own form: the house's parts but a list no key of its card holds (the list is its own view's to
    // edit); of the person's own, Fluvy's cards
    const held = said.list;
    const tunes =
      card !== undefined &&
      (own
        ? /^custom:fluvy-/.test(card.type) && customElements.get(card.type.slice(7)) !== undefined
        : !held || listKey(card, held) !== undefined);
    const armed = this.armed === part.id;
    const items: ActionItem[] = [
      ...this.moves(ctx, at, seen.length),
      ...(tunes ? [{ key: 'options', glyph: 'sliders', label: say(ctx.hass, 'options') }] : []),
      ...(added
        ? [{ key: 'remove', glyph: 'trash', label: say(ctx.hass, 'remove') }]
        : [
            {
              key: 'reset',
              glyph: 'undo',
              label: ctx.t('about.reset_btn'),
              disabled: !changed,
              primary: armed,
            },
          ]),
    ];
    const run = (key: string): void => {
      if (isMove(key)) {
        this.moved = { part: part.id, at: MOVES.indexOf(key) };
        place(part.id, placeOf(key, at, seen.length));
      } else if (key === 'options' && card) {
        const key = listKey(card, held);
        if (own) this.openOwn(view, Number(part.id.split(':').pop()), card, symbol);
        else this.openOptions(part.id, title, symbol, card, key ? [key] : []);
      } else if (key === 'remove') {
        this.openPart = '';
        this.change(
          own
            ? withoutOwn(edit, view.id, Number(part.id.split(':').pop()))
            : withoutAlso(edit, view.id, said.id),
        );
      } else if (key === 'reset')
        this.arm(part.id, () => this.change(withoutPart(this.edit, part.id)));
    };
    return html`<div
      class="cz-part ${hidden ? 'is-off' : ''} ${changed && !hidden ? 'is-edited' : ''} ${open ? 'is-open' : ''}"
      data-part=${part.id}
    >
      ${listRow({
        icon: gripped(symbol, hidden ? 'neutral' : 'accent'),
        title,
        name,
        ...(sub ? { sub } : {}),
        trailing: added
          ? 'chevron'
          : html`<span class="cz-caret" aria-hidden="true">${glyph('chevron')}</span>${toggle(
                !hidden,
                'accent',
                (on) =>
                  this.change(
                    // a part that starts hidden keeps its being shown; any other its being hidden
                    patched(this.edit, 'cards', part.id, {
                      hidden: on === part.off ? !on : undefined,
                    }),
                  ),
                title,
              )}`,
        open,
        onTap: () => this.toggleOpen(part.id),
      })}
      ${
        open
          ? html`<div class="cz-detail">
              ${this.buttons(ctx, items, run)}
              ${
                armed
                  ? html`<p class="pn-hint cz-armed">
                      ${say(ctx.hass, 'reset_card')} · ${ctx.t('about.reset_cancels')}
                    </p>`
                  : nothing
              }
              ${own ? this.ownEditor(ctx, view, part) : nothing}
              ${list && !hidden ? this.listBlock(ctx, part, shown) : nothing}
            </div>`
          : nothing
      }
    </div>`;
  }

  /* ---------- a list's entities ---------- */

  /** A list's entities as the person left them, in their order: what its cards are made of. */
  private itemsOf(ctx: PanelContext, part: PartOutline, order = true): readonly string[] {
    const list = part.list;
    if (!list) return [];
    return edited(
      list.items,
      this.edit.entities?.[part.id],
      list.takes,
      (id) => ctx.hass.states[id] !== undefined,
      order,
    );
  }

  private listBlock(
    ctx: PanelContext,
    part: PartOutline,
    shown: readonly string[],
  ): TemplateResult {
    const list = part.list as NonNullable<PartOutline['list']>;
    // a list of devices (the appliances' bands) is thinned out and ordered; only entities are added
    const devices = list.items.some((item) => !item.includes('.'));
    const dropped = list.items.filter((item) => !shown.includes(item));
    /** Puts an entity on a place among those shown: the list names only what was put first. */
    const place = (item: string, to: number): void =>
      this.editList(part, {
        order: leading(this.itemsOf(ctx, part, false), moved(shown, shown, item, to)),
      });
    const row = (item: string, on: boolean): TemplateResult => {
      const name = nameOf(ctx.hass, item);
      const state = ctx.hass.states[item];
      const card = on ? itemCard(part, item) : undefined;
      const open = on && this.openItem === item;
      const at = shown.indexOf(item);
      // the entity's own icon as Home Assistant draws it, in the row's circle
      const drawn = state
        ? html`<ha-state-icon
            class="fv-haicon"
            .hass=${ctx.hass}
            .stateObj=${state}
          ></ha-state-icon>`
        : (list.icon ?? 'plug');
      // one left out waits at the list's foot, where nothing is dragged
      return html`<div
        class="cz-item ${on ? '' : 'is-off is-fixed'} ${open ? 'is-open' : ''}"
        data-item=${item}
      >
        ${listRow({
          compact: true,
          icon: on
            ? gripped(drawn)
            : html`<span class="fv-ico fv-ico--neutral" data-icon
                >${typeof drawn === 'string' ? icon(drawn) : drawn}</span
              >`,
          title: name,
          name: true,
          trailing: toggle(on, 'accent', (next) => this.toggleItem(part, item, next), name),
          ...(on
            ? {
                open,
                onTap: () => {
                  this.openItem = open ? '' : item;
                  this.host.requestUpdate();
                },
              }
            : {}),
        })}
        ${
          open
            ? this.buttons(
                ctx,
                [
                  ...this.moves(ctx, at, shown.length),
                  ...(card
                    ? [{ key: 'options', glyph: 'sliders', label: say(ctx.hass, 'options') }]
                    : []),
                ],
                (key) => {
                  if (isMove(key)) {
                    this.moved = { part: part.id, item, at: MOVES.indexOf(key) };
                    place(item, placeOf(key, at, shown.length));
                  } else if (card)
                    this.openOptions(`${part.id}:${item}`, name, iconOf(part, ctx.hass), card, [
                      'entity',
                      'area',
                      'device',
                    ]);
                },
              )
            : nothing
        }
      </div>`;
    };
    const taken = [...shown, ...dropped];
    return html`<p class="fv-label cz-label">${say(ctx.hass, devices ? 'devices' : 'entities')}</p>
      ${sortable(
        'cz-item',
        html`<div class="cz-items">
          ${repeat(
            taken,
            (item) => item,
            (item) => row(item, shown.includes(item)),
          )}
        </div>`,
        (from, to) => place(shown[from] as string, to),
      )}
      ${
        devices
          ? nothing
          : keyed(
              this.picked,
              html`<ha-selector
                class="cz-add"
                .hass=${ctx.hass}
                .label=${say(ctx.hass, 'add_entity')}
                .selector=${{
                  entity: {
                    exclude_entities: taken,
                    ...(list.takes.includes('*') ? {} : { filter: { domain: [...list.takes] } }),
                  },
                }}
                .value=${''}
                @value-changed=${(event: CustomEvent<{ value?: unknown }>) => {
                  event.stopPropagation();
                  const { value } = event.detail;
                  if (
                    typeof value === 'string' &&
                    value &&
                    (list.takes.includes('*') || list.takes.includes(domainOf(value)))
                  )
                    this.addItem(part, value);
                }}
              ></ha-selector>`,
            )
      }`;
  }

  /* ---------- the person's own cards ---------- */

  /** A card of the person's own as YAML, in Home Assistant's own editor. */
  private yaml(
    ctx: PanelContext,
    value: unknown,
    changed: (value: unknown) => void,
  ): TemplateResult {
    return html`<ha-selector
      class="cz-yaml"
      .hass=${ctx.hass}
      .selector=${{ object: {} }}
      .value=${value}
      @value-changed=${(event: CustomEvent<{ value?: unknown }>) => {
        event.stopPropagation();
        changed(event.detail.value);
      }}
    ></ha-selector>`;
  }

  private ownEditor(ctx: PanelContext, view: ViewOutline, part: PartOutline): TemplateResult {
    const index = Number(part.id.split(':').pop());
    return this.yaml(ctx, part.card, (value) => {
      if (!isCard(value)) return;
      const cards = [...(this.edit.views?.[view.id]?.add ?? [])];
      cards[index] = value;
      this.change(patched(this.edit, 'views', view.id, { add: cards }));
    });
  }

  /** What a person adds to a view, laid after its own: a row that opens the ways to add a card, in the sheet. */
  private ownBlock(ctx: PanelContext, view: ViewOutline): TemplateResult {
    return html`<p class="fv-label pn-label">${say(ctx.hass, 'own')}</p>
      <p class="pn-hint">${say(ctx.hass, 'own_hint')}</p>
      <div class="pn-rows">
        ${listRow({
          icon: 'plus',
          title: say(ctx.hass, 'add_card'),
          sub: say(ctx.hass, 'add_card_ways'),
          trailing: 'button',
          button: say(ctx.hass, 'add'),
          onTap: () =>
            this.open<AddSheet>({
              kind: 'add',
              view,
              way: this.way,
              query: '',
              picked: [],
              yaml: { type: '' },
              leaving: false,
            }),
        })}
      </div>`;
  }

  /* ---------- a view ---------- */

  /**
   * The dashboard's tabs as rows under the open view's place among them, in the person's order: each dragged to its
   * place by its handle, and shown or left out by its switch (the first the house draws always stays).
   */
  private tabsBlock(
    ctx: PanelContext,
    tabs: readonly ViewOutline[],
    first: ViewOutline | undefined,
    place: (id: string, to: number) => void,
  ): TemplateResult {
    const edit = this.edit;
    const row = (tab: ViewOutline): TemplateResult => {
      const hidden = tab !== first && edit.views?.[tab.id]?.hidden === true;
      return html`<div class="cz-item ${hidden ? 'is-off' : ''}" data-view=${tab.id}>
        ${listRow({
          compact: true,
          icon: gripped(tab.icon),
          title: tab.title,
          name: true,
          ...(tab === first
            ? { trailing: 'value' as const, value: ctx.t('dashboard.always'), quiet: true }
            : {
                trailing: toggle(
                  !hidden,
                  'accent',
                  (on) =>
                    this.change(
                      patched(this.edit, 'views', tab.id, { hidden: on ? undefined : true }),
                    ),
                  tab.title,
                ),
              }),
        })}
      </div>`;
    };
    return html`<p class="fv-label cz-label">${ctx.t('dashboard.views')}</p>
      ${sortable(
        'cz-item',
        html`<div class="cz-items">${repeat(tabs, (tab) => tab.id, row)}</div>`,
        (from, to) => place((tabs[from] as ViewOutline).id, to),
      )}`;
  }

  /** The open view's card: what it is, its place among the tabs (`views`: the dashboard's, its tabs first), and its parts as rows. */
  private viewCard(
    ctx: PanelContext,
    view: ViewOutline,
    views: readonly ViewOutline[],
  ): TemplateResult {
    const edit = this.edit;
    const tabs = views.filter((other) => other.tab);
    const [first] = tabs;
    const all = this.partsOf(view, edit, views);
    const ids = all.map((part) => part.id);
    const order = pinned(all, (part) => edit.cards?.[part.id]?.order).filter(
      (part) => part.cards.length,
    );
    const hidden = order.filter((part) => hiddenBy(edit.cards?.[part.id], part.off)).length;
    const own = edit.views?.[view.id];
    const changed =
      own !== undefined ||
      [...Object.keys(edit.cards ?? {}), ...Object.keys(edit.entities ?? {})].some((id) =>
        id.startsWith(`${view.id}/`),
      );
    const tabIds = tabs.map((tab) => tab.id);
    const lined = pinned(tabs, (tab) => edit.views?.[tab.id]?.order);
    const placed = lined.map((tab) => tab.id);
    const at = placed.indexOf(view.id);
    /** Puts a tab on a place among the tabs, with the fewest places kept. */
    const placeTab = (id: string, to: number): void =>
      this.reorder('views', tabIds, moved(placed, placed, id, to));
    /** A step of the open view's, from the row's own buttons: the row unfolds on a tap of its words alone. */
    const step = (by: 1 | -1) => (event: Event) => {
      event.stopPropagation();
      placeTab(view.id, at + by);
    };
    // a view of many cards is searched: what is typed narrows its rows to those whose words hold it, or the view
    // they come from. A row's buttons still move it among all the view's cards (found, it goes to the top in one
    // press); dragged, it is dropped among the rows drawn
    const searched = order.length > MANY;
    const rows = searched
      ? order.filter((part) => {
          const { title, kind } = this.wordsOf(part.taken?.part ?? part, ctx);
          return found(this.query, title, kind, part.taken?.view.title ?? '');
        })
      : order;
    const seen = order.map((part) => part.id);
    const drawn = rows.map((part) => part.id);
    /** Puts a part on a place among the view's cards (`among`: those a drop counts), with the fewest places kept. */
    const place = (id: string, to: number, among: readonly string[] = seen): void =>
      this.reorder(
        'cards',
        ids,
        moved(
          pinned(ids, (other) => edit.cards?.[other]?.order),
          among,
          id,
          to,
        ),
      );
    const armed = this.armed === 'view';
    return html`<section class="fv-card pn-card cz-view">
      ${head({
        icon: view.icon,
        title: view.title,
        sub: say(ctx.hass, 'shown', { shown: order.length - hidden, count: order.length }),
        name: true,
        trailing: changed ? badge(say(ctx.hass, 'edited')) : nothing,
      })}
      ${
        view.tab
          ? html`<div class="pn-rows">
              ${
                view === first
                  ? listRow({
                      icon: 'eye',
                      title: say(ctx.hass, 'show_view'),
                      trailing: 'value',
                      value: ctx.t('dashboard.always'),
                      quiet: true,
                    })
                  : listRow({
                      icon: 'eye',
                      title: say(ctx.hass, 'show_view'),
                      trailing: 'switch',
                      on: own?.hidden !== true,
                      onToggle: (on) =>
                        this.change(
                          patched(this.edit, 'views', view.id, { hidden: on ? undefined : true }),
                        ),
                    })
              }
              <div class="cz-place ${this.openTabs ? 'is-open' : ''}">
                ${listRow({
                  icon: 'updown',
                  title: say(ctx.hass, 'place'),
                  sub: say(ctx.hass, 'place_of', { place: at + 1, count: placed.length }),
                  trailing: html`<span class="cz-caret" aria-hidden="true">${glyph('chevron')}</span
                    ><span class="cz-steps"
                      >${round(
                        'chevronLeft',
                        'quiet',
                        say(ctx.hass, 'earlier'),
                        step(-1),
                        at <= 0,
                      )}${round(
                        'chevron',
                        'quiet',
                        say(ctx.hass, 'later'),
                        step(1),
                        at >= placed.length - 1,
                      )}</span
                    >`,
                  open: this.openTabs,
                  onTap: () => {
                    this.openTabs = !this.openTabs;
                    this.host.requestUpdate();
                  },
                })}
                ${
                  this.openTabs
                    ? html`<div class="cz-detail">
                        ${this.tabsBlock(ctx, lined, first, placeTab)}
                      </div>`
                    : nothing
                }
              </div>
            </div>`
          : nothing
      }
      <p class="fv-label pn-label">${ctx.t('dashboard.cards')}</p>
      ${
        searched
          ? this.search(ctx, this.query, (query) => {
              this.query = query;
              this.host.requestUpdate();
            })
          : nothing
      }
      ${sortable(
        'cz-part',
        html`<div class="cz-parts">
          ${
            // each row moves with its part: a button pressed again after a move still has the focus
            repeat(
              rows,
              (part) => part.id,
              (part) => this.partRow(ctx, view, part, seen, place),
            )
          }
        </div>`,
        (from, to) => place(drawn[from] as string, to, drawn),
      )}
      ${rows.length || !order.length ? nothing : emptyState('search', say(ctx.hass, 'no_match'))}
      ${this.ownBlock(ctx, view)}
      ${
        changed
          ? html`<div class="pn-rows pn-reset ${armed ? 'is-armed' : ''}">
              ${listRow({
                icon: 'undo',
                tone: armed ? 'warning' : 'neutral',
                title: armed ? ctx.t('dashboard.recreate_armed') : say(ctx.hass, 'reset_view'),
                sub: armed ? ctx.t('about.reset_cancels') : say(ctx.hass, 'reset_view_sub'),
                trailing: 'button',
                button: ctx.t('about.reset_btn'),
                onTap: () => this.arm('view', () => this.change(withoutView(this.edit, view.id))),
              })}
            </div>`
          : nothing
      }
    </section>`;
  }

  /* ---------- the section ---------- */

  /** Customise for a dashboard, by its url path: the dashboards and their views to pick from, then the open view. */
  render(ctx: PanelContext, urlPath: string): TemplateResult {
    this.ctx = ctx;
    // the card picker's names and descriptions in this dashboard's language, before anything lists them
    localizeCatalogue(ctx.hass);
    if (urlPath !== this.urlPath) {
      this.urlPath = urlPath;
      this.viewId = '';
      this.openPart = '';
      this.openItem = '';
      this.openTabs = false;
      this.query = '';
      this.sheet = undefined;
      this.drawn = undefined;
    }
    const dashboard = ctx.dashboards.find(
      (candidate) => candidate.urlPath === urlPath && candidate.template,
    );
    const close = round('close', 'bare', say(ctx.hass, 'close'), () => this.host.customise(''));
    // a link that names no dashboard of ours says so; one opened before the dashboards are listed waits for them
    if (!dashboard)
      return html`<section class="fv-card pn-card">
        ${head({ icon: 'sliders', title: say(ctx.hass, 'title'), trailing: close })}
        ${emptyState('grid', say(ctx.hass, ctx.dashboards.length ? 'failed' : 'loading'))}
      </section>`;
    const { outline, tabs, pages, placed, view } = this.shown(ctx, dashboard);
    // the view opened first stays the open one: a tab put before it never takes the rows from under the person
    if (view) this.viewId = view.id;
    const edit = this.edit;
    const chip = (candidate: ViewOutline) => ({
      key: candidate.id,
      label: candidate.title,
      active: candidate === view,
      name: true,
    });
    const armed = this.armed === 'all';
    return html`<section class="fv-card pn-card cz-top">
        ${head({
          icon: 'sliders',
          title: say(ctx.hass, 'title'),
          sub: dashboard.title,
          trailing: close,
        })}
        <p class="pn-hint cz-intro">${say(ctx.hass, 'intro')}</p>
        ${
          tabs.length
            ? html`<p class="fv-label pn-label">${ctx.t('dashboard.views')}</p>
                ${choice(ctx, placed.map(chip), (key) => this.pick(key))}`
            : nothing
        }
        ${
          pages.length
            ? html`<p class="fv-label pn-label">${say(ctx.hass, 'pages')}</p>
                ${choice(ctx, pages.map(chip), (key) => this.pick(key))}`
            : nothing
        }
      </section>
      ${
        view
          ? this.viewCard(ctx, view, outline.views ?? [])
          : html`<section class="fv-card pn-card">
              ${emptyState('grid', say(ctx.hass, outline.failed ? 'failed' : 'loading'))}
            </section>`
      }
      ${
        Object.keys(edit).length
          ? html`<section class="fv-card pn-card pn-rows pn-reset ${armed ? 'is-armed' : ''}">
              ${listRow({
                icon: 'auto',
                tone: armed ? 'warning' : 'neutral',
                title: armed ? ctx.t('dashboard.recreate_armed') : say(ctx.hass, 'reset_all'),
                sub: armed ? ctx.t('about.reset_cancels') : say(ctx.hass, 'reset_all_sub'),
                trailing: 'button',
                button: ctx.t('about.reset_btn'),
                onTap: () => this.arm('all', () => this.change({})),
              })}
            </section>`
          : nothing
      }
      ${this.sheetLayer(ctx, outline.views ?? [])}`;
  }
}

/** A card a dashboard can draw: a table that names its type. */
const isCard = (value: unknown): value is Card =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { type?: unknown }).type === 'string' &&
  (value as { type: string }).type.trim() !== '';
