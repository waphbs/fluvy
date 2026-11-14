// @vitest-environment happy-dom
import type { EntityView, HaFormSchemaItem, HomeAssistant } from '@fluvy/core';
import { describe, expect, it } from 'vitest';
import { flowStage } from '../energy-family.js';
import { allocate } from '../energy-model/allocate.js';
import { shortName } from '../energy/power.js';
import { normaliseConfig } from '../shared/config.js';
import { writesZero } from '../shared/units.js';
import { brokenName, FluvyEnergyFlowCard } from './energy-flow-card.js';
import { lists } from './energy-flow-editor.js';
import {
  arcLengths,
  arcs,
  at,
  crossLayout,
  drawn,
  endAngle,
  HEAD,
  HOUSE_CIRC,
  lane,
  onCircle,
  pulseFrames,
  railIn,
  RING,
  rowsLayout,
  upTo,
  paramAt,
  type RowsLayout,
  type WayMode,
} from './geometry.js';
import { budget, density, pace, type Pulse } from './motion.js';
import { lanesOf, said, waysOf, type SceneNode, type WayWords } from './scene.js';

const dist = (p: readonly number[], q: readonly number[]): number =>
  Math.hypot((p[0] ?? 0) - (q[0] ?? 0), (p[1] ?? 0) - (q[1] ?? 0));

describe('the arrowhead ends the lane', () => {
  const l = lane([60, 42], 0, onCircle([292, 122], RING, 200), 20, 100);

  it('its tip is the lane’s end, and the lane stops 7 px before it (5 on a thin lane)', () => {
    const acc = arcLengths(l);
    const total = acc[acc.length - 1] ?? 0;
    const lane7 = drawn(l, 'lane');
    const thin = drawn(l, 'thin');
    expect(lane7.run).toBeCloseTo(total - HEAD.lane.trim, 5);
    expect(thin.run).toBeCloseTo(total - HEAD.thin.trim, 5);
    // the body's last point is 7 px of curve before the tip
    const cut = at(upTo(l, paramAt(acc, lane7.run)), 1);
    expect(dist(cut, l.b)).toBeGreaterThan(6.5);
    expect(dist(cut, l.b)).toBeLessThan(7.01);
    expect(lane7.head).toContain(
      `translate(${Math.round(l.b[0] * 10) / 10},${Math.round(l.b[1] * 10) / 10})`,
    );
  });

  it('points along the lane’s last tangent', () => {
    const straight = lane([0, 0], 0, [100, 0], 0, 30);
    expect(endAngle(straight)).toBeCloseTo(0);
    expect(drawn(straight).head).toContain('rotate(0)');
  });

  it('without heads the lane runs its whole length', () => {
    const acc = arcLengths(l);
    expect(drawn(l, 'lane', false).run).toBeCloseTo(acc[acc.length - 1] ?? 0, 5);
  });
});

describe('rows', () => {
  /** A node whose words read `now` and can read `steady` wide, in the ways it may say its way, its label on one line. */
  const widths = (steady: number, now = steady, ...ways: [WayMode, number][]) =>
    [['inline', steady] as [WayMode, number], ...ways].map(([way, wide]) => ({
      way,
      lines: 1 as const,
      steady: wide,
      now: way === 'inline' ? now : Math.min(now, wide),
    }));
  const node = (pair = false) => ({ words: widths(100), pair });
  /** The house's words: "House" over "4.1 kW". */
  const house = { houseWordsH: 36, houseWordsW: 48 };

  it('the #19 house: a lane for the sun, a pair for the grid, a lane for the battery, 6 px off the ring', () => {
    const r = rowsLayout({ width: 320, nodes: [node(), node(true), node()], ...house });
    expect(r.narrow).toBe(false);
    expect(r.lanes.map((l) => `${l.node}.${l.index}`)).toEqual(['0.0', '1.0', '1.1', '2.0']);
    for (const l of r.lanes) expect(dist(l.path.b, r.house)).toBeCloseTo(RING, 5);
    // the pair: two lanes 16 px apart where they leave the words
    const [a, b] = r.lanes.filter((l) => l.node === 1);
    expect((b?.path.a[1] ?? 0) - (a?.path.a[1] ?? 0)).toBe(16);
  });

  it('keeps 20 px of ring between neighbouring contacts, 16 inside a pair', () => {
    const r = rowsLayout({ width: 320, nodes: [node(), node(true), node()], ...house });
    const ends = r.lanes.map((l) => l.path.b);
    for (let i = 1; i < ends.length; i++) {
      const gap = dist(ends[i - 1] ?? [0, 0], ends[i] ?? [0, 0]);
      expect(gap).toBeGreaterThan(i === 2 ? 15.5 : 19.5);
    }
  });

  it('a lane shorter than 56 px is no lane: the card lists', () => {
    expect(rowsLayout({ width: 248, nodes: [node(), node(), node()], ...house }).narrow).toBe(true);
    expect(rowsLayout({ width: 320, nodes: [node(), node(), node()], ...house }).narrow).toBe(
      false,
    );
  });

  it('lists by the words as they can read, whatever the figures say now (#170)', () => {
    // a battery whose words can read "8.9 kW discharging" (124): lanes at 320 with a day's figure or a month's
    const battery = (now: number) => ({ words: widths(124, now), pair: false });
    const day = rowsLayout({ width: 320, nodes: [node(), battery(103)], ...house });
    const month = rowsLayout({ width: 320, nodes: [node(), battery(134)], ...house });
    expect([day.narrow, month.narrow]).toEqual([false, false]);
    // the lanes leave after the words as they can read, and after a figure that reads wider than the usual as far as
    // every lane stays one (56 px: the house's ring at 258), where a month's "134" took the lane to 54
    expect(day.tail).toBe(192);
    expect(month.tail).toBe(200);
    expect(month.house[0] - RING - month.tail).toBeGreaterThanOrEqual(56);
    // and where no way of its words leaves a lane, the card lists at any figure
    const long = (now: number) => ({ words: widths(140, now), pair: false });
    expect(rowsLayout({ width: 320, nodes: [node(), long(60)], ...house }).narrow).toBe(true);
    expect(rowsLayout({ width: 320, nodes: [node(), long(140)], ...house }).narrow).toBe(true);
  });

  it('where its way beside its figure leaves no lane, a node says it on the line under it, a pair by a glyph (#170)', () => {
    // "8,9 kW descargando" (135) leaves 54 px at 320: the word goes under the figure, the grid's pair takes glyphs
    const battery = { words: widths(135, 120, ['line', 98], ['glyph', 70]), pair: false };
    const grid = { words: widths(140, 120, ['glyph', 72]), pair: true };
    const r = rowsLayout({ width: 320, nodes: [node(), grid, battery], ...house });
    expect(r.narrow).toBe(false);
    expect(r.ways).toEqual(['inline', 'glyph', 'line']);
    expect(r.tail).toBe(168);
    // each way is taken only where the one before leaves no lane; none leaving one, the card lists
    expect(rowsLayout({ width: 400, nodes: [node(), grid, battery], ...house }).ways).toEqual([
      'inline',
      'inline',
      'inline',
    ]);
    const wordy = { words: widths(160, 160, ['line', 150], ['glyph', 150]), pair: false };
    expect(rowsLayout({ width: 320, nodes: [node(), wordy], ...house }).narrow).toBe(true);
  });

  it('a long name on two lines keeps the lanes where one line would list them (#183)', () => {
    // "Wechselrichter Süddach" (176) leaves no lane at 320; "Wechselrichter" over "Süddach" (104) does
    const long = {
      words: [
        { way: 'inline' as const, lines: 1 as const, steady: 176, now: 176 },
        { way: 'inline' as const, lines: 2 as const, steady: 104, now: 104 },
      ],
      pair: false,
    };
    const r = rowsLayout({ width: 320, nodes: [long, node(), node()], ...house });
    expect(r.narrow).toBe(false);
    expect([r.ways, r.lines]).toEqual([
      ['inline', 'inline', 'inline'],
      [2, 1, 1],
    ]);
    // one line where it leaves a lane
    expect(rowsLayout({ width: 420, nodes: [long, node()], ...house }).lines).toEqual([1, 1]);
  });

  it('a label on three lines keeps the lanes where two would list a card read larger (#183)', () => {
    /** A name of `steady` on one line, half of it on two, a third on three. */
    const broken = (steady: number) => ({
      words: [1, 2, 3].map((lines) => ({
        way: 'inline' as const,
        lines: lines as 1 | 2 | 3,
        steady: Math.round(steady / lines),
        now: Math.round(steady / lines),
      })),
      pair: false,
    });
    // a card at 125 % of a phone's width: "逆变器 E2 南 MPPT 累计发电量" takes 3 lines (76) where 2 take 128
    const long = broken(190);
    const narrow = rowsLayout({ width: 256, nodes: [long, broken(120), broken(120)], ...house });
    expect(narrow.narrow).toBe(false);
    expect(narrow.lines[0]).toBe(3);
    expect(narrow.height).toBe(flowStage(3));
    // a card at its usual width keeps two lines at most: the stage it declares is not grown by a third
    const usual = rowsLayout({ width: 320, nodes: [long, broken(120), broken(120)], ...house });
    expect(usual.lines.every((lines) => lines <= 2)).toBe(true);
  });

  it('the stage is the height the card declares, whatever its words and its ways (#170)', () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const nodes = Array.from({ length: count }, (_, i) => node(i === count - 1));
      expect(rowsLayout({ width: 320, nodes, ...house }).height).toBe(flowStage(count));
    }
    // three lines under the last node; the list's rows, three lines a node and 6 between, in two
    expect(flowStage(3)).toBe(232);
    expect(flowStage(2)).toBe(168);
  });

  /** How near the middle of a lane, in or out, comes to the house's words standing in [left, right]. */
  const nearest = (r: RowsLayout, left: number, right: number): number => {
    let near = Infinity;
    for (const path of [...r.lanes.map((l) => l.path), ...r.out])
      for (let i = 0; i <= 200; i++) {
        const [x, y] = at(path, i / 200);
        const dx = Math.max(left - x, 0, x - right);
        const dy = Math.max(r.houseWords - y, 0, y - (r.houseWords + 36));
        near = Math.min(near, Math.hypot(dx, dy));
      }
    return near;
  };
  const wideHouse = { houseWordsH: 36, houseWordsW: 67 }; // "13.4 kWh", as wide as the house's figures read

  it('#170: the house’s words keep every lane 4 px off them, however many rows come in under the house', () => {
    for (const nodes of [
      [node(), node(), node()],
      [node(), node(true), node(true)],
      [node(), node(), node(), node()],
      [node(), node(), node(true), node(), node()],
    ])
      for (const width of [320, 372, 600]) {
        const r = rowsLayout({ width, nodes, ...wideHouse });
        // a lane's half (3) and 4 clear
        expect(nearest(r, width - 67, width)).toBeGreaterThanOrEqual(7);
      }
  });

  it('a fan whose lanes would take the house’s words past the stage leans up, so the stage is what the card declares', () => {
    // pairs under the house's "88,888 W" (75): its words stood 4 to 8 px past the stage at 226 to 362
    for (let width = 226; width <= 400; width += 2)
      for (const nodes of [
        [node(), node(true), node(true)],
        [node(true), node(), node(true)],
        [node(true), node(true), node(true)],
        [node(), node(true)],
      ]) {
        const r = rowsLayout({ width, nodes, houseWordsH: 36, houseWordsW: 75 });
        if (r.narrow) continue;
        expect(r.height).toBe(flowStage(nodes.length));
        expect(nearest(r, width - 75, width)).toBeGreaterThanOrEqual(7);
      }
  });

  it('they hang under the ring where no lane comes through, lower where one would, in the stage the rows ask', () => {
    const three = rowsLayout({ width: 320, nodes: [node(), node(), node()], ...house });
    expect(three.houseWords).toBe(three.house[1] + 36);
    // five rows: lower, and the stage as tall as five rows make it, as the card declares
    const five = rowsLayout({ width: 320, nodes: [1, 2, 3, 4, 5].map(() => node()), ...wideHouse });
    expect(five.houseWords).toBeGreaterThan(five.house[1] + 36);
    expect(five.height).toBe(flowStage(5));
  });

  it('beside consumers they stand centred under the house, clear of the lanes in and out', () => {
    const r = rowsLayout({
      width: 696,
      nodes: [1, 2, 3, 4].map(() => node()),
      ...wideHouse,
      consumers: [1, 2, 3].map(() => ({ wordsH: 36, wordsW: 80 })),
    });
    expect(nearest(r, 348 - 33.5, 348 + 33.5)).toBeGreaterThanOrEqual(7);
  });

  it('the stage ends at the last words, on the 4 px grid', () => {
    const r = rowsLayout({ width: 320, nodes: [node(), node(), node()], ...house });
    expect(r.height % 4).toBe(0);
    expect(r.height).toBeGreaterThanOrEqual(202 + 22);
  });

  it('consumers move the house to the middle and get a lane each', () => {
    const r = rowsLayout({
      width: 696,
      nodes: [node(), node(), node()],
      ...house,
      consumers: [
        { wordsH: 36, wordsW: 80 },
        { wordsH: 36, wordsW: 80 },
      ],
    });
    expect(r.house[0]).toBe(348);
    expect(r.out).toHaveLength(2);
  });

  it('the rail bends 12 px, or the whole drop when the row is closer to the house', () => {
    expect(railIn(100, 42, 132, 122)).toContain('Q132,42 132,54');
    expect(railIn(100, 114, 132, 122)).toContain('Q132,114 132,122');
  });
});

describe('the cross', () => {
  it('hangs the house’s words under its ring, lower where the battery’s lane would brush them, in its 292', () => {
    expect(crossLayout(320, 40).houseWords).toBe(186);
    // "12.4 kW" and wider: under the lane, 4 px clear of its middle's half
    for (const wide of [60, 67, 90]) {
      const g = crossLayout(320, wide);
      expect(g.houseWords + 36).toBeLessThanOrEqual(292);
      for (let i = 0; i <= 200; i++) {
        const [x, y] = at(g.lanes.batteryHouse, i / 200);
        if (x > 320 - wide - 7) expect(y + 7).toBeLessThanOrEqual(g.houseWords);
      }
    }
  });

  it('is mirrored about the middle of the grid and the house', () => {
    const g = crossLayout(320);
    expect(g.sun[0]).toBe((g.grid[0] + g.house[0]) / 2);
    expect(g.battery[0]).toBe(g.sun[0]);
    // every lane into the house arrives 6 px off its ring
    for (const key of ['sunHouse', 'gridHouse', 'batteryHouse'] as const)
      expect(dist(g.lanes[key].b, g.house)).toBeCloseTo(RING, 5);
  });
});

describe('the house’s arcs', () => {
  it('share the ring by origin, 4 px apart, and draw nothing for a share of 0', () => {
    const list = arcs([
      { key: 'solar', value: 0.54 },
      { key: 'battery', value: 0 },
      { key: 'grid', value: 0.46 },
    ]);
    expect(list.map((a) => a.key)).toEqual(['solar', 'battery', 'grid']);
    expect(Number(list[0]?.dash.split(' ')[0])).toBeCloseTo(0.54 * HOUSE_CIRC - 4, 1);
    expect(list[1]?.dash.startsWith('0.00 ')).toBe(true);
    expect(Number(list[2]?.offset)).toBeCloseTo(-0.54 * HOUSE_CIRC, 1);
  });
});

describe('pulses', () => {
  const l = lane([0, 0], 0, [200, 0], 0, 60);

  it('travel the lane up to the head, fading in and out', () => {
    const frames = pulseFrames(l, 193, 23, 6, 8);
    expect(frames[0]?.transform).toBe('translate(-23.00px, -3.00px) rotate(0.00deg)');
    expect(frames[frames.length - 1]?.transform).toMatch(/^translate\(170\.00px, -3\.00px\)/);
    expect(frames[0]?.opacity).toBe('0.000');
    expect(frames[frames.length - 1]?.opacity).toBe('0.000');
  });

  it('run at 24 → 72 px/s as a share of the house’s peak', () => {
    expect(pace(0, 6000)).toBe(24);
    expect(pace(6000, 6000)).toBe(72);
    expect(pace(12000, 6000)).toBe(72);
  });

  it('never more than eight on a card: every flowing lane its first, then the extras by strength', () => {
    const p = (key: string, watts: number, run = 300): Pulse => ({
      key,
      path: l,
      run,
      watts,
      ink: 'en-ink--solar',
      body: '',
    });
    expect(density(500, 120)).toBe(1);
    expect(density(4000, 300)).toBe(5);
    const counts = budget([p('small', 200), p('big', 4000), p('mid', 2000)], 'full');
    expect(counts.get('big')).toBe(5);
    expect(counts.get('mid')).toBe(2);
    expect(counts.get('small')).toBe(1);
    // the approved wide frame: six lanes, each moving
    const six = budget(
      [4600, 900, 300, 3700, 1200, 900].map((w, i) => p(`l${i}`, w, 160)),
      'full',
    );
    expect([...six.values()].every((n) => n >= 1)).toBe(true);
    expect([...six.values()].reduce((a, b) => a + b, 0)).toBe(8);
    expect([...budget([p('a', 4000), p('b', 4000)], 'calm').values()]).toEqual([1, 1]);
  });
});

describe('the scene', () => {
  const words: WayWords = {
    in: 'in',
    out: 'out',
    charging: 'charging',
    discharging: 'discharging',
    charged: 'charged',
    discharged: 'discharged',
  };
  const a = allocate({ solar: 3200, fromGrid: 1900, toGrid: 400, fromBattery: 0, toBattery: 600 });
  const origins = {
    allocation: a,
    solar: { tone: 'solar' as const },
    grid: { tone: 'grid' as const },
    battery: { tone: 'battery' as const },
  };
  const grid = (into: number, out: number, pair = true): SceneNode => ({
    kind: 'grid',
    ink: { tone: 'grid' },
    reading: { in: into, out },
    threshold: 10,
    pair,
  });

  it('#19: the grid imports and exports at once — two lanes, the export in the sun’s colour', () => {
    const [first, second] = lanesOf(grid(1900, 400), origins);
    expect(first).toMatchObject({ way: 'in', rest: false, hidden: false, ink: { tone: 'grid' } });
    expect(second).toMatchObject({
      way: 'out',
      rest: false,
      hidden: false,
      ink: { tone: 'solar' },
    });
    expect(said(grid(1900, 400), words)).toEqual({
      first: { value: 1900, way: 'in', out: false },
      second: { value: 400, way: 'out', out: true },
      idle: false,
    });
  });

  it('a grid that only exports turns its one lane round; the second waits hidden', () => {
    const [first, second] = lanesOf(grid(0, 1900), origins);
    expect(first).toMatchObject({ way: 'out', rest: false });
    expect(second).toMatchObject({ hidden: true });
  });

  it('a battery charging from the sun runs out of the house in the sun’s colour', () => {
    const battery: SceneNode = {
      kind: 'battery',
      ink: { tone: 'battery' },
      reading: { in: 0, out: 600 },
      threshold: 10,
      pair: false,
    };
    expect(lanesOf(battery, origins)).toEqual([
      { way: 'out', rest: false, hidden: false, watts: 600, ink: { tone: 'solar' } },
    ]);
    expect(said(battery, words).first).toEqual({ value: 600, way: 'charging', out: true });
    expect(said(battery, words, (total) => total > 0).first).toEqual({
      value: 600,
      way: 'charged',
      out: true,
    });
  });

  it('cheap hours: the grid charging the battery is lilac', () => {
    const night = allocate({
      solar: 0,
      fromGrid: 4200,
      toGrid: 0,
      fromBattery: 0,
      toBattery: 3600,
    });
    const battery: SceneNode = {
      kind: 'battery',
      ink: { tone: 'battery' },
      reading: { in: 0, out: 3600 },
      threshold: 10,
      pair: false,
    };
    expect(lanesOf(battery, { ...origins, allocation: night })[0]?.ink).toEqual({ tone: 'grid' });
  });

  it('a flow below its threshold rests, and its words say 0', () => {
    const solar: SceneNode = {
      kind: 'solar',
      ink: { tone: 'solar' },
      reading: { in: 4, out: 0 },
      threshold: 10,
      pair: false,
    };
    expect(lanesOf(solar, origins)[0]).toMatchObject({ way: 'in', rest: true });
    expect(said(solar, words)).toEqual({ first: { value: 0, way: '', out: false }, idle: true });
  });

  it('over a period every total is said as it is, rounded only by its decimals; under the threshold it rests (#109)', () => {
    // two decimals of a kWh, as `decimals: 2` writes a day's totals
    const reads = (total: number): boolean =>
      !writesZero(total, { unit: 'kWh', divisor: 1000, digits: 2 });
    // a day's 0.05 kWh of sun, a hair under the 50 Wh its lane rests below: Home Assistant's dashboard says 0.05
    const solar: SceneNode = {
      kind: 'solar',
      ink: { tone: 'solar' },
      reading: { in: 49.999999999997, out: 0 },
      threshold: 50,
      pair: false,
    };
    expect(said(solar, words, reads)).toEqual({
      first: { value: 49.999999999997, way: '', out: false },
      idle: true,
    });
    expect(lanesOf(solar, origins)[0]).toMatchObject({ rest: true });
    const battery: SceneNode = { ...solar, kind: 'battery', reading: { in: 0, out: 20 } };
    expect(said(battery, words, reads)).toEqual({
      first: { value: 20, way: 'charged', out: true },
      idle: true,
    });
    // both ways over the day: each said, the one that flowed lighting the figures
    expect(said({ ...grid(3000, 20), threshold: 50 }, words, reads)).toEqual({
      first: { value: 3000, way: 'in', out: false },
      second: { value: 20, way: 'out', out: true },
      idle: false,
    });
    // what its decimals write as 0.00 rests at 0, its way unsaid
    expect(said({ ...battery, reading: { in: 4, out: 0 } }, words, reads)).toEqual({
      first: { value: 0, way: '', out: false },
      idle: true,
    });
  });

  it('a node says its ways in its kind’s words, a moment’s or a period’s; the sun none', () => {
    expect(waysOf('solar', words, false)).toBeNull();
    expect(waysOf('grid', words, true)).toEqual(['in', 'out']);
    expect(waysOf('battery', words, false)).toEqual(['discharging', 'charging']);
    expect(waysOf('vehicle', words, true)).toEqual(['discharged', 'charged']);
  });

  it('an unreadable source says nothing it does not know', () => {
    expect(said({ ...grid(0, 0), reading: { in: null, out: null } }, words).first.value).toBeNull();
  });
});

describe('1.3’s YAML', () => {
  const spec = FluvyEnergyFlowCard.aliases;
  it('reads the flat keys as sources, and never writes them', () => {
    const config = normaliseConfig(
      {
        type: 'custom:fluvy-energy-flow-card',
        solar_power: 'sensor.pv',
        grid_power: 'sensor.grid',
        grid_invert: true,
        battery_power: 'sensor.battery',
        battery_level: 'sensor.soc',
        home_power: 'sensor.house',
        flow_style: 'ribbons',
      },
      spec ?? {},
    );
    expect(config).toEqual({
      type: 'custom:fluvy-energy-flow-card',
      sources: [
        { type: 'solar', power: 'sensor.pv' },
        { type: 'grid', power: 'sensor.grid', invert: true },
        { type: 'battery', power: 'sensor.battery', level: 'sensor.soc' },
      ],
      home: 'sensor.house',
      flow_style: 'stream',
    });
  });

  it('a list under `power` is read as phases; sources written leave the flat keys unread', () => {
    const config = normaliseConfig(
      {
        type: 'custom:fluvy-energy-flow-card',
        sources: [{ type: 'grid', power: ['sensor.l1', 'sensor.l2'] }],
        grid_power: 'sensor.old',
      },
      spec ?? {},
    );
    expect(config).toEqual({
      type: 'custom:fluvy-energy-flow-card',
      sources: [{ type: 'grid', phases: ['sensor.l1', 'sensor.l2'] }],
    });
  });
});

describe('the sources editor', () => {
  const sources = lists.find((list) => list.key === 'sources');
  const names = (schema: readonly HaFormSchemaItem[]): string[] =>
    schema.flatMap((item) => (item.schema ? names(item.schema) : [item.name]));
  const shown = (item: Record<string, unknown>): string[] =>
    names(sources?.schemaOf?.(item) ?? sources?.schema ?? []);

  it('shows each kind what it is read by', () => {
    expect(shown({ type: 'grid' })).toEqual(
      expect.arrayContaining(['power', 'phases', 'import', 'export']),
    );
    expect(shown({ type: 'grid' })).not.toContain('level');
    expect(shown({ type: 'solar' })).not.toContain('export');
    expect(shown({ type: 'battery' })).toEqual(expect.arrayContaining(['level', 'capacity']));
    expect(shown({ type: 'battery' })).not.toContain('phases');
  });

  it('keeps a field the source already carries, and the same form for the same answer', () => {
    expect(shown({ type: 'solar', export: 'sensor.out' })).toContain('export');
    expect(sources?.schemaOf?.({ type: 'grid' })).toBe(sources?.schemaOf?.({ type: 'grid' }));
    expect(names(sources?.schemaOf?.({ type: 'nope' }) ?? [])).toEqual(
      names(sources?.schema ?? []),
    );
  });
});

describe('a long name on two lines (#183)', () => {
  /** A width of a character each, a Chinese or Japanese one two. */
  const width = (text: string): number =>
    [...text].reduce((w, c) => w + (/[\u3000-\u9fff]/.test(c) ? 2 : 1), 0);

  it('breaks at the space that leaves its lines the most even, its charge at the end of the second', () => {
    expect(brokenName('Wechselrichter Süddach', '', width)).toEqual(['Wechselrichter', 'Süddach']);
    expect(brokenName('East roof array', '', width)).toEqual(['East roof', 'array']);
    expect(brokenName('Garage battery', ' · 100 %', width)).toEqual(['Garage', 'battery']);
  });

  it('breaks between two Chinese or Japanese characters, never inside a word of another script', () => {
    expect(brokenName('逆变器 E2 南 MPPT 累计发电量', '', width)).toEqual([
      '逆变器 E2 南',
      'MPPT 累计发电量',
    ]);
    expect(brokenName('太陽光発電量', '', width)).toEqual(['太陽光', '発電量']);
    expect(brokenName('Wechselrichter', '', width)).toBeNull();
    // a small kana never begins a line
    expect(brokenName('バッテリー', '', width)?.[1]).not.toMatch(/^[ッー]/);
  });
});

describe('several sources of a kind', () => {
  if (!customElements.get('fluvy-energy-flow-card'))
    customElements.define('fluvy-energy-flow-card', FluvyEnergyFlowCard);
  const power = (id: string, state: string, name?: string) => ({
    entity_id: id,
    state,
    attributes: {
      unit_of_measurement: 'W',
      device_class: 'power',
      ...(name ? { friendly_name: name } : {}),
    },
    last_changed: '',
    last_updated: '',
  });
  interface House {
    /** The arrays' sensors' names, and the registries that tie them to their devices. */
    readonly names?: readonly [string, string];
    readonly entities?: Record<string, unknown>;
    readonly devices?: Record<string, unknown>;
  }
  /** The flow as it reads two arrays (E1, E2) and the grid bringing 300 W. */
  const sceneOf = async (
    e1: string,
    e2: string,
    house: House = {},
  ): Promise<{ houseValue: number | null; nodes: readonly { label: string }[] }> => {
    const card = document.createElement('fluvy-energy-flow-card') as FluvyEnergyFlowCard;
    card.setConfig({
      type: 'custom:fluvy-energy-flow-card',
      sources: [
        { type: 'solar', power: 'sensor.e1' },
        { type: 'solar', power: 'sensor.e2' },
        { type: 'grid', power: 'sensor.grid' },
      ],
    });
    card.hass = {
      language: 'en',
      locale: { language: 'en', number_format: 'language', time_format: '24' },
      config: {},
      themes: { darkMode: false },
      states: {
        'sensor.e1': power('sensor.e1', e1, house.names?.[0]),
        'sensor.e2': power('sensor.e2', e2, house.names?.[1]),
        'sensor.grid': power('sensor.grid', '300'),
      },
      entities: house.entities ?? {},
      devices: house.devices ?? {},
      areas: {},
      localize: (key: string) => key,
      callWS: async () => ({}),
    } as unknown as HomeAssistant;
    document.body.append(card);
    await card.updateComplete;
    const scene = (
      card as unknown as {
        build(): { houseValue: number | null; nodes: readonly { label: string }[] };
      }
    ).build();
    card.remove();
    return scene;
  };

  it('counts an array that cannot be read as nothing while another reads; none read, the house is unknown (#140)', async () => {
    // E1's inverter offline, E2 making 942 W: the house uses 1242 W
    expect((await sceneOf('unavailable', '942')).houseValue).toBe(1242);
    expect((await sceneOf('600', '942')).houseValue).toBe(1842);
    expect((await sceneOf('unavailable', 'unavailable')).houseValue).toBeNull();
  });

  /** The labels of two arrays whose sensors are named `names`, on devices the house names "Inverter E1" and "Garage inverter". */
  const labelsOf = async (names: readonly [string, string], devices = true): Promise<string[]> =>
    (
      await sceneOf('900', '700', {
        names,
        ...(devices
          ? {
              entities: {
                'sensor.e1': { entity_id: 'sensor.e1', device_id: 'd1' },
                'sensor.e2': { entity_id: 'sensor.e2', device_id: 'd2' },
              },
              devices: {
                d1: { id: 'd1', name: 'Inverter E1', name_by_user: null },
                d2: { id: 'd2', name: 'SPH 6000', name_by_user: 'Garage inverter' },
              },
            }
          : {}),
      })
    ).nodes.map((n) => n.label);

  it('#170: two arrays whose sensors read the same are named by their devices, as the house names them', async () => {
    expect(await labelsOf(['MPPT 累计发电量', 'MPPT 累计发电量'])).toEqual([
      'Inverter E1',
      'Garage inverter',
      'Grid',
    ]);
    // "Kitchen roof solar power" and "Garage roof solar power" both read "solar"
    expect(await labelsOf(['Kitchen roof solar power', 'Garage roof solar power'])).toEqual([
      'Inverter E1',
      'Garage inverter',
      'Grid',
    ]);
  });

  it('a house whose names differ reads as it did; without its devices, as its sensors are named', async () => {
    expect(await labelsOf(['East roof power', 'West roof power'])).toEqual([
      'East roof',
      'West roof',
      'Grid',
    ]);
    expect(await labelsOf(['MPPT 累计发电量', 'MPPT 累计发电量'], false)).toEqual([
      'MPPT 累计发电量',
      'MPPT 累计发电量',
      'Grid',
    ]);
    // both "array" short: told apart by their sensors' whole names, without the words of a reading (#183)
    expect(
      await labelsOf(['North garage roof array power', 'South house roof array power'], false),
    ).toEqual(['North garage roof array', 'South house roof array', 'Grid']);
  });

  it('a name in Chinese or Japanese is never cut to its last phrase (#170)', async () => {
    expect(await labelsOf(['Inverter E1 累计发电量', 'Inverter E2 累计发电量'], false)).toEqual([
      'Inverter E1 累计发电量',
      'Inverter E2 累计发电量',
      'Grid',
    ]);
    const named = (name: string) =>
      shortName({ name, unit: '', deviceClass: undefined } as unknown as EntityView);
    expect(named('東 屋根 発電量 本日')).toBe('東 屋根 発電量 本日');
    expect(named('Kitchen speaker')).toBe('speaker');
    expect(named('Garage')).toBe('Garage');
  });
});
