// the dashboards' words first: they are here before anything in the strategy's chunk says them
import './english.js';
import type { HomeAssistant } from '@fluvy/core';
import { appliancesView } from './appliances.js';
import { applyEdit, type DashboardEdit } from './edit.js';
import { moreHost } from './caps.js';
import { buildContext, framed, withCards } from './context.js';
import { roomView } from './rooms.js';
import { HOME_TEMPLATE, templateOf, viewsOf, type Template } from './templates.js';
import type { FluvyStrategyConfig, View } from './types.js';

/** An automatic dashboard: the template its type names, built from the house. Fetched when a dashboard asks. */
export async function generate(
  config: FluvyStrategyConfig,
  hass: HomeAssistant,
): Promise<{ views: View[] }> {
  return generateWith(templateOf(config.type) ?? HOME_TEMPLATE, config, hass);
}

/**
 * A template's dashboard: its views built from the house (the first always, the others when the house has what they
 * show and the configuration keeps them), each framed; then a subview per room the template opens, the one of every
 * appliance its Home leads to, and the ones the views' capped lists open (#78), each under the view it leads back to.
 */
export async function generateWith(
  template: Template,
  config: FluvyStrategyConfig,
  hass: HomeAssistant,
  base?: string,
): Promise<{ views: View[] }> {
  const built = await buildContext(config, hass, base);
  // a template without the greeting opens its columns with nothing
  const ctx = template.header === 'hello' ? built : { ...built, header: 0 };
  const hidden = new Set(config.hide ?? []);
  const edit = config.edit as DashboardEdit | undefined;
  const kept = viewsOf(template, ctx)
    .filter((spec, index) => index === 0 || !hidden.has(spec.key))
    .map((spec) => {
      const title = spec.name ?? ctx.t(spec.title);
      const more = moreHost(spec.key, title, spec.icon, template.columns);
      const sections = withCards(spec.build({ ...ctx, more }));
      return { spec, title, more, sections: applyEdit(edit, spec.key, sections) };
    })
    .filter(
      ({ spec, sections }, index) =>
        index === 0 || (spec.when ? spec.when(ctx) : sections.length > 0),
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
    const more = moreHost(
      `room-${area.area_id}`,
      area.name,
      area.icon ?? 'fluvy:home',
      template.columns,
    );
    const view = roomView({ ...ctx, more }, area, template.columns, back);
    // a room's own page takes the same edits as any other view, named by its path
    const sections = applyEdit(edit, view.path, view.sections);
    return { view: { ...view, sections }, more };
  });
  const appliances =
    template.appliances && ctx.home.applianceDevices.length
      ? [framed(appliancesView(ctx, template.columns), ctx, views, template)]
      : [];
  const lists = [...kept, ...rooms].flatMap(({ more }) => more.views);
  return {
    views: [
      ...framedViews,
      ...rooms.map(({ view }) => framed(view, ctx, views, template)),
      ...appliances,
      ...lists.map((view) => framed(view, ctx, views, template)),
    ],
  };
}
