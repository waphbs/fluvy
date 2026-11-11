import type { Card, Section, View } from './types.js';

/*
 * What a person changed on an automatic dashboard, kept as differences and never as a copy of what the house holds:
 * a card hidden or moved, an entity left out of one card, an entity added to one, an order inside one. Everything
 * the person did not touch stays automatic — a device added later arrives in the card that draws it, and none of the
 * person's own edits move — which a stored copy of the generated views could never do.
 */

/** One card's own changes: hidden, or where it stands among its section's cards. */
export interface CardEdit {
  readonly hidden?: boolean;
  /** Its place among its section's cards; cards without one follow in the template's order. */
  readonly order?: number;
}

/** One card's own changes to the entities it holds. */
export interface EntityEdit {
  /** Entities left out of this card (ids, as the dashboard writes them). */
  readonly drop?: readonly string[];
  /** Entities this card shows besides the ones it draws by itself. */
  readonly add?: readonly string[];
  /** The order of this card's entities: those named first, the rest in the template's order. */
  readonly order?: readonly string[];
}

/** Everything a person changed on one automatic dashboard (`edit` in its configuration). */
export interface DashboardEdit {
  readonly cards?: Readonly<Record<string, CardEdit>>;
  readonly entities?: Readonly<Record<string, EntityEdit>>;
}

/** An id that reads as an entity's (`light.kitchen`, `sensor.mppt_1`). */
const ENTITY = /^[a-z_]+\.[a-z0-9_]+$/;

/** The entity id one entry of a list card holds: a bare id, or a row/tile object with `entity`. */
const idOf = (item: unknown): string =>
  typeof item === 'string'
    ? item
    : String((item as { entity?: unknown } | null)?.entity ?? '');

/** The entity ids a card's configuration names, in the order it names them. */
export function entitiesOf(card: Card): string[] {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      if (ENTITY.test(value)) found.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (key === 'type' || key === 'icon' || key === 'title' || key === 'name') continue;
        walk(item);
      }
    }
  };
  for (const [key, value] of Object.entries(card)) {
    if (key === 'type' || key === 'fluvy_edit_id') continue;
    walk(value);
  }
  return found;
}

/**
 * A card's identity across generations: its view, its type, and what it is about — the area it draws, else its first
 * entity. Neither moves when a device is added elsewhere, so an edit stays on the card it was made on; a card of
 * neither (a house-wide band) is named by its place, which is the most it has.
 */
export function cardId(view: string, card: Card, index: number): string {
  const area = typeof card['area'] === 'string' ? (card['area'] as string) : '';
  const [first] = entitiesOf(card);
  return `${view}:${String(card.type)}:${area || first || `#${index}`}`;
}

/** The rank a person gave an entity: those they named first, then the rest in the template's order. */
function ranked(order: readonly string[] | undefined): (id: string, fallback: number) => number {
  const rank = new Map((order ?? []).map((id, index) => [id, index]));
  return (id, fallback) => rank.get(id) ?? (order?.length ?? 0) + fallback;
}

/** One of a card's entity lists, rewritten: dropped ones out, added ones in, in the person's order. */
function editedList(value: readonly unknown[], edit: EntityEdit): unknown[] {
  const drop = new Set(edit.drop ?? []);
  const rank = ranked(edit.order);
  const kept = value
    .map((item, index) => ({ item, id: idOf(item), index }))
    .filter(({ id }) => id !== '' && !drop.has(id))
    .map(({ item, id, index }) => ({ item, id, place: rank(id, index) }))
    .sort((left, right) => left.place - right.place)
    .map(({ item }) => item);
  const known = new Set(kept.map(idOf));
  const shape = value[0];
  for (const id of edit.add ?? []) {
    if (drop.has(id) || known.has(id)) continue;
    kept.push(typeof shape === 'string' || shape === undefined ? id : { entity: id });
    known.add(id);
  }
  return kept;
}

/** A card with its entities as the person left them. */
function editedCard(card: Card, edit: EntityEdit): Card {
  const next: Record<string, unknown> = { ...card };
  for (const key of ['entities', 'rows', 'tiles'] as const) {
    const value = card[key];
    if (Array.isArray(value)) next[key] = editedList(value, edit);
  }
  return next as Card;
}

/**
 * A view's sections with the person's changes on top: cards hidden, each card's entities as its edit says, and the
 * order a person set standing first among the cards of a section (a card they never moved keeps the template's
 * place, after theirs). A card that draws one entity is that entity: leaving it out takes the card away, and taking
 * the rule back brings it in again.
 */
export function applyEdit(
  edit: DashboardEdit | undefined,
  view: string,
  sections: readonly Section[],
): Section[] {
  if (!edit) return sections.map((section) => ({ ...section, cards: [...section.cards] }));
  const cards = edit.cards ?? {};
  const entityEdits = edit.entities ?? {};
  let index = 0;
  const drawn: { section: Section; place: number; position: number }[] = [];
  sections.forEach((section, position) => {
    const kept: { card: Card; id: string; place: number; position: number }[] = [];
    section.cards.forEach((card) => {
      const id = cardId(view, card, index++);
      const change = cards[id];
      if (change?.hidden) return;
      const entities = entityEdits[id];
      if (entities?.drop && isSingle(card) && entities.drop.includes(String(card['entity']))) return;
      const drawn = entities ? editedCard(card, entities) : card;
      kept.push({
        card: { ...drawn, fluvy_edit_id: id } as Card,
        id,
        place: change?.order ?? Number.POSITIVE_INFINITY,
        position: kept.length,
      });
    });
    kept.sort((left, right) =>
      left.place === right.place ? left.position - right.position : left.place - right.place,
    );
    drawn.push({
      section: { ...section, cards: kept.map(({ card }) => card) },
      // a row the person put a card of stands where they put it; rows they never touched keep the template's order
      place: Math.min(...kept.map(({ place }) => place)),
      position,
    });
  });
  drawn.sort((left, right) =>
    left.place === right.place ? left.position - right.position : left.place - right.place,
  );
  return drawn.map(({ section }) => section);
}

/** A card that draws one entity (no list of its own): leaving that entity out leaves the card out. */
export function isSingle(card: Card): boolean {
  return (
    typeof card['entity'] === 'string' &&
    !Array.isArray(card['entities']) &&
    !Array.isArray(card['rows']) &&
    !Array.isArray(card['tiles'])
  );
}

/** The cards of a view, each with the id the panel's rows and the configuration's edits name it by. */
export function viewCards(view: View): { id: string; card: Card }[] {
  const out: { id: string; card: Card }[] = [];
  let index = 0;
  for (const section of view.sections) {
    for (const card of section.cards) out.push({ id: cardId(view.path, card, index++), card });
  }
  return out;
}
