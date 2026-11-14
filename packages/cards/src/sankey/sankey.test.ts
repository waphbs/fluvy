import { resolveEntity, type HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { allocatePeriod } from '../energy-model/period.js';
import type { PrefSource } from '../energy-model/prefs.js';
import {
  APART,
  BAR,
  GAP,
  layoutSankey,
  packLabels,
  packLegend,
  RIBBONS,
  scaleOf,
  TIER,
  type LaidNode,
} from './layout.js';
import { crossingsOf, houseKids, idNamed, sankeyModel, ZERO, type DeviceInput } from './model.js';

/** The flow sheet's day, in four buckets: 4.1 in, 1.3 out, 11.2 of sun, 2.4 discharged, 3.0 charged. */
const SOURCES: PrefSource[] = [
  { kind: 'grid', measure: null, energyIn: ['grid_in'], energyOut: ['grid_out'] },
  { kind: 'solar', measure: null, energyIn: ['solar'], energyOut: [] },
  { kind: 'battery', measure: null, energyIn: ['battery_out'], energyOut: ['battery_in'] },
];
const rows = (values: readonly number[]) => values.map((change, i) => ({ start: i, change }));
const day = allocatePeriod(
  {
    grid_in: rows([2.0, 0.3, 0, 1.8]),
    grid_out: rows([0, 0.4, 0.9, 0]),
    solar: rows([0, 4.0, 7.2, 0]),
    battery_out: rows([1.4, 0, 0, 1.0]),
    battery_in: rows([0, 1.6, 1.4, 0]),
  },
  SOURCES,
);
const DEVICES: DeviceInput[] = [
  { index: 0, id: 'heat_pump', value: 5.1 },
  { index: 1, id: 'car', value: 3.8 },
  { index: 2, id: 'kitchen', value: 2.1 },
  { index: 3, id: 'oven', value: 1.1, parent: 'kitchen' },
];
const close = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

describe('the sankey’s model: the Energy dashboard’s figures, rows that do not cross', () => {
  const model = sankeyModel(day.totals, day.allocation, DEVICES, 4);

  it('reads each source’s meter, the house’s use and the allocation between them', () => {
    expect(model.sources.map((n) => [n.key, +n.value.toFixed(2)])).toEqual([
      ['grid', 4.1],
      ['battery', 2.4],
      ['solar', 11.2],
    ]);
    expect(model.targets.map((n) => [n.key, +n.value.toFixed(2)])).toEqual([
      ['house', 13.4],
      ['charged', 3.0],
      ['exported', 1.3],
    ]);
    expect(model.links.map((l) => `${l.from}→${l.to} ${l.value.toFixed(1)}`)).toEqual([
      'grid→house 4.1',
      'battery→house 2.4',
      'solar→house 6.9',
      'solar→charged 3.0',
      'solar→exported 1.3',
    ]);
    expect(model.total).toBeCloseTo(17.7, 10);
    expect(model.crossings).toBe(0);
  });

  it('draws the top-level devices largest first, then what they leave unmeasured, dashed', () => {
    expect(model.kids.map((n) => [n.key, +n.value.toFixed(2), n.dashed ?? false])).toEqual([
      ['device:0', 5.1, false],
      ['device:1', 3.8, false],
      ['device:2', 2.1, false],
      ['unmeasured', 2.4, true],
    ]);
  });

  it('leaves a figure of 0 out: no battery, no battery bar, no charge', () => {
    const t = { solar: 5, fromGrid: 2, toGrid: 1, fromBattery: 0, toBattery: 0 };
    const m = sankeyModel(
      t,
      {
        ...day.allocation,
        usedBattery: 0,
        gridToBattery: 0,
        batteryToGrid: 0,
        solarToBattery: 0,
        usedSolar: 4,
        usedGrid: 2,
        solarToGrid: 1,
      },
      [],
      4,
    );
    expect(m.sources.map((n) => n.key)).toEqual(['grid', 'solar']);
    expect(m.targets.map((n) => n.key)).toEqual(['house', 'exported']);
    expect(m.kids).toEqual([]);
    expect(m.sources.every((n) => n.value >= ZERO)).toBe(true);
  });

  it('reorders the rows when the grid charges the battery: the fewest crossings, one here, and none is possible', () => {
    const night = allocatePeriod(
      {
        grid_in: rows([6.0, 0.2, 0, 0.5]),
        grid_out: rows([0, 0, 2.0, 0]),
        solar: rows([0, 3.0, 6.0, 0]),
        battery_out: rows([0, 0, 0, 3.0]),
        battery_in: rows([4.0, 0.5, 1.5, 0]),
      },
      SOURCES,
    );
    const m = sankeyModel(night.totals, night.allocation, [], 4);
    expect(m.links.some((l) => l.from === 'grid' && l.to === 'charged')).toBe(true);
    // Grid · Battery · Solar would cross twice; the battery first leaves one (the grid and the sun both feed
    // the house and the battery: no order can avoid it)
    expect(
      crossingsOf(['grid', 'battery', 'solar'], ['house', 'charged', 'exported'], m.links).count,
    ).toBe(2);
    expect(m.sources.map((n) => n.key)).toEqual(['battery', 'grid', 'solar']);
    expect(m.targets.map((n) => n.key)).toEqual(['house', 'charged', 'exported']);
    expect(m.crossings).toBe(1);
  });
});

describe('the house’s devices', () => {
  it('past the cap, the smallest — two at least, as Home Assistant groups them — join “other devices”', () => {
    const many: DeviceInput[] = [
      { index: 0, id: 'a', value: 5 },
      { index: 1, id: 'b', value: 4 },
      { index: 2, id: 'c', value: 3 },
      { index: 3, id: 'd', value: 1 },
      { index: 4, id: 'e', value: 0.5 },
    ];
    expect(houseKids(20, many, 3).map((n) => [n.key, n.value])).toEqual([
      ['device:0', 5],
      ['device:1', 4],
      ['device:2', 3],
      ['other', 1.5],
      ['unmeasured', 6.5],
    ]);
    // one over the cap still groups two: a lone "other" would be a device by another name
    expect(houseKids(20, many.slice(0, 4), 3).map((n) => n.key)).toEqual([
      'device:0',
      'device:1',
      'other',
      'unmeasured',
    ]);
  });

  it('a device inside another is in its figure; one with no statistics or 0 is left out', () => {
    const kids = houseKids(
      10,
      [
        { index: 0, id: 'kitchen', value: 3 },
        { index: 1, id: 'oven', value: 2, parent: 'kitchen' },
        { index: 2, id: 'gone', value: null },
        { index: 3, id: 'idle', value: 0 },
        // a parent that is not listed: the device is the house's own
        { index: 4, id: 'lamp', value: 1, parent: 'nowhere' },
      ],
      4,
    );
    expect(kids.map((n) => [n.key, n.value])).toEqual([
      ['device:0', 3],
      ['device:4', 1],
      ['unmeasured', 6],
    ]);
  });

  it('devices that read more than the house leave nothing unmeasured; none at all, no row', () => {
    expect(houseKids(2, [{ index: 0, id: 'a', value: 3 }], 4).map((n) => n.key)).toEqual([
      'device:0',
    ]);
    expect(houseKids(5, [], 4)).toEqual([]);
    expect(houseKids(5, [{ index: 0, id: 'a', value: null }], 4)).toEqual([]);
  });
});

describe('the sankey’s geometry', () => {
  const model = sankeyModel(day.totals, day.allocation, DEVICES, 4);
  /** The approved figure's words, as the card's ruler measures them at 320. */
  const WORDS: Record<string, number> = {
    grid: 56,
    battery: 76,
    solar: 76,
    house: 64,
    charged: 72,
    exported: 76,
    'device:0': 80,
    'device:1': 56,
    'device:2': 64,
    unmeasured: 100,
  };
  const g = layoutSankey(model, 320, (key) => WORDS[key] ?? 60);

  it('one px-per-kWh scale for every bar and ribbon, the widest row filling the column', () => {
    const rows = [g.top, g.mid, g.kids];
    for (const row of rows)
      for (const n of row) expect(close(n.w, n.value * g.scale), n.key).toBe(true);
    // 17.7 kWh and two gaps fill 320
    expect(g.scale).toBeCloseTo((320 - 2 * GAP) / 17.7, 10);
    for (const row of rows) {
      const last = row[row.length - 1] as LaidNode;
      expect(last.x + last.w).toBeLessThanOrEqual(320 + 1e-9);
      row
        .slice(1)
        .forEach((n, i) =>
          expect(n.x - ((row[i] as LaidNode).x + (row[i] as LaidNode).w)).toBeCloseTo(GAP, 9),
        );
    }
    expect(scaleOf(model, 320)).toBe(g.scale);
  });

  it('the approved bands: a tier of source words, ribbons of 88, the house’s leaving under its words', () => {
    expect(g.y0).toBe(TIER + 8);
    expect(g.y1).toBe(g.y0 + BAR + RIBBONS);
    // the targets' words take two tiers (Exported under Charged), the devices' two (Not measured under)
    expect(g.y2).toBe(g.y1 + BAR + 8 + 2 * TIER + 12 + RIBBONS);
    expect(g.height).toBe(416);
    expect(g.stem).not.toBeNull();
    const house = g.mid.find((n) => n.key === 'house') as LaidNode;
    expect(g.stem?.w).toBeCloseTo(house.w, 9);
  });

  it('packs each row’s words on the 4 grid, 16 apart, inside the column: at the bar’s start, else its end', () => {
    const at = (key: string) => g.labels.find((l) => l.key === key);
    expect(at('grid')).toMatchObject({ x: 0, tier: 0, end: false });
    expect(at('solar')?.end).toBe(true);
    expect((at('solar')?.x ?? 0) + (at('solar')?.w ?? 0)).toBe(320);
    expect(at('exported')?.tier).toBe(1);
    expect(at('unmeasured')?.tier).toBe(1);
    for (const l of g.labels) {
      expect(l.x % 4, l.key).toBe(0);
      expect(l.y % 4, l.key).toBe(0);
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w).toBeLessThanOrEqual(320);
    }
    for (const a of g.labels)
      for (const b of g.labels)
        if (a !== b && a.y === b.y && a.x < b.x)
          expect(b.x - (a.x + a.w)).toBeGreaterThanOrEqual(APART);
  });

  it('every ribbon starts and ends inside its bars; a device’s leaves the house’s stem', () => {
    expect(g.ribbons.map((r) => r.key)).toEqual([
      'grid-house',
      'battery-house',
      'solar-house',
      'solar-charged',
      'solar-exported',
      'house-device:0',
      'house-device:1',
      'house-device:2',
      'house-unmeasured',
    ]);
    const ink = Object.fromEntries(g.ribbons.map((r) => [r.key, r.ink]));
    expect(ink['solar-exported']).toBe('solar');
    expect(ink['house-device:0']).toBe('home');
  });

  it('a column too narrow for a word puts it on another tier, against the column’s end at worst', () => {
    const row: LaidNode[] = [
      { key: 'a', value: 1, ink: 'home', x: 0, w: 40 },
      { key: 'b', value: 1, ink: 'home', x: 48, w: 40 },
      { key: 'c', value: 1, ink: 'home', x: 96, w: 4 },
    ];
    const packed = packLabels(row, () => 90, 100);
    expect(packed.map((p) => p.tier)).toEqual([0, 1, 2]);
    // the last one's bar is at the column's end: its words end there too, right-aligned
    expect(packed[2]).toMatchObject({ end: true });
    expect((packed[2]?.x ?? 0) + (packed[2]?.w ?? 0)).toBeLessThanOrEqual(100);
    // a word wider than the column is the column, read from its start
    expect(
      packLabels([{ key: 'x', value: 1, ink: 'home', x: 30, w: 10 }], () => 400, 100)[0],
    ).toMatchObject({
      x: 0,
      w: 100,
      end: false,
    });
  });

  it('half a column keeps its words in two columns, the start and the end, in their bars’ order', () => {
    // four narrow bars across 132: at their starts the words would stand in four columns; here two a tier
    const row: LaidNode[] = [
      { key: 'a', value: 1, ink: 'home', x: 0, w: 28 },
      { key: 'b', value: 1, ink: 'home', x: 36, w: 28 },
      { key: 'c', value: 1, ink: 'home', x: 72, w: 28 },
      { key: 'd', value: 1, ink: 'home', x: 108, w: 24 },
    ];
    // a bar in the left half tries the start first, one in the right half the end
    const packed = packLabels(row, () => 50, 132);
    expect(packed.map((p) => [p.x, p.end, p.tier])).toEqual([
      [0, false, 0],
      [80, true, 0],
      [80, true, 1],
      [0, false, 1],
    ]);
    // a column from 200 up keeps the words at their bars (the last one at its bar's end, the column's)
    const wide = packLabels(
      row.map((n) => ({ ...n, x: n.x * 2, w: n.w * 2 })),
      () => 50,
      264,
    );
    expect(wide.map((p) => p.x)).toEqual([0, 72, 144, 212]);
  });
});

describe('a device away from the house (A7, the owner’s rule)', () => {
  const house = (states: Record<string, unknown>, entities: Record<string, unknown> = {}) =>
    ({ states, entities }) as unknown as HomeAssistant;
  const meter = (name: string) => ({
    entity_id: 'sensor.sk_heat_pump_energy',
    state: '5.1',
    attributes: { friendly_name: name, unit_of_measurement: 'kWh' },
  });

  it('keeps the room of the name it had: the friendly name this page read, or the registry’s', () => {
    // read while it was there, then gone from the house: its name is still its own, measured as it was (the labels
    // keep their tiers: 692 at 211, not 656 with "Heat p…" and the words packed a tier shorter)
    resolveEntity(
      house({ 'sensor.sk_heat_pump_energy': meter('Heat pump energy') }),
      'sensor.sk_heat_pump_energy',
    );
    const away = house({});
    expect(idNamed(away, resolveEntity(away, 'sensor.sk_heat_pump_energy'), undefined)).toBe(false);
    const registered = house({}, { 'sensor.sk_dryer_energy': { name: 'Dryer' } });
    expect(
      idNamed(registered, resolveEntity(registered, 'sensor.sk_dryer_energy'), undefined),
    ).toBe(false);
  });

  it('takes only its figure’s room where its name is only its id’s, and never with a name of its own', () => {
    const away = house({});
    expect(idNamed(away, resolveEntity(away, 'sensor.sk_never_seen_energy'), undefined)).toBe(true);
    expect(idNamed(away, resolveEntity(away, 'sensor.sk_never_seen_energy'), 'Sauna')).toBe(false);
    const here = house({ 'sensor.sk_oven_energy': meter('Oven') });
    expect(idNamed(here, resolveEntity(here, 'sensor.sk_oven_energy'), undefined)).toBe(false);
  });
});

describe('a row of words its bars cannot hold', () => {
  const model = sankeyModel(day.totals, day.allocation, DEVICES, 4);
  const g = layoutSankey(model, 320, (key) => (key.startsWith('device:') ? 80 : 60));

  it('reads as a legend instead: left to right, a tier a line, 16 apart (#183)', () => {
    // four words 80 wide in a 240 column: two a line, the rest under
    const legend = packLegend(g.kids, () => 80, 240);
    expect(legend.map((l) => l.tier)).toEqual([0, 0, 1, 1]);
    for (const tier of [0, 1]) {
      const line = legend.filter((l) => l.tier === tier).sort((a, b) => a.x - b.x);
      expect(line[0]?.x).toBe(0);
      const [first, second] = line;
      if (first && second) expect(second.x - (first.x + first.w)).toBe(APART);
    }
  });

  it('keeps every word inside the column, none on top of another', () => {
    const legend = packLegend(g.kids, () => 80, 240);
    for (const l of legend) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x + l.w).toBeLessThanOrEqual(240);
    }
    for (const a of legend)
      for (const b of legend)
        if (a !== b && a.tier === b.tier) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(80);
  });
});
