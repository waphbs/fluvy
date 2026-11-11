import { html, nothing, type TemplateResult } from 'lit';
import { listRow, toggle } from '@fluvy/ui';
import type { DashboardInfo, PanelContext } from './model.js';
import {
  type CardEdit,
  type DashboardEdit,
  type EntityEdit,
  entitiesOf,
  viewCards,
} from '../strategy/edit.js';
import type { Card, View } from '../strategy/types.js';

/** A value that is an object with keys (a strategy's `edit`, a card's own change). */
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** An entity's name in this house (its own, else its id). */
const nameOf = (ctx: PanelContext, id: string): string =>
  String(ctx.hass.states[id]?.attributes?.friendly_name ?? id);

/** A card's words for a row: the room it draws, its title, its name, else what it shows. */
function cardTitle(ctx: PanelContext, card: Card): string {
  const area = (card as { area?: unknown }).area;
  if (typeof area === 'string' && area) {
    // a room's card is named after the room, not after the card: the area's own name is what a person reads there
    const name = ctx.hass.areas?.[area]?.name;
    if (name) return String(name);
  }
  for (const key of ['title', 'name'] as const) {
    const value = card[key];
    if (typeof value === 'string' && value) return value;
  }
  const [first] = entitiesOf(card);
  if (first) return nameOf(ctx, first);
  return String(card.type)
    .replace(/^custom:fluvy-/, '')
    .replace(/-card$/, '');
}

/** The line under a card's name: how many entities it holds, or the room it draws. */
function cardSub(ctx: PanelContext, card: Card): string {
  const area = (card as { area?: unknown }).area;
  if (typeof area === 'string' && area) return ctx.t('dashboard.edit_area');
  return ctx.t('dashboard.edit_entities', { n: entitiesOf(card).length });
}

/**
 * A card's own change with a field set or cleared (`null` clears it): the card goes back to the template's word when
 * nothing is left of it.
 */
function cardChange(
  change: CardEdit | undefined,
  patch: { hidden?: boolean | null; order?: number | null },
): CardEdit | undefined {
  const hidden = patch.hidden === null ? undefined : (patch.hidden ?? change?.hidden);
  const order = patch.order === null ? undefined : (patch.order ?? change?.order);
  const next: { hidden?: boolean; order?: number } = {};
  if (hidden !== undefined) next.hidden = hidden;
  if (order !== undefined) next.order = order;
  return Object.keys(next).length ? (next as CardEdit) : undefined;
}

/** A card's entity change, gone when nothing is left. */
function entityChange(change: EntityEdit | undefined): EntityEdit | undefined {
  const kept: EntityEdit = {
    ...(change?.drop?.length ? { drop: change.drop } : {}),
    ...(change?.add?.length ? { add: change.add } : {}),
    ...(change?.order?.length ? { order: change.order } : {}),
  };
  return Object.keys(kept).length ? kept : undefined;
}

/** The rows of one card's entities: those it shows, then those the person left out (off, to take back). */
function entityRows(
  ctx: PanelContext,
  card: Card,
  edit: EntityEdit | undefined,
  write: (next: EntityEdit | undefined) => void,
): TemplateResult | typeof nothing {
  const list = entitiesOf(card);
  const drop = edit?.drop ?? [];
  const add = edit?.add ?? [];
  const extra = [...add, ...drop].filter((entity) => !list.includes(entity));
  if (!list.length && !extra.length) return nothing;
  const at = (entity: string, on: boolean): void => {
    const kept: EntityEdit = {
      drop: on ? drop.filter((other) => other !== entity) : [...new Set([...drop, entity])],
      add: on ? add : add.filter((other) => other !== entity),
      ...(edit?.order?.length ? { order: edit.order } : {}),
    };
    write(entityChange(kept));
  };
  return html`<div class="pn-rows pn-edit-sub">
    ${[...list, ...extra].map((entity) =>
      listRow({
        icon: null,
        title: nameOf(ctx, entity),
        sub: entity,
        compact: true,
        trailing: 'switch',
        on: !drop.includes(entity),
        readonly: !ctx.admin,
        onToggle: (on) => at(entity, on),
      }),
    )}
  </div>`;
}

/** One card's row: a switch that leaves it out, its place, and (under it) the entities it holds. */
function cardRows(
  ctx: PanelContext,
  id: string,
  card: Card,
  siblings: readonly string[],
  edit: DashboardEdit,
  write: (next: DashboardEdit) => void,
): TemplateResult {
  const cards = edit.cards ?? {};
  const entities = edit.entities ?? {};
  const change = cards[id];
  const title = cardTitle(ctx, card);
  const place = (other: string): number => cards[other]?.order ?? -1;
  const move = (delta: number): void => {
    const here = siblings.indexOf(id);
    const target = here + delta;
    if (here < 0 || target < 0 || target >= siblings.length) return;
    const other = siblings[target] ?? '';
    const kept = { ...cards };
    const mine = cardChange(change, { order: place(other) < 0 ? null : place(other) });
    const theirs = cardChange(cards[other], { order: place(id) < 0 ? null : place(id) });
    const without = (keys: readonly string[]): Record<string, CardEdit> => {
      const rest: Record<string, CardEdit> = { ...kept };
      for (const key of keys) delete rest[key];
      return rest;
    };
    const next = without([id, other]);
    if (mine) next[id] = mine;
    if (theirs) next[other] = theirs;
    write({ ...edit, cards: next });
  };
  const leave = (on: boolean): void => {
    const kept = { ...cards };
    const next = cardChange(change, { hidden: on ? null : true });
    if (next) kept[id] = next;
    else delete kept[id];
    write({ ...edit, cards: kept });
  };
  const setEntities = (next: EntityEdit | undefined): void => {
    const kept: Record<string, EntityEdit> = { ...entities };
    const rest: Record<string, EntityEdit> = {};
    for (const [key, value] of Object.entries(kept)) if (key !== id) rest[key] = value;
    if (next) rest[id] = next;
    write({ ...edit, entities: rest });
  };
  return html`${listRow({
    icon: 'grid',
    title,
    sub: cardSub(ctx, card),
    trailing: html`<span class="pn-tools"
      >${toggle(!change?.hidden, 'accent', leave, title, !ctx.admin)}<button
        class="pn-mini"
        aria-label=${ctx.t('dashboard.edit_up')}
        ?disabled=${!ctx.admin}
        @click=${() => move(-1)}
      >
        ↑</button
      ><button class="pn-mini" aria-label=${ctx.t('dashboard.edit_down')} ?disabled=${!ctx.admin} @click=${() => move(1)}
        >↓</button
      ></span
    >`,
  })}${change?.hidden ? nothing : entityRows(ctx, card, entities[id], setEntities)}`;
}

/** One view's fold: its cards, each with its entities under it. */
function viewRows(
  ctx: PanelContext,
  view: View,
  edit: DashboardEdit,
  write: (next: DashboardEdit) => void,
): TemplateResult {
  const ids = new Map<Card, string>();
  for (const entry of viewCards(view)) ids.set(entry.card, entry.id);
  const rows = view.sections.flatMap((section) => {
    const siblings = section.cards.map((card) => ids.get(card) ?? '');
    return section.cards.map((card, index) =>
      cardRows(ctx, siblings[index] ?? '', card, siblings, edit, write),
    );
  });
  const drawn = view.sections.reduce((sum, section) => sum + section.cards.length, 0);
  return html`<details class="pn-fold"
    ><summary class="pn-note">${view.title} · ${ctx.t('dashboard.edit_cards', { n: drawn })}</summary>
    <div class="pn-rows">${rows}</div>
  </details>`;
}

/** Everything a person changed, each with the way back. */
function rulesRows(
  ctx: PanelContext,
  edit: DashboardEdit,
  label: (cardId: string) => string,
  write: (next: DashboardEdit) => void,
): TemplateResult | typeof nothing {
  const cards = edit.cards ?? {};
  const entities = edit.entities ?? {};
  const rows: TemplateResult[] = [
    ...Object.entries(cards)
      .filter(([, change]) => change.hidden)
      .map(([id, change]) =>
        listRow({
          icon: 'eye',
          title: label(id),
          sub: ctx.t('dashboard.edit_hidden'),
          trailing: 'button',
          button: ctx.t('dashboard.edit_restore'),
          onTap: () => {
            const next = cardChange(change, { hidden: null });
            const kept: Record<string, CardEdit> = {};
            for (const [key, value] of Object.entries(cards)) if (key !== id) kept[key] = value;
            if (next) kept[id] = next;
            write({ ...edit, cards: kept });
          },
        }),
      ),
    ...Object.entries(entities).flatMap(([id, change]) =>
      [...(change.drop ?? []), ...(change.add ?? [])].map((entity) =>
        listRow({
          icon: (change.drop ?? []).includes(entity) ? 'minus' : 'plus',
          title: nameOf(ctx, entity),
          sub: `${label(id)} · ${
            (change.drop ?? []).includes(entity)
              ? ctx.t('dashboard.edit_dropped')
              : ctx.t('dashboard.edit_added')
          }`,
          trailing: 'button',
          button: ctx.t('dashboard.edit_restore'),
          onTap: () => {
            const next = entityChange({
              ...change,
              drop: (change.drop ?? []).filter((other) => other !== entity),
              add: (change.add ?? []).filter((other) => other !== entity),
            });
            const kept: Record<string, EntityEdit> = {};
            for (const [key, value] of Object.entries(entities)) if (key !== id) kept[key] = value;
            if (next) kept[id] = next;
            write({ ...edit, entities: kept });
          },
        }),
      ),
    ),
  ];
  if (!rows.length) return nothing;
  return html`<p class="fv-label pn-label">${ctx.t('dashboard.edit_changed')}</p>
    <div class="pn-rows pn-scroll" style="max-block-size: 260px">${rows}</div>`;
}

/**
 * What the dashboard draws by itself, and the way to change it: every card the strategy generates with a switch
 * that leaves it out and its place, each card's entities under it, and the way back for everything left out. The
 * rows are the template's own, generated now (with no edits on top), so a device that arrives later shows up here
 * without any of the person's changes moving.
 */
export function editRows(
  ctx: PanelContext,
  dashboard: DashboardInfo,
  strategy: Readonly<Record<string, unknown>>,
): TemplateResult | typeof nothing {
  if (!dashboard.template) return nothing;
  const edit: DashboardEdit = record(strategy['edit']) ? (strategy['edit'] as DashboardEdit) : {};
  const preview = ctx.previewOf(dashboard.urlPath);
  const label = (id: string): string => {
    for (const view of preview ?? []) {
      for (const entry of viewCards(view)) if (entry.id === id) return cardTitle(ctx, entry.card);
    }
    return id;
  };
  const write = (next: DashboardEdit): void => {
    const empty = !Object.keys(next.cards ?? {}).length && !Object.keys(next.entities ?? {}).length;
    ctx.editStrategy(dashboard.urlPath, { edit: empty ? undefined : next });
  };
  return html`<p class="fv-label pn-label">${ctx.t('dashboard.edit_title')}</p>
    <p class="fv-text pn-hint">${ctx.t('dashboard.edit_hint')}</p>
    ${
      preview
        ? html`${rulesRows(ctx, edit, label, write)}${preview.map((view) => viewRows(ctx, view, edit, write))}`
        : html`<div class="pn-rows">
            ${listRow({
              icon: 'sliders',
              title: ctx.t('dashboard.edit_load'),
              sub: ctx.t('dashboard.edit_load_sub'),
              trailing: 'chevron',
              onTap: () => ctx.loadPreview(dashboard.urlPath),
            })}
            ${rulesRows(ctx, edit, label, write)}
          </div>`
    }`;
}
