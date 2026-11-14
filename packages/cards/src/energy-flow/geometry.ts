/**
 * The flow diagram's geometry, apart from Lit so it can be tested: cubic lanes, where they meet the house, where
 * each one's arrowhead sits and where its lane stops, and the frames a pulse travels them by. The rules are
 * design/language.md's § Energy flow:
 *
 * - A lane leaves its words 12 px after the widest words of its column and arrives 6 px off what it reaches.
 * - Its arrowhead is a solid rounded triangle, 9 long and 11 wide (6 × 7 on a 2.5 px lane); the head's tip IS the
 *   lane's end, and the lane stops 7 px (5) before it, so its round cap ends inside the head and nothing shows past it.
 * - On the house, contacts are slots: 20 px of arc between neighbouring lanes (lane 6 + head 8 + 6 clear); a source
 *   that can flow both ways at once (a grid read per phase, or by two sensors) is a pair of parallel lanes 16 px
 *   apart; the window is 90° above the house's left point and 48° below it (its words hang under the ring); pairs that
 *   cannot fit share one contact; a pair level with the house arrives level at ±8.
 * - The house's words hang under its ring, lowered as far as every lane passes them 4 px clear; where that would take
 *   them past the stage the card declares, the fan leans up as far as its window allows.
 */

import { FLOW_PITCH, FLOW_TOP, flowStage } from '../energy-family.js';

export type Point = readonly [number, number];
export interface Cubic {
  readonly a: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly b: Point;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const up4 = (v: number): number => Math.ceil(v / 4) * 4;

export const at = (l: Cubic, t: number): Point => {
  const u = 1 - t;
  return [
    u * u * u * l.a[0] + 3 * u * u * t * l.c1[0] + 3 * u * t * t * l.c2[0] + t * t * t * l.b[0],
    u * u * u * l.a[1] + 3 * u * u * t * l.c1[1] + 3 * u * t * t * l.c2[1] + t * t * t * l.b[1],
  ];
};

/** The direction of travel at t, in degrees (SVG: 0° right, 90° down), from the derivative. */
export const angleAt = (l: Cubic, t: number): number => {
  const u = 1 - t;
  const dx =
    3 * u * u * (l.c1[0] - l.a[0]) +
    6 * u * t * (l.c2[0] - l.c1[0]) +
    3 * t * t * (l.b[0] - l.c2[0]);
  const dy =
    3 * u * u * (l.c1[1] - l.a[1]) +
    6 * u * t * (l.c2[1] - l.c1[1]) +
    3 * t * t * (l.b[1] - l.c2[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
};

const n1 = (v: number): string => (Math.round(v * 10) / 10).toString();
export const pathOf = (l: Cubic): string =>
  `M${n1(l.a[0])},${n1(l.a[1])} C${n1(l.c1[0])},${n1(l.c1[1])} ${n1(l.c2[0])},${n1(l.c2[1])} ${n1(l.b[0])},${n1(l.b[1])}`;

/** The point at `deg` on a circle (0° right, 90° down: SVG's convention). */
export const onCircle = (c: Point, r: number, deg: number): Point => [
  c[0] + r * Math.cos(rad(deg)),
  c[1] + r * Math.sin(rad(deg)),
];

/** A lane leaving `a` along `degA` and arriving at `b` travelling along `degB`, one pull at both ends. */
export const lane = (a: Point, degA: number, b: Point, degB: number, pull: number): Cubic => ({
  a,
  c1: [a[0] + pull * Math.cos(rad(degA)), a[1] + pull * Math.sin(rad(degA))],
  c2: [b[0] - pull * Math.cos(rad(degB)), b[1] - pull * Math.sin(rad(degB))],
  b,
});

export const reverse = (l: Cubic): Cubic => ({ a: l.b, c1: l.c2, c2: l.c1, b: l.a });

const SAMPLES = 96;
/** Cumulative arc length at SAMPLES + 1 points. */
export function arcLengths(l: Cubic): number[] {
  const acc = [0];
  let prev = at(l, 0);
  for (let i = 1; i <= SAMPLES; i++) {
    const p = at(l, i / SAMPLES);
    acc.push((acc[i - 1] ?? 0) + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  return acc;
}

/** The parameter at arc length `s`. */
export function paramAt(acc: readonly number[], s: number): number {
  const total = acc[acc.length - 1] ?? 0;
  const target = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < acc.length - 1 && (acc[i] ?? 0) < target) i++;
  const lo = acc[i - 1] ?? 0;
  const hi = acc[i] ?? lo;
  return (i - 1 + (hi > lo ? (target - lo) / (hi - lo) : 0)) / SAMPLES;
}

/** The part of a cubic from 0 to t (de Casteljau). */
export function upTo(l: Cubic, t: number): Cubic {
  const mix = (p: Point, q: Point): Point => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const p01 = mix(l.a, l.c1);
  const p12 = mix(l.c1, l.c2);
  const p23 = mix(l.c2, l.b);
  const p012 = mix(p01, p12);
  const p123 = mix(p12, p23);
  return { a: l.a, c1: p01, c2: p012, b: mix(p012, p123) };
}

/** The travel direction at the end, from the last control point (exact). */
export function endAngle(l: Cubic): number {
  const from = Math.hypot(l.b[0] - l.c2[0], l.b[1] - l.c2[1]) > 0.01 ? l.c2 : l.c1;
  return (Math.atan2(l.b[1] - from[1], l.b[0] - from[0]) * 180) / Math.PI;
}

export const HEAD = {
  lane: { len: 9, half: 5.5, trim: 7 },
  thin: { len: 6, half: 3.5, trim: 5 },
} as const;
export type HeadSize = keyof typeof HEAD;

/** The head's outline with its tip at the origin pointing +x; the 1.5 px round stroke brings the tip to 0. */
export const headPath = (size: HeadSize): string => {
  const h = HEAD[size];
  return `M-0.75,0 L${-(h.len - 0.75)},${-h.half + 0.75} L${-(h.len - 0.75)},${h.half - 0.75} Z`;
};

/** What one direction of a lane draws: the lane up to its head, and the head at the end. */
export interface Drawn {
  /** The lane's path, from where the energy comes from to where the head begins. */
  readonly body: string;
  /** The head's transform: its tip on the lane's end, along the direction of travel. */
  readonly head: string;
  /** How far a pulse travels: the lane's length up to the head. */
  readonly run: number;
}

export function drawn(l: Cubic, size: HeadSize = 'lane', head = true): Drawn {
  const acc = arcLengths(l);
  const total = acc[acc.length - 1] ?? 0;
  const run = head ? Math.max(0, total - HEAD[size].trim) : total;
  return {
    body: pathOf(head ? upTo(l, paramAt(acc, run)) : l),
    head: `translate(${n1(l.b[0])},${n1(l.b[1])}) rotate(${n1(endAngle(l))})`,
    run,
  };
}

/* ------------------------------------------------------------------ pulses */

/**
 * The frames a pulse travels a lane by: its round head (the comet's cap centre, `lead` px into the comet) on the
 * lane at equal arc lengths up to `run` (the head's base), turned along the lane, fading in over the first tenth and
 * out over the last seventh. `transform` and `opacity` only: the compositor runs it without the main thread.
 */
export function pulseFrames(
  l: Cubic,
  run: number,
  lead: number,
  thickness: number,
  steps = 48,
): Keyframe[] {
  const acc = arcLengths(l);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const t = paramAt(acc, f * run);
    const [x, y] = at(l, t);
    const fade = f < 0.1 ? f / 0.1 : f > 0.86 ? (1 - f) / 0.14 : 1;
    frames.push({
      transform: `translate(${(x - lead).toFixed(2)}px, ${(y - thickness / 2).toFixed(2)}px) rotate(${angleAt(l, t).toFixed(2)}deg)`,
      opacity: fade.toFixed(3),
    });
  }
  return frames;
}

/* ------------------------------------------------------------------ rows */

export const TOP = FLOW_TOP; // the first node one pitch under the head's icon centre
export const PITCH = FLOW_PITCH;
export const TEXT = 56; // 44 circle + 12
export const RING = 34; // the house's ring (28) + 6
export const LANE_MIN = 56; // a lane shorter than this is no lane: the card becomes its list

/** How a node says its way: beside its figure, on the line under it, or by a glyph in its lane's ink. */
export type WayMode = 'inline' | 'line' | 'glyph';

/**
 * A node's words with its way said in one of them and its label on one line or two: as wide as they can read, and as
 * they read now.
 */
export interface WordsWidth {
  readonly way: WayMode;
  /** The label's lines: 1, or 2 or 3 where a long name breaks (#183; three where the card is read larger). */
  readonly lines: 1 | 2 | 3;
  readonly steady: number;
  readonly now: number;
}

export interface RowNode {
  /**
   * Its words' widths, measured by the card, in the ways it may say its way, the one it prefers first (#170), each with
   * its label on one line, then on two (#183). It takes the first whose words as they can read (its label at its
   * widest, a figure as wide as a house's usually is, each of its ways) leave a lane; where none does the card lists,
   * so at a width a card keeps its lanes or its list as its figures change.
   */
  readonly words: readonly WordsWidth[];
  /** Two lanes: a source that can flow both ways at the same moment. */
  readonly pair: boolean;
}
export interface RowsOptions {
  readonly width: number;
  readonly nodes: readonly RowNode[];
  /** The house's words: their height, and their width at the widest figure the card writes. */
  readonly houseWordsH: number;
  readonly houseWordsW: number;
  /** Where the energy goes, on the right (the house moves to the middle). */
  readonly consumers?: readonly { readonly wordsH: number; readonly wordsW: number }[];
  /** Whether a label may take three lines (#183); false where they would grow the card past its stage. */
  readonly three?: boolean;
}
export interface RowLane {
  /** The node's index, and the lane of a pair (0 above, 1 below). */
  readonly node: number;
  readonly index: 0 | 1;
  /** Drawn toward the house; a flow out of it travels the lane backwards. */
  readonly path: Cubic;
}
export interface RowsLayout {
  readonly narrow: boolean;
  readonly height: number;
  readonly house: Point;
  readonly nodes: readonly Point[];
  readonly consumers: readonly Point[];
  /** Where the lanes leave the words (x). */
  readonly tail: number;
  readonly lanes: readonly RowLane[];
  /** From the house out to each consumer. */
  readonly out: readonly Cubic[];
  /** Where the house's words begin (y). */
  readonly houseWords: number;
  /** How each node says its way, and on how many lines its label stands. */
  readonly ways: readonly WayMode[];
  readonly lines: readonly (1 | 2 | 3)[];
}

const toDeg = (px: number): number => (px / RING) * (180 / Math.PI);

/** A lane's middle keeps this far off words it passes: its half (3) and 4 clear. */
const CLEAR = 7;

/**
 * The top of words standing in the column [left, right], from `from` down: under every lane that enters the column, on
 * the 4 px grid where a lane lowers them.
 */
function wordsUnder(paths: readonly Cubic[], left: number, right: number, from: number): number {
  let top = from;
  for (const path of paths)
    for (let i = 0; i <= SAMPLES; i++) {
      const [x, y] = at(path, i / SAMPLES);
      if (x > left - CLEAR && x < right + CLEAR) top = Math.max(top, y + CLEAR);
    }
  return top > from ? up4(top) : from;
}

export function rowsLayout(o: RowsOptions): RowsLayout {
  const ys = o.nodes.map((_, i) => TOP + i * PITCH);
  const last = ys[ys.length - 1] ?? TOP;
  const consumers = o.consumers ?? [];
  const wide = consumers.length > 0;
  const house: Point = [wide ? o.width / 2 : o.width - 28, Math.round((TOP + last) / 2 / 4) * 4];
  const stage = flowStage(Math.max(1, o.nodes.length));
  // a card read larger (`--fluvy-zoom`) or on a small phone has less room: a lane may be shorter there rather than the
  // card becoming its list, the arrows read the same at 36 as at 56
  const laneMin = o.width < 260 ? 36 : o.width < 300 ? 44 : LANE_MIN;
  // each node's words as the first of its ways that leaves a lane, the card's list where none does; the lanes leave
  // after them, or after a figure wider than a house's usual as it reads now, as far as every lane stays one
  const leaves = (w: WordsWidth): boolean =>
    house[0] - RING - up4(TEXT + w.steady + 12) >= laneMin;
  // a label on three lines is the room a card read larger has (#183): a card at its usual width keeps two at most
  const fits = (w: WordsWidth): boolean =>
    w.lines < 3 || (o.three !== false && o.width < 300);
  const chosen = o.nodes.map((n) => n.words.find((w) => fits(w) && leaves(w)));
  const narrow = chosen.some((w) => !w);
  const tail = Math.min(
    up4(TEXT + Math.max(0, ...chosen.map((w) => (w ? Math.max(w.steady, w.now) : 0))) + 12),
    Math.floor((house[0] - RING - LANE_MIN) / 4) * 4,
  );
  const cys = consumers.map((_, i, all) =>
    all.length === 1 ? house[1] : Math.round(TOP + ((last - TOP) / (all.length - 1)) * i),
  );
  // consumers: mirrored on the right, the house's lanes out to them
  const out: Cubic[] = [];
  if (wide && !narrow) {
    const m = consumers.length;
    const ctail = o.width - up4(TEXT + Math.max(0, ...consumers.map((c) => c.wordsW)) + 12);
    const rise = m === 1 ? 0 : Math.min(60, 16 * (m - 1));
    const fall = m === 1 ? 0 : Math.min(48, 16 * (m - 1));
    consumers.forEach((_, i) => {
      const a = m === 1 ? 0 : -rise + ((rise + fall) / (m - 1)) * i;
      const p = onCircle(house, RING, a);
      out.push(lane(p, a, [ctail, cys[i] ?? house[1]], 0, (ctail - p[0]) * 0.45));
    });
  }
  // the slots: a single lane needs 20 px of arc to its neighbour; a pair is two lanes 16 px apart
  const gap = (a: RowNode, b: RowNode): number => 20 + (a.pair ? 8 : 0) + (b.pair ? 8 : 0);
  let need = o.nodes.slice(1).reduce((sum, b, k) => sum + gap(o.nodes[k] ?? b, b), 0);
  const share = toDeg(need) > 138;
  if (share) need = 20 * Math.max(0, o.nodes.length - 1);
  const span = toDeg(need);
  /** The lanes into the house, their fan's top `up` degrees above its left point. */
  const fan = (up: number): RowLane[] => {
    const lanes: RowLane[] = [];
    let angle = 180 + up;
    o.nodes.forEach((node, k) => {
      if (k > 0) angle -= toDeg(share ? 20 : gap(o.nodes[k - 1] ?? node, node));
      const row = ys[k] ?? TOP;
      const centre = onCircle(house, RING, angle);
      const tangent: Point = [Math.sin(rad(angle)), -Math.cos(rad(angle))];
      const level = node.pair && Math.abs(row - house[1]) <= 12;
      for (const index of node.pair ? ([0, 1] as const) : ([0] as const)) {
        const side = node.pair ? (index === 0 ? -8 : 8) : 0;
        const p: Point = level
          ? [house[0] - Math.sqrt(RING * RING - side * side), house[1] + side]
          : share || !node.pair
            ? centre
            : [centre[0] + tangent[0] * side, centre[1] + tangent[1] * side];
        lanes.push({
          node: k,
          index,
          path: lane([tail, row + side], 0, p, level ? 0 : angle - 180, (p[0] - tail) * 0.45),
        });
      }
    });
    return lanes;
  };
  // the house's words hang under its ring (centred under it beside consumers), as low as the lanes ask: a fan of four
  // rows, or of pairs, reaches 48° under the house and comes in through words wider than its ring (#170)
  const half = o.houseWordsW / 2;
  const under = (lanes: readonly RowLane[]): number =>
    wordsUnder(
      [...lanes.map((l) => l.path), ...out],
      wide ? house[0] - half : o.width - o.houseWordsW,
      wide ? house[0] + half : o.width,
      house[1] + 36,
    );
  // the fan centred on the house's left point, at most 48° of it below (the words hang there), at most 90° above; where
  // its words would hang past the stage the card declares, it leans up, 4° at a time, as far as 90° above
  let up = Math.min(90, span - Math.min(48, span / 2));
  let lanes = narrow ? [] : fan(up);
  let houseWords = under(lanes);
  while (!narrow && houseWords + o.houseWordsH > stage && up < 90) {
    up = Math.min(90, up + 4);
    const leaning = fan(up);
    const lower = under(leaning);
    if (lower < houseWords) [lanes, houseWords] = [leaning, lower];
  }
  const bottoms = [
    stage,
    houseWords + o.houseWordsH,
    ...cys.map((y, i) => y + Math.max(22, (consumers[i]?.wordsH ?? 36) / 2)),
  ];
  const height = up4(Math.max(...bottoms));
  // three lines under a name hang 4 px lower than the stage the diagram declares: the card keeps its stage and its two
  // lines there rather than growing (#183)
  if (o.three !== false && height > stage) return rowsLayout({ ...o, three: false });
  return {
    narrow,
    height,
    house,
    nodes: ys.map((y): Point => [22, y]),
    consumers: cys.map((y): Point => [o.width - 22, y]),
    tail,
    lanes,
    out,
    houseWords,
    ways: chosen.map((w) => w?.way ?? 'inline'),
    lines: chosen.map((w) => w?.lines ?? 1),
  };
}

/**
 * The rail: what comes into the house joins one 2.5 px track that runs into it; what goes out keeps a connector of
 * its own. The inflow's connector: right, a 12 px bend, down or up to the house's row, and on to the track.
 */
export function railIn(tail: number, y: number, trackX: number, houseY: number): string {
  const k = y < houseY ? 1 : y > houseY ? -1 : 0;
  // the bend is 12 px, or the whole drop when the row is closer than that to the house's
  const r = Math.min(12, Math.abs(houseY - y));
  return k
    ? `M${n1(tail)},${n1(y)} H${n1(trackX - r)} Q${n1(trackX)},${n1(y)} ${n1(trackX)},${n1(y + r * k)} V${n1(houseY)}`
    : `M${n1(tail)},${n1(y)} H${n1(trackX)}`;
}

/** The rail's track: from where the connectors join to the house's ring. */
export const railTrack = (trackX: number, house: Point): Cubic => ({
  a: [trackX, house[1]],
  c1: [trackX + 20, house[1]],
  c2: [house[0] - 54, house[1]],
  b: [house[0] - RING, house[1]],
});

/* ------------------------------------------------------------------ cross */

export type CrossKey =
  | 'sunGrid'
  | 'sunHouse'
  | 'sunBattery'
  | 'gridHouse'
  | 'gridBattery'
  | 'batteryHouse'
  | 'batteryGrid';
export interface CrossLayout {
  readonly height: number;
  readonly sun: Point;
  readonly grid: Point;
  readonly battery: Point;
  readonly house: Point;
  readonly lanes: Readonly<Record<CrossKey, Cubic>>;
  /** Where the house's words begin (y): under its ring, lower where a lane would pass them. */
  readonly houseWords: number;
}

/**
 * Home Assistant's arrangement in our idiom: the sun above, the grid left, the house right, the battery below,
 * mirror-symmetric about the middle of the grid and the house; every diagonal leaves at ±45° and arrives radially
 * with one pull. The battery → grid lane is its own curve (the reverse of grid → battery would arrive 6 px off the
 * battery's ring, not the grid's). The house's words (`houseWordsW` wide, at the right edge) hang under its ring,
 * lowered as far as the battery's lane passes them 4 px clear.
 */
export function crossLayout(width: number, houseWordsW = 0): CrossLayout {
  const grid: Point = [22, 150];
  const house: Point = [width - 28, 150];
  const mid = (grid[0] + house[0]) / 2;
  const sun: Point = [mid, 30];
  const battery: Point = [mid, 270];
  const off = 28; // a 44 node's ring (22) + 6
  const pull = 44;
  const lanes: Record<CrossKey, Cubic> = {
    sunGrid: lane(onCircle(sun, 22, 135), 135, onCircle(grid, off, -45), 135, pull),
    sunHouse: lane(onCircle(sun, 22, 45), 45, onCircle(house, RING, -135), 45, pull),
    sunBattery: lane([sun[0], sun[1] + 22], 90, [battery[0], battery[1] - off], 90, 60),
    gridHouse: lane([grid[0] + 22, grid[1]], 0, [house[0] - RING, house[1]], 0, 80),
    gridBattery: lane(onCircle(grid, 22, 45), 45, onCircle(battery, off, -135), 45, pull),
    batteryHouse: lane(onCircle(battery, 22, -45), -45, onCircle(house, RING, 135), -45, pull),
    batteryGrid: lane(onCircle(battery, 22, -135), -135, onCircle(grid, off, 45), -135, pull),
  };
  return {
    height: battery[1] + 22,
    sun,
    grid,
    battery,
    house,
    lanes,
    houseWords: wordsUnder(Object.values(lanes), width - houseWordsW, width, house[1] + 36),
  };
}

/* ------------------------------------------------------------------ the house */

/** The house's arcs: each source's share of what it uses, 3 px at r 26.5, 4 px between two. */
export const HOUSE_R = 26.5;
export const HOUSE_CIRC = 2 * Math.PI * HOUSE_R;
export interface Arc {
  readonly key: string;
  readonly dash: string;
  readonly offset: string;
}
export function arcs(shares: readonly { readonly key: string; readonly value: number }[]): Arc[] {
  const live = shares.filter((s) => s.value > 0);
  const gap = live.length > 1 ? 4 : 0;
  let offset = 0;
  return shares.map((s) => {
    const len = s.value > 0 ? Math.max(0, s.value * HOUSE_CIRC - gap) : 0;
    const arc = {
      key: s.key,
      dash: `${len.toFixed(2)} ${HOUSE_CIRC.toFixed(2)}`,
      offset: (-offset).toFixed(2),
    };
    offset += Math.max(0, s.value) * HOUSE_CIRC;
    return arc;
  });
}
