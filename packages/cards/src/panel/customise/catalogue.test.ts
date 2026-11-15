import { beforeEach, describe, expect, it } from 'vitest';

import { localizeCatalogue } from './catalogue.js';

const hass = (language: string) => ({ language }) as never;

const catalogue = () => ({
  customCards: [
    { type: 'fluvy-tile-card', name: 'Fluvy · Tile', description: 'A light, switch…' },
    { type: 'fluvy-lights-card', name: 'Fluvy · Room lights', description: 'A room’s lights…' },
    { type: 'fluvy-energy-flow-card', name: 'Fluvy · Energy flow', description: 'Where it went' },
    { type: 'hui-entities-card', name: 'Entities', description: 'Home Assistant’s own' },
  ] as { type: string; name: string; description: string }[],
});

describe('the card picker’s catalogue', () => {
  beforeEach(() => {
    (globalThis as { customCards?: unknown }).customCards = catalogue().customCards;
  });

  it('speaks Chinese over Fluvy’s cards and leaves Home Assistant’s own alone', () => {
    localizeCatalogue(hass('zh-Hans') as never);
    const cards = (globalThis as { customCards?: { type: string; name: string }[] }).customCards ?? [];
    expect(cards[0].name).toBe('Fluvy · 磁贴');
    expect(cards[1].name).toBe('Fluvy · 房间灯光');
    expect(cards[2].name).toBe('Fluvy · 能量流');
    expect(cards[3].name).toBe('Entities');
    expect(cards[0].description).not.toContain('A light, switch');
  });

  it('leaves the English catalogue alone when the dashboard speaks English', () => {
    localizeCatalogue(hass('en-GB') as never);
    const cards = (globalThis as { customCards?: { type: string; name: string }[] }).customCards ?? [];
    expect(cards[0].name).toBe('Fluvy · Tile');
    expect(cards[0].description).toBe('A light, switch…');
  });
});
