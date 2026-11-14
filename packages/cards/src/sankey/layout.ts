import type { FlowLink, FlowNode, Ink, SankeyModel } from './model.js';

/**
 * The diagram's geometry, top to bottom, in true proportions: ONE px-per-kWh scale for every bar and ribbon — the
 * largest that lets every row (its bars and the 8 px between them) hold in the column. Each row's words are packed
 * by their measured width: anchored at the bar's start, else at its end, else on the next tier, 16 px apart.
 *
 *   sources' words (tiers of 36, the nearest under) · 8 · bars 8 · ribbons 88 · bars 8 · 8 · targets' words · 12 ·
 *   the house's ribbons 88 (leaving under its words' band) · its devices' bars 8 · 8 · their words
 */

export const GAP = 8;
export const BAR = 8;
export const RIBBONS = 88;
export const TIER = 36;
/** Between two words of a tier. */
export const APART = 16;
/** Between a bar and its words. */
export const WORDS_GAP = 8;
/** Under the targets' words, before the house's ribbons leave. */
export const LEAVE_GAP = 12;
/** The stem the house's ribbons leave from: 4 tall, its bottom where they start. */
export const STEM = 4;
/**
 * Under this column (half a section) a tier holds its words at the column's start and at its end only: bars this
 * narrow would put every word at a start of its own, five columns of words where the eye reads two.
 */
export const NARROW = 200;

export interface LaidNode extends FlowNode {
  readonly x: number;
  readonly w: number;
}

export interface LaidLabel {
  readonly key: string;
  /** Left edge (on the 4 grid) and width of the words' box. */
  readonly x: number;
  readonly w: number;
  readonly tier: number;
  /** Anchored at its bar's end: the words are right-aligned there. */
  readonly end: boolean;
  /** Top of the words' box. */
  readonly y: number;
}

export interface Ribbon {
  readonly key: string;
  readonly d: string;
  readonly ink: Ink;
}

export interface SankeyLayout {
  readonly height: number;
  readonly scale: number;
  readonly y0: number;
  readonly y1: number;
  readonly y2: number;
  readonly top: readonly LaidNode[];
  readonly mid: readonly LaidNode[];
  readonly kids: readonly LaidNode[];
  readonly labels: readonly LaidLabel[];
  readonly ribbons: readonly Ribbon[];
  /** The house's stem, when its devices are drawn. */
  readonly stem: { readonly x: number; readonly y: number; readonly w: number } | null;
}

const rowSpan = (count: number): number => GAP * Math.max(0, count - 1);
const sum = (row: readonly FlowNode[]): number => row.reduce((s, n) => s + n.value, 0);

/** The one scale: every row, bars and gaps, holds in `width`. */
export function scaleOf(model: SankeyModel, width: number): number {
  const rows = [model.sources, model.targets, model.kids].filter((r) => r.length && sum(r) > 0);
  if (!rows.length) return 0;
  return Math.max(0, Math.min(...rows.map((r) => (width - rowSpan(r.length)) / sum(r))));
}

function lay(row: readonly FlowNode[], scale: number, x0 = 0): LaidNode[] {
  let x = x0;
  return row.map((n) => {
    const laid = { ...n, x, w: n.value * scale };
    x += laid.w + GAP;
    return laid;
  });
}

/**
 * Packs a row's words: each tries tier 0 at its bar's start (on the 4 grid), then at its bar's end (its box starts
 * on the grid, its right edge is the bar's end), then against the column's end (a column too narrow for either),
 * then the next tier; boxes of a tier stay 16 apart and inside `[0, width]`. A box wider than the column is the
 * column (its name ends in an ellipsis). Half a column (`NARROW`) keeps two places only, the column's start and its
 * end — the end first for a bar in the right half — so its words stand in two columns, in their bars' order.
 */
export function packLabels(
  row: readonly LaidNode[],
  measure: (key: string) => number,
  width: number,
): Omit<LaidLabel, 'y'>[] {
  const tiers: [number, number][][] = [];
  const fits = (t: number, a: number, b: number): boolean =>
    a >= 0 && b <= width && (tiers[t] ?? []).every(([s, e]) => b + APART <= s || a >= e + APART);
  const narrow = width < NARROW;
  return row.map((n) => {
    const lw = Math.min(width, Math.ceil(measure(n.key)));
    const right = n.x + n.w;
    const edge = Math.max(0, Math.floor((width - lw) / 4) * 4);
    // against the column's end, right-aligned there; a box as wide as the column reads from its start
    const atEnd = { x: edge, w: width - edge, end: edge > 0 };
    const atStart = { x: 0, w: lw, end: false };
    const places = narrow
      ? n.x + n.w / 2 > width / 2
        ? [atEnd, atStart]
        : [atStart, atEnd]
      : [
          { x: Math.floor(n.x / 4) * 4, w: lw, end: false },
          {
            x: Math.floor((right - lw) / 4) * 4,
            w: Math.round(right) - Math.floor((right - lw) / 4) * 4,
            end: true,
          },
          atEnd,
        ];
    // a tier of its own always holds the last place: the loop ends there at the latest
    for (let t = 0; ; t++)
      for (const p of places)
        if (fits(t, p.x, p.x + p.w)) {
          (tiers[t] ??= []).push([p.x, p.x + p.w]);
          return { key: n.key, x: p.x, w: p.w, tier: t, end: p.end };
        }
  });
}

const tiersOf = (labels: readonly Omit<LaidLabel, 'y'>[]): number =>
  labels.length ? 1 + Math.max(...labels.map((l) => l.tier)) : 0;

/**
 * Packs a row's words as a legend: left to right in the column, `APART` between two, a tier a line. Where a row's own
 * places would stack its words under each other, three tiers deep (#183), they read as a list instead of a pile.
 */
export function packLegend(
  row: readonly LaidNode[],
  measure: (key: string) => number,
  width: number,
): Omit<LaidLabel, 'y'>[] {
  const tiers: [number, number][][] = [];
  return row.map((n) => {
    const w = Math.min(width, Math.ceil(measure(n.key)));
    for (let t = 0; ; t++) {
      const tier = (tiers[t] ??= []);
      const last = tier[tier.length - 1];
      const x = last ? last[1] + APART : 0;
      if (x + w <= width) {
        tier.push([x, x + w]);
        return { key: n.key, x, w, tier: t, end: false };
      }
    }
  });
}

const f = (n: number): string => n.toFixed(1);

/** A ribbon from a band of `w0` at (x0, y0) down to a band of `w1` at (x1, y1): two cubics and their ends. */
export function ribbonPath(
  x0: number,
  w0: number,
  y0: number,
  x1: number,
  w1: number,
  y1: number,
): string {
  const my = (y0 + y1) / 2;
  return `M${f(x0)},${y0} C${f(x0)},${my} ${f(x1)},${my} ${f(x1)},${y1} L${f(x1 + w1)},${y1} C${f(x1 + w1)},${my} ${f(x0 + w0)},${my} ${f(x0 + w0)},${y0} Z`;
}

/**
 * Where each link leaves its source and meets its target: a source's links in the order of their targets, a
 * target's in the order of their sources (so no two cross unless the rows' order forces it). A node whose links
 * add up to more than its bar (meters that disagree by a rounding) squeezes them into it.
 */
function attach(
  links: readonly FlowLink[],
  top: readonly LaidNode[],
  mid: readonly LaidNode[],
  scale: number,
): { link: FlowLink; x0: number; w0: number; x1: number; w1: number }[] {
  const at = (row: readonly LaidNode[], key: string): number => row.findIndex((n) => n.key === key);
  const squeeze = (node: LaidNode, own: readonly FlowLink[]): number => {
    const total = own.reduce((s, l) => s + l.value * scale, 0);
    return total > node.w && total > 0 ? node.w / total : 1;
  };
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  const drawn = links.filter((l) => at(top, l.from) >= 0 && at(mid, l.to) >= 0);
  const leaving = [...drawn].sort(
    (p, q) => at(top, p.from) - at(top, q.from) || at(mid, p.to) - at(mid, q.to),
  );
  const offsets = new Map<FlowLink, { x0: number; w0: number }>();
  for (const l of leaving) {
    const node = top[at(top, l.from)] as LaidNode;
    const k = squeeze(
      node,
      drawn.filter((o) => o.from === l.from),
    );
    const w0 = l.value * scale * k;
    const x0 = node.x + (out.get(l.from) ?? 0);
    out.set(l.from, (out.get(l.from) ?? 0) + w0);
    offsets.set(l, { x0, w0 });
  }
  const arriving = [...drawn].sort(
    (p, q) => at(mid, p.to) - at(mid, q.to) || at(top, p.from) - at(top, q.from),
  );
  return arriving.map((l) => {
    const node = mid[at(mid, l.to)] as LaidNode;
    const k = squeeze(
      node,
      drawn.filter((o) => o.to === l.to),
    );
    const w1 = l.value * scale * k;
    const x1 = node.x + (into.get(l.to) ?? 0);
    into.set(l.to, (into.get(l.to) ?? 0) + w1);
    const from = offsets.get(l) as { x0: number; w0: number };
    return { link: l, ...from, x1, w1 };
  });
}

export function layoutSankey(
  model: SankeyModel,
  width: number,
  measure: (key: string) => number,
): SankeyLayout {
  const scale = scaleOf(model, width);
  const top = lay(model.sources, scale);
  const mid = lay(model.targets, scale);
  const house = mid.find((n) => n.key === 'house');
  const kidsWidth = sum(model.kids) * scale + rowSpan(model.kids.length);
  const kids =
    house && model.kids.length
      ? lay(model.kids, scale, Math.min(Math.max(0, house.x), Math.max(0, width - kidsWidth)))
      : [];

  const topWords = packLabels(top, measure, width);
  const midWords = packLabels(mid, measure, width);
  const kidsPacked = packLabels(kids, measure, width);
  // devices too many for a line: their own places would pile three tiers deep, so they read as a legend (#183)
  const kidWords = tiersOf(kidsPacked) > 1 ? packLegend(kids, measure, width) : kidsPacked;
  const y0 = tiersOf(topWords) * TIER + WORDS_GAP;
  const y1 = y0 + BAR + RIBBONS;
  const midY = y1 + BAR + WORDS_GAP;
  const leave = midY + tiersOf(midWords) * TIER + LEAVE_GAP;
  const y2 = leave + RIBBONS;
  const kidY = y2 + BAR + WORDS_GAP;
  const height = kids.length ? kidY + tiersOf(kidWords) * TIER : midY + tiersOf(midWords) * TIER;

  const labels: LaidLabel[] = [
    ...topWords.map((l) => ({ ...l, y: y0 - WORDS_GAP - (l.tier + 1) * TIER })),
    ...midWords.map((l) => ({ ...l, y: midY + l.tier * TIER })),
    ...kidWords.map((l) => ({ ...l, y: kidY + l.tier * TIER })),
  ];

  const ribbons: Ribbon[] = attach(model.links, top, mid, scale).map((r) => ({
    key: `${r.link.from}-${r.link.to}`,
    d: ribbonPath(r.x0, r.w0, y0 + BAR, r.x1, r.w1, y1),
    ink: r.link.ink,
  }));
  let stem: SankeyLayout['stem'] = null;
  if (house && kids.length) {
    stem = { x: house.x, y: leave - STEM, w: house.w };
    // the devices leave the house's stem side by side; more than the house (meters that disagree) is squeezed in
    const k =
      kidsWidth - rowSpan(kids.length) > house.w ? house.w / (kidsWidth - rowSpan(kids.length)) : 1;
    let hx = house.x;
    for (const kid of kids) {
      ribbons.push({
        key: `house-${kid.key}`,
        d: ribbonPath(hx, kid.w * k, leave, kid.x, kid.w, y2),
        ink: 'home',
      });
      hx += kid.w * k;
    }
  }
  return { height, scale, y0, y1, y2, top, mid, kids, labels, ribbons, stem };
}
