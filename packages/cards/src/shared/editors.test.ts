// @vitest-environment happy-dom
import type { HaFormSchemaItem, LovelaceCardConfig } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, catalogue } from '../index.js';
import type { Card, CardEditor } from './base.js';
import { COMMON_ALIASES } from './config.js';
import { visibleFields } from './form.js';
import { editorDefaults, FluvyRowsEditor, itemHelpers, itemLabels } from './rows-editor.js';

/**
 * The editors' contract (see `Card` in base.ts), held for every card of the catalogue: the editor is the base's,
 * built from the card's form, lists and defaults; the form never shows a list twice, nor an older name; a default
 * is for a field the editor shows; and, for a card under contract, what the form and the lists show is exactly
 * `base ∪ keys`, and every field it shows has a word. A card not yet under contract would be named here, so a
 * card cannot lose its keys unnoticed and the list can only shrink: every card is under it, and the set is empty.
 * Each card's editor is read as the base reads it (`editor()`): its class's, or the module of a card every page
 * carries.
 */
const PENDING = new Set<string>();

type CardClass = typeof Card & {
  getStubConfig?(hass: unknown, entities: readonly string[]): LovelaceCardConfig;
};

/**
 * Every field a schema shows, through its grids — whatever its `when`: a field the editor hides while it cannot act
 * is held to the contract as any other.
 */
const fields = (schema: readonly HaFormSchemaItem[]): HaFormSchemaItem[] =>
  schema.flatMap((item) => (item.schema ? fields(item.schema) : item.name ? [item] : []));
/** The fields the editor may hide: those with a `when` of their own, or in a row with one. */
const hideable = (schema: readonly HaFormSchemaItem[], hiding = false): HaFormSchemaItem[] =>
  schema.flatMap((item) => {
    const hides = hiding || item.when !== undefined;
    return item.schema ? hideable(item.schema, hides) : hides && item.name ? [item] : [];
  });
/** Whether a schema says when anything in it shows. */
const conditional = (schema: readonly HaFormSchemaItem[]): boolean =>
  schema.some((item) => item.when !== undefined || conditional(item.schema ?? []));
/** Every field name a schema shows, through its grids. */
const names = (schema: readonly HaFormSchemaItem[]): string[] =>
  fields(schema).map((item) => item.name);
/**
 * Whether a field shows what the card does when the config says nothing: every switch and every choice — but a tone
 * left empty, which is the card's own, and several chosen of a list, which, empty, are all the entity has.
 */
const showsDefault = (field: HaFormSchemaItem): boolean => {
  const selector = field.selector as Record<string, { multiple?: boolean }> | undefined;
  const choice = selector?.['boolean'] !== undefined || selector?.['select'] !== undefined;
  return choice && field.name !== 'tone' && selector?.['select']?.multiple !== true;
};
/** A label that is a word: not the field's own name, not a catalogue key handed back for a word that is missing. */
const isWord = (label: string | undefined, name: string): boolean =>
  typeof label === 'string' &&
  /\S/.test(label) &&
  label !== name &&
  !/^[a-z_-]+(\.[a-z_-]+)+$/.test(label);

const cards = await Promise.all(
  (await catalogue()).map(async ([tag, element]) => {
    const card = element as unknown as CardClass;
    const editor: CardEditor = await card.editor();
    return { tag, card, editor, lists: editor.lists ?? [] };
  }),
);

/** The cards whose names are templates (`{{ … }}`) of the person's own: words, never Home Assistant's parts. */
const TEMPLATED = new Set(['fluvy-template-card', 'fluvy-chips-card']);

/** The parts of an editor a class may declare: none on a card that keeps its editor in a module. */
const PARTS = ['base', 'keys', 'lists', 'defaults', 'choices', 'getConfigForm'] as const;

describe('the editors’ contract', () => {
  it('names each card of the catalogue once, and pending ones that exist', () => {
    expect(new Set(cards.map((c) => c.tag)).size).toBe(cards.length);
    for (const tag of PENDING)
      expect(
        cards.some((c) => c.tag === tag),
        tag,
      ).toBe(true);
  });

  it('keeps the editor of a card every page carries out of its class, in a module of its own', () => {
    for (const [tag, element] of CATALOGUE) {
      const card = element as unknown as CardClass;
      expect(Object.hasOwn(card, 'editor'), `${tag}: no editor() of its own`).toBe(true);
      for (const part of PARTS) expect(Object.hasOwn(card, part), `${tag}.${part}`).toBe(false);
    }
  });

  it.each(cards)(
    '$tag: says its editor itself, never one of the card it is built on',
    ({ card }) => {
      // the class's own, or its own module's: a card built on another (the template card on the tile's) says which
      expect(Object.hasOwn(card, 'editor') || Object.hasOwn(card, 'getConfigForm')).toBe(true);
      if (Object.hasOwn(card, 'editor'))
        for (const part of PARTS) expect(Object.hasOwn(card, part), part).toBe(false);
    },
  );

  it.each(cards)(
    '$tag: the editor is the base’s, from the form, the lists and the defaults',
    async ({ card, editor, lists }) => {
      const element = (await card.getConfigElement()) as FluvyRowsEditor;
      // the base's own element, or one built on it (the Expander's, which edits the cards it holds under the form)
      expect(element).toBeInstanceOf(FluvyRowsEditor);
      const spec = element.spec!;
      // the card's own lists, or none
      if (editor.lists) expect(spec.lists).toBe(editor.lists);
      else expect(spec.lists).toEqual([]);
      const listKeys = new Set(
        lists.flatMap((list) => [list.key, ...(list.alias ? [list.alias] : [])]),
      );
      // a list is edited item by item: its picker leaves the form
      for (const name of names(spec.schema)) expect(listKeys.has(name), name).toBe(false);
      for (const list of lists) {
        expect(names(list.schema)[0], `${list.key}: the id field comes first`).toBe(
          list.idKey ?? 'entity',
        );
        if (list.keys) expect(new Set(names(list.schema))).toEqual(new Set(list.keys));
        // an item's form goes to Home Assistant's as it is: what an item shows is `schemaOf`'s to say
        expect(conditional(list.schema), `${list.key}: an item's field with a when`).toBe(false);
      }
    },
  );

  it.each(cards)(
    '$tag: a field that may hide is never a required one, and keeps its word and what the card does without it',
    ({ editor }) => {
      const form = editor.getConfigForm();
      const defaults =
        editorDefaults(form, editor.defaults)?.({ type: 'custom:x' }, undefined) ?? {};
      const key = (name: string): string => name;
      for (const field of hideable(form.schema)) {
        expect(field.required, `${field.name} is required`).not.toBe(true);
        expect(isWord(form.computeLabel?.(field, key), field.name), field.name).toBe(true);
        if (showsDefault(field))
          expect(field.name in defaults, `${field.name}: no default`).toBe(true);
      }
    },
  );

  it.each(cards)(
    '$tag: every switch and every choice shows what the card does when the config says nothing',
    ({ editor }) => {
      const defaults =
        editorDefaults(editor.getConfigForm(), editor.defaults)?.(
          { type: 'custom:x' },
          undefined,
        ) ?? {};
      for (const field of fields(editor.getConfigForm().schema))
        if (showsDefault(field)) expect(field.name in defaults, field.name).toBe(true);
    },
  );

  it.each(cards)(
    '$tag: a default is for a field the editor shows, never an older name',
    ({ card, editor }) => {
      const shown = new Set(names(editor.getConfigForm().schema));
      const defaults =
        editorDefaults(editor.getConfigForm(), editor.defaults)?.(
          { type: 'custom:x' },
          undefined,
        ) ?? {};
      for (const key of Object.keys(defaults)) expect(shown.has(key), key).toBe(true);
      // a conditional move (`forecast: none` → `show_forecast: false`) keeps its key: `forecast` is still a field
      for (const move of card.aliases?.keys ?? [])
        if (!move.when) expect(shown.has(move.from), move.from).toBe(false);
      // the names every card reads as something else are never shown either
      for (const move of COMMON_ALIASES.keys ?? [])
        expect(shown.has(move.from), `${move.from} is a shared older name`).toBe(false);
    },
  );

  it.each(cards)('$tag: every field the editor shows has a word', ({ editor, lists }) => {
    const form = editor.getConfigForm();
    const key = (name: string): string => name;
    for (const item of fields(form.schema))
      expect(isWord(form.computeLabel?.(item, key), item.name), item.name).toBe(true);
    for (const list of lists)
      for (const item of fields(list.schema)) {
        const label =
          list.computeLabel?.(item, key) ?? form.computeLabel?.(item, key) ?? itemLabels(item, key);
        // a field may carry no floating label on purpose (a colour well paints its whole box): its word is then
        // the helper under it
        const word = label === '' ? list.computeHelper?.(item, key) : label;
        expect(isWord(word, item.name), `${list.key}.${item.name}`).toBe(true);
      }
  });

  /**
   * An item's colour never says "Primary" for a default that is not its own: none chosen, nothing written, and the
   * word under it says what the item wears then — its bulb's on a card that shows bulbs' colours, else the card's; the
   * card's; or the one the card gives it by what it is (a kind's, a source's, a severity's, a figure's neutral).
   */
  const CARDS_COLOUR = 'Empty: the card’s colour';
  const BULBS_COLOUR =
    'Empty: the light’s bulb colour where the card shows bulbs’ colours, else the card’s';
  const OWN_COLOUR = 'Empty: the colour the card gives it';
  it.each([
    ['fluvy-lock-card', 'rows', CARDS_COLOUR],
    ['fluvy-camera-card', 'rows', CARDS_COLOUR],
    ['fluvy-alarm-card', 'rows', CARDS_COLOUR],
    ['fluvy-scenes-card', 'scenes', CARDS_COLOUR],
    ['fluvy-chips-card', 'chips', CARDS_COLOUR],
    ['fluvy-people-card', 'people', CARDS_COLOUR],
    ['fluvy-lights-card', 'lights', BULBS_COLOUR],
    ['fluvy-tiles-card', 'tiles', BULBS_COLOUR],
    ['fluvy-entities-card', 'rows', BULBS_COLOUR],
    ['fluvy-distribution-card', 'entities', OWN_COLOUR],
    ['fluvy-appliances-card', 'appliances', OWN_COLOUR],
    ['fluvy-stat-tiles-card', 'rows', OWN_COLOUR],
    ['fluvy-energy-balance-card', 'sources', OWN_COLOUR],
    ['fluvy-alerts-card', 'alerts', OWN_COLOUR],
    ['fluvy-cameras-card', 'cameras', OWN_COLOUR],
  ])(
    '%s: an item’s colour shows none chosen, and says what the item wears then',
    (tag, key, helper) => {
      const list = cards.find((c) => c.tag === tag)?.lists.find((l) => l.key === key);
      const colour = fields(list?.schema ?? []).find((item) => item.name === 'color');
      expect(colour, `${tag}: ${key}.color`).toBeDefined();
      const picker = (colour?.selector as { ui_color?: { default_color?: string } })?.ui_color;
      expect(picker, `${tag}: a colour picker`).toBeDefined();
      expect(picker?.default_color).toBeUndefined();
      expect(colour?.default).toBeUndefined();
      expect(itemHelpers(colour!, (k) => k)).toBe(helper);
    },
  );

  it.each(cards)(
    '$tag: no item colour of its lists says "Primary" while none is chosen',
    ({ tag, lists }) => {
      for (const list of lists)
        for (const colour of fields(list.schema).filter((item) => item.selector?.['ui_color'])) {
          const picker = (colour.selector as { ui_color: { default_color?: string } }).ui_color;
          expect(picker.default_color, `${tag}: ${list.key}.${colour.name}`).toBeUndefined();
          expect(
            colour.helper,
            `${tag}: ${list.key}.${colour.name} says what it wears`,
          ).toBeDefined();
        }
    },
  );

  it.each(cards)(
    '$tag: offers its surface’s opacity wherever it offers its colour, and honours both (1.15)',
    ({ editor }) => {
      const shown = names(editor.getConfigForm().schema);
      expect(shown.includes('card_opacity')).toBe(shown.includes('card_color'));
      expect(editor.base.includes('card_opacity')).toBe(editor.base.includes('card_color'));
    },
  );

  it.each(cards)(
    '$tag: offers its border wherever it offers its opacity, and honours both (1.19, #171)',
    ({ editor }) => {
      const shown = names(editor.getConfigForm().schema);
      expect(shown.includes('card_border')).toBe(shown.includes('card_opacity'));
      expect(editor.base.includes('card_border')).toBe(editor.base.includes('card_opacity'));
    },
  );

  it.each(cards)(
    '$tag: names its entity, and each item its own, in Home Assistant’s parts where one is beside the name (#125)',
    ({ tag, editor, lists }) => {
      for (const schema of [editor.getConfigForm().schema, ...lists.map((list) => list.schema)]) {
        const shown = fields(schema);
        const name = shown.find((field) => field.name === 'name');
        if (!name) continue;
        const beside = shown.some(
          (field) =>
            field.name === 'entity' &&
            (field.selector as { entity?: { multiple?: boolean } } | undefined)?.entity
              ?.multiple !== true,
        );
        // the template card's name and a chip's are templates of the person's own: words
        if (beside && !TEMPLATED.has(tag)) {
          expect(name.selector, tag).toEqual({ entity_name: {} });
          expect(name.context, tag).toEqual({ entity: 'entity' });
        } else expect(name.selector, tag).toEqual({ text: {} });
      }
    },
  );

  it.each(cards)(
    '$tag: offers its look out of reach wherever it offers its opacity, but on a card that shows no entity (#126)',
    ({ tag, editor }) => {
      const shown = names(editor.getConfigForm().schema);
      // a web page, and an expander: the entities its head counts are never out of reach on it, only fewer
      const none = tag === 'fluvy-web-card' || tag === 'fluvy-expander-card';
      expect(shown.includes('unavailable')).toBe(shown.includes('card_opacity') && !none);
      expect(editor.base.includes('unavailable')).toBe(
        editor.base.includes('card_opacity') && !none,
      );
    },
  );

  it.each(cards)(
    '$tag: offers the words under its sliders wherever it offers their style, and honours both (1.18, #144)',
    ({ editor }) => {
      const shown = names(editor.getConfigForm().schema);
      expect(shown.includes('slider_words')).toBe(shown.includes('slider_style'));
      expect(editor.base.includes('slider_words')).toBe(editor.base.includes('slider_style'));
    },
  );

  it('offers the fill only where the card draws a tile (#144)', () => {
    const values = (field: HaFormSchemaItem): string[] =>
      (
        field.selector?.['select'] as { options?: readonly { value: string }[] } | undefined
      )?.options?.map((o) => o.value) ?? [];
    const offers = (tag: string): boolean[] =>
      fields(cards.find((c) => c.tag === tag)!.editor.getConfigForm().schema)
        .filter((field) => field.name === 'slider_style')
        .map((field) => values(field).includes('fill'))
        .sort();
    expect(offers('fluvy-tile-card')).toEqual([true]);
    expect(offers('fluvy-tiles-card')).toEqual([true]);
    // a card that draws a tile in one of its layouts offers it in that one alone
    expect(offers('fluvy-slider-card')).toEqual([false, true]);
    // the lights card's tiles are compact rows, no slider of theirs: its style is the room's brightness's
    for (const tag of [
      'fluvy-light-card',
      'fluvy-lights-card',
      'fluvy-fan-card',
      'fluvy-cover-card',
      'fluvy-media-card',
      'fluvy-helpers-card',
    ])
      expect(offers(tag), tag).toEqual([false]);
    const slider = cards.find((c) => c.tag === 'fluvy-slider-card')!.editor.getConfigForm();
    const shown = (data: Record<string, unknown>) =>
      fields(visibleFields(slider.schema, data))
        .filter((field) => field.name === 'slider_style')
        .map((field) => values(field));
    expect(shown({ variant: 'tile' })).toEqual([['house', 'ruler', 'bar', 'liquid', 'fill']]);
    expect(shown({ variant: 'full' })).toEqual([['house', 'ruler', 'bar', 'liquid']]);
    // the words are offered while the style drawn says any: a bar's or a liquid's
    const words = (data: Record<string, unknown>) =>
      names(visibleFields(slider.schema, data)).includes('slider_words');
    expect(words({})).toBe(false);
    expect(words({ slider_style: 'bar' })).toBe(true);
    expect(words({ slider_style: 'liquid' })).toBe(true);
    expect(words({ slider_style: 'ruler' })).toBe(false);
  });

  it('offers a clock’s look out of reach where it shows a weather, the one thing on it that can be', () => {
    const clock = cards.find((c) => c.tag === 'fluvy-clock-card')!.editor.getConfigForm();
    expect(names(visibleFields(clock.schema, {}))).not.toContain('unavailable');
    expect(names(visibleFields(clock.schema, { weather: 'weather.home' }))).toContain(
      'unavailable',
    );
  });

  it('hides the opacity where a card draws no surface: the web page card bare', () => {
    const web = cards.find((c) => c.tag === 'fluvy-web-card')!.editor.getConfigForm();
    expect(names(visibleFields(web.schema, { variant: 'bare' }))).not.toContain('card_opacity');
    expect(names(visibleFields(web.schema, { variant: 'plate' }))).toContain('card_opacity');
  });

  it.each(cards)(
    '$tag: what the form and the lists show is base ∪ keys',
    ({ tag, editor, lists }) => {
      if (!editor.keys.length) {
        expect(PENDING.has(tag), `${tag} declares no keys and is not named as pending`).toBe(true);
        return;
      }
      expect(PENDING.has(tag), `${tag} declares its keys: drop it from PENDING`).toBe(false);
      const shown = new Set([
        ...names(editor.getConfigForm().schema),
        ...lists.flatMap((list) => [list.key, ...(list.alias ? [list.alias] : [])]),
      ]);
      expect([...shown].sort()).toEqual([...new Set([...editor.base, ...editor.keys])].sort());
    },
  );
});

/** A card's or an item's own actions, as Home Assistant names them (#179). */
const ACTIONS = new Set([
  'tap_action',
  'hold_action',
  'double_tap_action',
  'icon_tap_action',
  'icon_hold_action',
  'icon_double_tap_action',
]);
/** Those not shown until one is added: a double tap, a circle's. */
const ADDED = new Set(
  [...ACTIONS].filter((name) => name !== 'tap_action' && name !== 'hold_action'),
);

/** Each action a schema shows, with the section and the optional group it stands in (`''` for none). */
const placed = (
  schema: readonly HaFormSchemaItem[],
  section = '',
  added = false,
): { readonly name: string; readonly section: string; readonly added: boolean }[] =>
  schema.flatMap((item) =>
    item.schema
      ? placed(
          item.schema,
          item.type === 'expandable' ? (item.title ?? '') : section,
          added || item.type === 'optional_actions',
        )
      : ACTIONS.has(item.name)
        ? [{ name: item.name, section, added }]
        : [],
  );

/** A heading answers a tap alone, as Home Assistant's own heading does. */
const TAP_ALONE = new Set(['fluvy-heading-card']);

describe('what a card answers (#179)', () => {
  /** Every list of a card, by its key, with its form. */
  const forms = cards.flatMap(({ tag, editor, lists }) => [
    { where: tag, keys: editor.base, schema: editor.getConfigForm().schema },
    ...lists.map((list) => ({
      where: `${tag} ${list.key}`,
      keys: list.keys ?? names(list.schema),
      schema: list.schema,
    })),
  ]);

  it.each(forms)(
    '$where: a double tap beside every hold, and a hold and a double tap beside every tap',
    ({ where, keys }) => {
      if (keys.includes('hold_action')) expect(keys).toContain('double_tap_action');
      if (keys.includes('tap_action') && !TAP_ALONE.has(where)) {
        expect(keys).toContain('hold_action');
        expect(keys).toContain('double_tap_action');
      }
      // a circle answers all three, or none
      const icon = keys.filter((key) => key.startsWith('icon_') && key.endsWith('_action'));
      expect([0, 3]).toContain(icon.length);
    },
  );

  it.each(forms)(
    '$where: its actions stand in its Interactions section, a double tap and a circle’s added as Home Assistant adds them',
    ({ schema }) => {
      const interactions = 'Interactions';
      for (const { name, section, added } of placed(schema)) {
        expect(section, name).toBe(interactions);
        expect(added, name).toBe(ADDED.has(name));
      }
    },
  );

  it('says under a double tap what it costs a tap, and shows what a tap does while none is chosen', () => {
    const tile = cards.find((c) => c.tag === 'fluvy-light-card')!.editor.getConfigForm();
    const shown = fields(tile.schema);
    const field = (name: string) => shown.find((item) => item.name === name);
    expect(field('double_tap_action')?.helper).toBe('editor.double_tap_helper');
    expect(field('icon_double_tap_action')?.helper).toBe('editor.double_tap_helper');
    expect(field('tap_action')?.selector).toEqual({ ui_action: { default_action: 'more-info' } });
    expect(field('icon_tap_action')?.selector).toEqual({ ui_action: { default_action: 'none' } });
    // a card of many has no details of its own to open
    const bars = cards.find((c) => c.tag === 'fluvy-bars-card')!.editor.getConfigForm();
    expect(fields(bars.schema).find((item) => item.name === 'tap_action')?.selector).toEqual({
      ui_action: { default_action: 'none' },
    });
  });
});
