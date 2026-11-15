// the card picker's catalogue: Home Assistant announces every card's name and description in English at registration;
// this rewrites them into the language the dashboard speaks, once per language, for the entries Fluvy knows the words of
import type { HomeAssistant } from '@fluvy/core';

import { CHINESE } from './catalogue-zh.js';

/** Fluvy's marks off a tag: `'fluvy-energy-flow-card'` → `'energy-flow'`, the catalogue's key. */
const keyOf = (type: string): string =>
  type.replace(/^custom:/, '').replace(/^fluvy-/, '').replace(/-card$/, '');

/** The picker's words in a language, by the key `keyOf` names: Chinese only until the catalogue joins Fluvy's locales. */
const words = (language: string): Readonly<Record<string, string>> =>
  /^zh(-|_|$)/i.test(language) ? CHINESE : {};

let spoken = '';

/**
 * The card picker's names and descriptions in the language `hass` speaks. Home Assistant's picker and Fluvy's
 * Customise both read them from `window.customCards`, which registers them in English — a dashboard's language is the
 * person's, so the entries are rewritten once per language (and read live by whoever lists them).
 */
export function localizeCatalogue(hass: HomeAssistant): void {
  const language = hass.language ?? 'en';
  if (language === spoken) return;
  spoken = language;
  const table = words(language);
  if (!Object.keys(table).length) return;
  const cards = (globalThis as { customCards?: { type: string; name?: string; description?: string }[] })
    .customCards;
  if (!Array.isArray(cards)) return;
  for (const card of cards) {
    if (!card.type.startsWith('fluvy-')) continue;
    const key = keyOf(card.type);
    const name = table[`${key}.name`];
    const description = table[`${key}.desc`];
    if (name) card.name = `Fluvy · ${name}`;
    if (description) card.description = description;
  }
}
