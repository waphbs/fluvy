// the dashboards' words first: they are here before anything in the strategy's chunk says them
import './english.js';
import { lookHandle, type HomeAssistant } from '@fluvy/core';
import { APPLIANCES_PATH, applianceSections, appliancesView } from './appliances.js';
import { moreHost } from './caps.js';
import { buildContext, framed, withCards } from './context.js';
import { arranged, editOf, pinned, tuned } from './edit.js';
import { roomSections, roomView } from './rooms.js';
import { HOME_TEMPLATE, templateOf, viewsOf, type Template } from './templates.js';
import type {
  DashboardEdit,
  FluvyStrategyConfig,
  MoreHost,
  Part,
  StrategyContext,
  View,
} from './types.js';

/** How long a browser's first visit waits for the house's settings before its dashboard is built without them, in ms. */
const SETTLE = 1500;

/**
 * An automatic dashboard: the template its type names, built from the house. Fetched when a dashboard asks. A browser
 * on its first visit keeps no copy of the house's settings yet, and a dashboard is built once: it waits for Home
 * Assistant's answer, never long, so the rooms stand in the house's order from the first frame (1.21, #189).
 */
export async function generate(
  config: FluvyStrategyConfig,
  hass: HomeAssistant,
): Promise<{ views: View[] }> {
  await Promise.race([
    lookHandle()?.settled(),
    new Promise<void>((resolve) => setTimeout(resolve, SETTLE)),
  ]);
  return generateWith(templateOf(config.type) ?? HOME_TEMPLATE, config, hass);
}

/** A view a part can be taken from: what its lists' way back says of it, and what builds its parts on a host. */
interface Source {
  readonly title: string;
  readonly icon: string;
  readonly build: (ctx: StrategyContext) => unknown;
}

/**
 * The views of a template's dashboard a part can be taken from, by their paths: its tabs, its rooms' pages, every
 * appliance's. All but the views the dashboard's own options leave out (`left`: its `hide`), which are no views of
 * it — Customise lists none of their cards; a view a person hid in Customise still gives its parts.
 */
function sourcesOf(
  template: Template,
  ctx: StrategyContext,
  left: ReadonlySet<string>,
): Map<string, Source> {
  const specs = viewsOf(template, ctx).filter((spec, index) => index === 0 || !left.has(spec.key));
  const sources = new Map<string, Source>();
  for (const spec of specs)
    sources.set(spec.key, {
      title: spec.name ?? ctx.t(spec.title),
      icon: spec.icon,
      build: spec.build,
    });
  // every room the template opens from those tabs, whichever of them a person hid
  const tabs = specs.map((spec) => spec.key);
  for (const { area, back } of template.rooms?.(ctx, tabs) ?? [])
    sources.set(`room-${area.area_id}`, {
      title: area.name,
      icon: area.icon ?? 'fluvy:home',
      build: (on) => roomSections(on, area, back, template.columns),
    });
  if (template.appliances)
    sources.set(APPLIANCES_PATH, {
      title: ctx.t('strategy.appliances'),
      icon: 'fluvy:washer',
      build: (on) => applianceSections(on, on.home.applianceDevices, template.columns),
    });
  return sources;
}

/** A dashboard's `edit` with one part shown, whatever the person did with it on its own view. */
const showing = (edit: DashboardEdit, id: string): DashboardEdit => ({
  ...edit,
  cards: { ...edit.cards, [id]: { ...edit.cards?.[id], hidden: false } },
});

/**
 * A template's dashboard: its views built from the house (the first always, the others when the house has what they
 * show and the configuration keeps them), each framed; then a subview per room the template opens, the one of every
 * appliance its Home leads to, and the ones the views' capped lists open (#78), each under the view it leads back to.
 * What a person changed on it (`edit`, #170) is laid over it as it is built: a view hidden or moved among the tabs, a
 * view's parts in their order, their own cards after them, and after those the parts of other views it shows as well
 * (`also`, #188), each built a second time on its own view. `built` gathers the views as they were built, each with
 * its parts (Customise lists them).
 */
export async function generateWith(
  template: Template,
  config: FluvyStrategyConfig,
  hass: HomeAssistant,
  base?: string,
  built?: MoreHost[],
): Promise<{ views: View[] }> {
  const made = await buildContext(config, hass, base);
  // a template without the greeting opens its columns with nothing
  const ctx = template.header === 'hello' ? made : { ...made, header: 0 };
  const edit = editOf(config.edit);
  const hidden = new Set([
    ...(config.hide ?? []),
    ...Object.keys(edit.views ?? {}).filter((path) => edit.views?.[path]?.hidden === true),
  ]);
  /** The views a part can be taken from: read the first time a view takes one. */
  let sources: Map<string, Source> | undefined;
  /** The subviews the lists among the parts taken open, each from the view that shows it. */
  const opened: View[] = [];
  /**
   * The parts of other views a view shows as well (`edit.views.<path>.also`), each under its id there (`also:<id>`):
   * its own view is built again on a host of its own, where the part shows whatever the person did with it there,
   * and its cards are taken from that, with the options the person gave it here over them (a title of its own on
   * this view). One the dashboard does not have (a room that was deleted, an id of the view itself) is a part without
   * cards: it keeps its place and draws nothing.
   */
  const takenBy = (path: string, title: string, icon: string): Part[] => {
    const also = edit.views?.[path]?.also;
    const ids = Array.isArray(also) ? also.filter((id) => typeof id === 'string') : [];
    return [...new Set<string>(ids)].map((id) => {
      const part = `also:${id}`;
      const cut = id.indexOf('/');
      const from = id.slice(0, cut);
      sources ??= sourcesOf(template, ctx, new Set(config.hide ?? []));
      const source = from === path ? undefined : sources.get(from);
      if (!source) return { id: part, cards: [] };
      const more = moreHost(from, source.title, source.icon, template.columns, showing(edit, id), {
        on: { path, title, icon },
      });
      source.build({ ...ctx, more });
      const cards = more.parts.find((p) => p.id === id.slice(cut + 1))?.cards ?? [];
      opened.push(
        ...more.views.filter((view) =>
          cards.some((card) => card['more_path'] === `${ctx.base}/${view.path}`),
        ),
      );
      const own = edit.cards?.[`${path}/${part}`]?.options;
      return { id: part, cards: cards.map((card) => tuned(cards, card, own)) };
    });
  };
  /** A view's host: what it is built on, kept for whoever asked for them. */
  const hostOf = (path: string, title: string, icon: string): MoreHost => {
    const more = moreHost(path, title, icon, template.columns, edit, {
      taken: takenBy(path, title, icon),
    });
    built?.push(more);
    return more;
  };
  const kept = pinned(
    viewsOf(template, ctx)
      .filter((spec, index) => index === 0 || !hidden.has(spec.key))
      .map((spec) => {
        const title = spec.name ?? ctx.t(spec.title);
        const more = hostOf(spec.key, title, spec.icon);
        return {
          spec,
          title,
          more,
          sections: withCards(arranged(more, spec.build({ ...ctx, more }))),
        };
      })
      .filter(
        ({ spec, sections }, index) =>
          index === 0 || (spec.when ? spec.when(ctx) : sections.length > 0),
      ),
    ({ spec }) => edit.views?.[spec.key]?.order,
  );
  const views = kept.map(({ spec, title, sections }): View => ({
    title,
    icon: spec.icon,
    path: spec.key,
    type: 'sections',
    max_columns: template.columns,
    sections,
  }));
  const framedViews = views.map((view) => framed(view, ctx, views, template));
  // a subview per room: reached from a room's card (never a tab), with the same frame
  const rooms = (
    template.rooms?.(
      ctx,
      views.map((view) => view.path),
    ) ?? []
  ).map(({ area, back }) => {
    const more = hostOf(`room-${area.area_id}`, area.name, area.icon ?? 'fluvy:home');
    const inner = { ...ctx, more };
    return {
      view: template.room
        ? template.room(inner, area, template.columns, back)
        : roomView(inner, area, template.columns, back),
      more,
    };
  });
  const appliances =
    template.appliances && ctx.home.applianceDevices.length
      ? [framed(appliancesView(ctx, template.columns, hostOf), ctx, views, template)]
      : [];
  const lists = [...[...kept, ...rooms].flatMap(({ more }) => more.views), ...opened];
  return {
    views: [
      ...framedViews,
      ...rooms.map(({ view }) => framed(view, ctx, views, template)),
      ...appliances,
      ...lists.map((view) => framed(view, ctx, views, template)),
    ],
  };
}
