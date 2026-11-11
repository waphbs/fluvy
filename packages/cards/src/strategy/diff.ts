/**
 * What a person changed in an editable copy, read back as the difference the automatic dashboard carries.
 *
 * The copy is a plain dashboard: cards moved, left out or given other entities, in Home Assistant's own editor. The
 * automatic dashboard cannot take that drawing as it is (it draws itself every time), but it can take the
 * difference: a card that is gone is left out, the order and the entities it holds are recorded. Everything the copy
 * cannot express here (a new card, a changed style, a renamed title) stays in the copy, and the notes say so.
 */
import { type CardEdit, type DashboardEdit, type EntityEdit, entitiesOf, viewCards } from './edit.js';
import type { Card, View } from './types.js';

/** A card's identity across the two drawings: the room it draws, else the entity it shows, else its type. */
function identity(card: Card): string {
  const area = (card as { area?: unknown }).area;
  if (typeof area === 'string' && area) return `area:${area}`;
  const [first] = entitiesOf(card);
  if (first) return `entity:${first}`;
  const title = (card as { title?: unknown }).title;
  return `type:${String(card.type)}${typeof title === 'string' && title ? `:${title}` : ''}`;
}

/** Every card of a view in reading order. */
function flatten(view: View): Card[] {
  return view.sections.flatMap((section) => section.cards);
}

export interface CopyDiff {
  readonly edit: DashboardEdit;
  /** What the copy holds that the automatic dashboard cannot take: new cards, changed styles, renamed views. */
  readonly notes: readonly string[];
}

/** The difference between what a dashboard draws now and what a person left in its copy. */
export function editFromCopy(copied: readonly View[], drawn: readonly View[]): CopyDiff {
  const cards: Record<string, CardEdit> = {};
  const entities: Record<string, EntityEdit> = {};
  const notes: string[] = [];
  let hidden = 0;
  let extra = 0;

  for (const view of drawn) {
    const copyView = copied.find((entry) => entry.path === view.path);
    const rows = viewCards(view);
    if (!copyView) {
      for (const row of rows) cards[row.id] = { ...(cards[row.id] ?? {}), hidden: true };
      hidden += rows.length;
      notes.push(view.path);
      continue;
    }
    const theirs = flatten(copyView);
    const taken = new Set<number>();
    const matched: { id: string; card: Card; at: number }[] = [];
    for (const row of rows) {
      const key = identity(row.card);
      const at = theirs.findIndex((card, index) => !taken.has(index) && identity(card) === key);
      if (at < 0) {
        cards[row.id] = { ...(cards[row.id] ?? {}), hidden: true };
        hidden += 1;
        continue;
      }
      taken.add(at);
      matched.push({ id: row.id, card: row.card, at });
      const mine = entitiesOf(row.card);
      const paired = theirs[at];
      const yours = paired ? entitiesOf(paired) : mine;
      const drop = mine.filter((id) => !yours.includes(id));
      const add = yours.filter((id) => !mine.includes(id));
      const ordered = yours.length && yours.join(' ') !== mine.join(' ') ? yours : undefined;
      if (drop.length || add.length || ordered) {
        entities[row.id] = {
          ...(drop.length ? { drop } : {}),
          ...(add.length ? { add } : {}),
          ...(ordered ? { order: ordered } : {}),
        };
      }
    }
    extra += theirs.filter((_, index) => !taken.has(index)).length;
    // the order the copy shows: a card that moved gets its place, and the cards that kept theirs stay unnamed
    const sequence = [...matched].sort((a, b) => a.at - b.at).map((row) => row.id);
    const current = matched.map((row) => row.id);
    if (sequence.join(' ') !== current.join(' '))
      sequence.forEach((id, order) => (cards[id] = { ...(cards[id] ?? {}), order }));
  }

  for (const view of copied) if (!drawn.some((entry) => entry.path === view.path)) notes.push(view.path);
  if (extra) notes.push(`+${extra}`);
  if (hidden) notes.push(`-${hidden}`);

  const empty = !Object.keys(cards).length && !Object.keys(entities).length;
  return {
    edit: empty ? {} : { ...(Object.keys(cards).length ? { cards } : {}), ...(Object.keys(entities).length ? { entities } : {}) },
    notes,
  };
}
