// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  readDevice,
  SettingsStore,
  type EffectiveSettings,
  type HomeAssistant,
  type LookHandle,
  type SettingsHass,
} from '@fluvy/core';
import { DEMO_ENERGY_SOURCES, DEMO_EXTRAS, DEMO_ROOMS, demoHass } from '@fluvy/demo-home';
// Home Assistant's form, as a test's page stands it in: a card's options are edited in it
import { cardForm } from '../../shared/fixtures/editor.js';
import type { FluvyRowsEditor } from '../../shared/rows-editor.js';
import type { FluvyPanel } from '../panel.js';

type Config = { strategy?: Record<string, unknown>; views?: unknown[] };

/**
 * The demo home with Fluvy's settings in memory and one automatic dashboard (`fluvy-auto`, the home template's): what
 * its configuration says, and every one written.
 */
function fixture(
  admin: boolean,
  strategy: Record<string, unknown>,
  sources: readonly Record<string, unknown>[],
) {
  const data: Record<string, unknown> = { system: null, user: null };
  const layer = (type: string) => (type.includes('system') ? 'system' : 'user');
  const storage = {
    connection: {
      subscribeMessage: async (
        callback: (m: { value: unknown }) => void,
        message: { type: string },
      ) => {
        callback({ value: data[layer(message.type)] });
        return () => undefined;
      },
    },
    callWS: async (message: { type: string; value: unknown }) => {
      data[layer(message.type)] = message.value;
    },
  } as unknown as SettingsHass;
  const store = new SettingsStore(() => storage, undefined);
  const listeners = new Set<(settings: EffectiveSettings) => void>();
  const handle: LookHandle = {
    store,
    settings: () => store.effective,
    preview: () => undefined,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setWall: () => undefined,
    wearDevice: () => void readDevice(),
    stop: () => undefined,
  };
  store.start((settings) => listeners.forEach((listener) => listener(settings)));
  const demo = demoHass({ more: [...DEMO_EXTRAS, ...DEMO_ROOMS], sources });
  const saved: { config: Config } = { config: { strategy } };
  const written: Config[] = [];
  const hass = {
    ...demo,
    states: Object.fromEntries(
      Object.entries(demo.states).map(([entity_id, state]) => [
        entity_id,
        { entity_id, ...state, last_changed: '', last_updated: '' },
      ]),
    ),
    locale: { language: 'en' },
    themes: { darkMode: false },
    user: { id: 'u', name: 'U', is_admin: admin },
    config: { unit_system: { temperature: '°C', length: 'km' }, time_zone: 'Europe/Madrid' },
    callService: async () => undefined,
    panels: {
      'fluvy-auto': {
        component_name: 'lovelace',
        url_path: 'fluvy-auto',
        title: 'Fluvy auto',
        icon: 'fluvy:sun',
      },
    },
    localize: (key: string) => key,
    callWS: async (message: { type: string; url_path?: string | null; config?: Config }) => {
      if (message.type === 'lovelace/config') return saved.config;
      if (message.type === 'lovelace/config/save' && message.config) {
        written.push(message.config);
        saved.config = message.config;
        return undefined;
      }
      if (message.type === 'lovelace/dashboards/list')
        return [
          { id: 'fluvy_auto', url_path: 'fluvy-auto', title: 'Fluvy auto', show_in_sidebar: true },
        ];
      return demo.callWS(message);
    },
    formatEntityState: (s: { state: string }) => s.state,
  } as unknown as HomeAssistant;
  return { handle, hass, written };
}

const HOME = { type: 'custom:fluvy-home' };

async function mount(
  admin = true,
  strategy: Record<string, unknown> = HOME,
  sources: readonly Record<string, unknown>[] = DEMO_ENERGY_SOURCES,
) {
  await import('../define.js');
  const f = fixture(admin, strategy, sources);
  const panel = document.createElement('fluvy-panel') as FluvyPanel;
  panel.handle = f.handle;
  panel.hass = f.hass;
  panel.tab = 'dashboard';
  document.body.append(panel);
  const root = panel.shadowRoot!;
  /** Lets what was asked for land (the dashboards, Customise's file, the dashboard as it is read) and be drawn. */
  const settle = async (rounds = 6) => {
    for (let round = 0; round < rounds; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await panel.updateComplete;
    }
  };
  await settle();
  const row = (title: string) =>
    [...root.querySelectorAll<HTMLElement>('.fv-row')].find(
      (r) => r.querySelector('.fv-row__title')?.textContent?.trim() === title,
    );
  const part = (id: string) => root.querySelector<HTMLElement>(`.cz-part[data-part="${id}"]`);
  const parts = () =>
    [...root.querySelectorAll<HTMLElement>('.cz-part')].map((p) => p.dataset['part']);
  /** A part's row unfolded, as a tap on it does. */
  const unfold = async (id: string) => {
    part(id)!.querySelector<HTMLElement>(':scope > .fv-row')!.click();
    await settle(2);
    return part(id)!;
  };
  /** A button of an open row, by what it says to a reader. */
  const act = async (within: Element, label: string) => {
    [...within.querySelectorAll<HTMLButtonElement>('.fv-action')]
      .find((button) => button.getAttribute('aria-label') === label)!
      .click();
    await settle(2);
  };
  const flip = async (within: Element) => {
    within.querySelector<HTMLElement>('.fv-hit')!.click();
    await settle(2);
  };
  /** What the apply bar says ('' when nothing waits: a bar on its way out keeps its last words). */
  const bar = () =>
    root.querySelector('.pn-foot:not(.is-leaving) .pn-bar__text')?.textContent?.trim() ?? '';
  const press = async (text: string) => {
    [...root.querySelectorAll<HTMLButtonElement>('.pn-bar button')]
      .find((button) => button.textContent?.trim() === text)!
      .click();
    await settle();
  };
  const edit = () =>
    (panel.strategyEdits['fluvy-auto']?.['edit'] ?? undefined) as
      Record<string, Record<string, Record<string, unknown>>> | undefined;
  /** Waits for what a file fetched later draws (Customise's own, a card's editor). */
  const until = async (found: () => unknown) => {
    for (let tries = 0; tries < 400 && !found(); tries++) await settle(1);
  };
  /** Opens Customise on the dashboard, as a tap on its row does. */
  const open = async () => {
    row('Customise')!.click();
    await until(() => root.querySelector('.cz-part'));
  };
  return {
    ...f,
    panel,
    root,
    settle,
    until,
    row,
    part,
    parts,
    unfold,
    act,
    flip,
    bar,
    press,
    edit,
    open,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('Customise (#170)', () => {
  it('opens from a dashboard’s card and lists its views and the open view’s cards', async () => {
    const { root, row, open, parts } = await mount();
    expect(row('Customise')?.querySelector('.fv-row__sub')?.textContent?.trim()).toBe(
      'Hide, move and tune its views and cards',
    );
    expect(root.querySelector('.cz-top')).toBeNull();
    await open();
    expect(root.querySelector('.cz-top')).not.toBeNull();
    const chips = [...root.querySelectorAll('.cz-top .fv-chip')].map((c) => c.textContent?.trim());
    expect(chips.slice(0, 3)).toEqual(['Home', 'Rooms', 'Lights']);
    expect(chips).toEqual(expect.arrayContaining(['Kitchen', 'Bedroom']));
    expect(parts().slice(0, 3)).toEqual(['home/attention', 'home/lights', 'home/appliances']);
    // a part the house has nothing for takes no row
    expect(parts()).toContain('home/vacuum');
    expect(parts()).not.toContain('home/pets');
    // each row says what it is under its name, a list how much of it shows
    const text = (id: string, cls: string) =>
      root.querySelector(`.cz-part[data-part="${id}"] .${cls}`)?.textContent?.trim();
    expect(text('home/lights', 'fv-row__title')).toBe('Lights');
    expect(text('home/lights', 'fv-row__sub')).toMatch(/^\d+ of \d+ shown$/);
    expect(text('home/clock', 'fv-row__title')).toBe('Clock');
    expect(text('home/thermostat', 'fv-row__sub')).toBe('Thermostat');
  });

  it('is an administrator’s: anyone else reads why, and has no way in', async () => {
    const { panel, root, row, settle } = await mount(false);
    const customise = row('Customise')!;
    expect(customise.querySelector('.fv-row__sub')?.textContent?.trim()).toBe(
      'An administrator can hide, move and tune its views and cards',
    );
    expect(customise.classList.contains('fv-row--tap')).toBe(false);
    panel.customise('fluvy-auto');
    await settle(40);
    expect(root.querySelector('.cz-top')).toBeNull();
    expect(row('Customise')).toBeDefined();
  });

  it('hides a card and saves the strategy with the edit laid over what was saved', async () => {
    const before = {
      views: { 'room-gone': { hidden: true } },
      cards: { 'rooms/room:gone': { order: 0 }, 'home/flow': { hidden: true } },
      entities: { 'home/lights': { drop: ['light.nowhere'] } },
    };
    const m = await mount(true, { ...HOME, tile_size: 'compact', edit: before });
    expect(m.row('Customise')?.querySelector('.fv-row__sub')?.textContent?.trim()).toBe(
      'Customised: some of it is yours',
    );
    await m.open();
    expect(m.bar()).toBe('');
    // what was hidden before reads so, and shows again with its switch
    expect(m.part('home/flow')?.classList.contains('is-off')).toBe(true);
    await m.flip(m.part('home/clock')!);
    expect(m.bar()).toBe('Fluvy auto · Customise');
    await m.flip(m.part('home/weather')!);
    await m.flip(m.part('home/flow')!);
    expect(m.bar()).toBe('3 changes');
    await m.press('Save');
    expect(m.written).toEqual([
      {
        strategy: {
          type: 'custom:fluvy-home',
          tile_size: 'compact',
          edit: {
            // what the house no longer has is kept as it was
            views: before.views,
            cards: {
              'rooms/room:gone': { order: 0 },
              'home/clock': { hidden: true },
              'home/weather': { hidden: true },
            },
            entities: before.entities,
          },
        },
      },
    ]);
    expect(m.bar()).toBe('');
    expect(m.part('home/clock')?.classList.contains('is-off')).toBe(true);
  });

  it('discards what was not saved, and a change made back is none', async () => {
    const m = await mount();
    await m.open();
    await m.flip(m.part('home/clock')!);
    await m.flip(m.part('home/clock')!);
    expect(m.bar()).toBe('');
    await m.flip(m.part('home/clock')!);
    await m.press('Discard');
    expect(m.edit()).toBeUndefined();
    expect(m.part('home/clock')?.classList.contains('is-off')).toBe(false);
    expect(m.written).toEqual([]);
  });

  it('moves a card with one place, and puts it back with none', async () => {
    const m = await mount();
    await m.open();
    const order = m.parts();
    const [first, second, third] = order as [string, string, string];
    const row = await m.unfold(third);
    await m.act(row, 'Move up');
    expect(m.parts().slice(0, 3)).toEqual([first, third, second]);
    expect(Object.keys(m.edit()!['cards']!)).toHaveLength(1);
    await m.act(m.part(third)!, 'Move down');
    expect(m.parts()).toEqual(order);
    expect(m.edit()).toBeUndefined();
    // the first cannot go up, the last cannot go down
    const top = await m.unfold(first);
    const up = [...top.querySelectorAll<HTMLButtonElement>('.fv-action')].find(
      (b) => b.getAttribute('aria-label') === 'Move up',
    )!;
    expect(up.disabled).toBe(true);
  });

  it('thins out a list, adds to it what it takes and orders it', async () => {
    const m = await mount();
    await m.open();
    const lights = await m.unfold('home/lights');
    const items = () =>
      [...m.part('home/lights')!.querySelectorAll<HTMLElement>('.cz-item')].map(
        (item) => item.dataset['item'],
      );
    const [first, second] = items() as [string, string];
    await m.flip(lights.querySelector(`.cz-item[data-item="${first}"]`)!);
    expect(m.edit()!['entities']).toEqual({ 'home/lights': { drop: [first] } });
    // one left out waits at the list's foot, switched off; back on, the list is the house's again
    expect(items().at(-1)).toBe(first);
    await m.flip(m.part('home/lights')!.querySelector(`.cz-item[data-item="${first}"]`)!);
    expect(m.edit()).toBeUndefined();
    // Home Assistant's picker hands an entity over: a switch fits the lights' tiles, a camera does not
    const pick = async (value: string) => {
      m.part('home/lights')!
        .querySelector('ha-selector.cz-add')!
        .dispatchEvent(new CustomEvent('value-changed', { detail: { value } }));
      await m.settle(2);
    };
    await pick('camera.front_door');
    expect(m.edit()).toBeUndefined();
    await pick('switch.washing_machine_outlet');
    expect(m.edit()!['entities']).toEqual({
      'home/lights': { add: ['switch.washing_machine_outlet'] },
    });
    expect(items().at(-1)).toBe('switch.washing_machine_outlet');
    // an entity's own row unfolds its buttons: moved up, the list names only what was put first
    m.part('home/lights')!
      .querySelector<HTMLElement>(`.cz-item[data-item="${second}"] .fv-row`)!
      .click();
    await m.settle(2);
    await m.act(
      m.part('home/lights')!.querySelector(`.cz-item[data-item="${second}"]`)!,
      'Move up',
    );
    expect(items().slice(0, 2)).toEqual([second, first]);
    expect(m.edit()!['entities']!['home/lights']).toEqual({
      add: ['switch.washing_machine_outlet'],
      order: [second],
    });
    // one the person added is taken back with its switch
    await m.flip(
      m.part('home/lights')!.querySelector('.cz-item[data-item="switch.washing_machine_outlet"]')!,
    );
    expect(m.edit()!['entities']!['home/lights']).toEqual({ order: [second] });
  });

  it('edits a card’s options in its own form, keeping only what was changed', async () => {
    const m = await mount();
    await m.open();
    const clock = await m.unfold('home/clock');
    await m.act(clock, 'Options');
    await m.until(() => m.root.querySelector('dialog.cz-dialog fluvy-rows-editor'));
    const sheet = m.root.querySelector('dialog.cz-dialog')!;
    expect(sheet.querySelector('.fv-card__title')?.textContent?.trim()).toBe('Clock');
    const editor = sheet.querySelector('fluvy-rows-editor') as FluvyRowsEditor;
    await m.until(() => editor.shadowRoot?.querySelector('ha-form'));
    // the form holds the card as the house builds it
    expect(cardForm(editor).data['face']).toBe('digital');
    cardForm(editor).change('face', 'analog');
    await m.settle(2);
    expect(m.edit()!['cards']).toEqual({ 'home/clock': { options: { face: 'analog' } } });
    expect(m.part('home/clock')?.classList.contains('is-edited')).toBe(true);
    // a second change is laid beside the first
    await editor.updateComplete;
    cardForm(editor).change('show_week', true);
    await m.settle(2);
    expect(m.edit()!['cards']).toEqual({
      'home/clock': { options: { face: 'analog', show_week: true } },
    });
    // back to what the house draws, it is no option
    await editor.updateComplete;
    cardForm(editor).change('face', 'digital');
    await m.settle(2);
    await editor.updateComplete;
    cardForm(editor).change('show_week', false);
    await m.settle(2);
    expect(m.edit()).toBeUndefined();
  });

  it('asks before it resets a card, a view and the whole dashboard', async () => {
    const m = await mount(true, {
      ...HOME,
      edit: {
        views: { climate: { hidden: true } },
        cards: { 'home/clock': { hidden: true }, 'home/flow': { order: 0 } },
        entities: { 'home/lights': { drop: ['switch.patio_light'] } },
      },
    });
    await m.open();
    const lights = await m.unfold('home/lights');
    await m.act(lights, 'Reset');
    // the first tap arms it and says what the second does
    expect(m.edit()).toBeUndefined();
    expect(m.part('home/lights')!.querySelector('.cz-armed')?.textContent).toContain(
      'Tap again to draw this card as the house does',
    );
    await m.act(m.part('home/lights')!, 'Reset');
    expect(m.edit()).toEqual({
      views: { climate: { hidden: true } },
      cards: { 'home/clock': { hidden: true }, 'home/flow': { order: 0 } },
    });
    // the view: every card of it, the other views' kept
    m.row('This view')!.click();
    await m.settle(2);
    expect(m.row('Tap again')).toBeDefined();
    m.row('Tap again')!.click();
    await m.settle(2);
    expect(m.edit()).toEqual({ views: { climate: { hidden: true } } });
    // the dashboard: nothing left of the edit, which leaves its configuration
    m.row('The whole dashboard')!.click();
    await m.settle(2);
    m.row('Tap again')!.click();
    await m.settle(2);
    expect(m.panel.strategyEdits['fluvy-auto']).toEqual({ edit: undefined });
    await m.press('Save');
    expect(m.written).toEqual([{ strategy: { type: 'custom:fluvy-home' } }]);
    expect(m.row('The whole dashboard')).toBeUndefined();
  });

  it('hides a view and places it among the tabs, the first always shown', async () => {
    const m = await mount();
    await m.open();
    expect(m.row('Show this view')?.querySelector('.fv-row__value')?.textContent?.trim()).toBe(
      'Always',
    );
    const chip = (text: string) =>
      [...m.root.querySelectorAll<HTMLElement>('.cz-top .fv-chip')].find(
        (c) => c.textContent?.trim() === text,
      )!;
    chip('Lights').click();
    await m.settle(2);
    expect(m.parts()[0]).toMatch(/^lights\/lights:/);
    await m.flip(m.row('Show this view')!);
    expect(m.edit()).toEqual({ views: { lights: { hidden: true } } });
    await m.flip(m.row('Show this view')!);
    const step = async (label: string) => {
      m.root.querySelector<HTMLButtonElement>(`.cz-steps [aria-label="${label}"]`)!.click();
      await m.settle(2);
    };
    await step('Earlier');
    await step('Earlier');
    // first among the tabs: its chip leads them, with one place
    expect(m.edit()).toEqual({ views: { lights: { order: 0 } } });
    expect(m.root.querySelector('.cz-top .fv-chip')?.textContent?.trim()).toBe('Lights');
    await step('Later');
    await step('Later');
    expect(m.edit()).toBeUndefined();
  });

  it('adds a card of the person’s own to a view, and takes it out again', async () => {
    const m = await mount();
    await m.open();
    m.row('Add a card')!.click();
    await m.settle(2);
    const yaml = () => m.root.querySelector('ha-selector.cz-yaml')!;
    const add = () =>
      [...m.root.querySelectorAll<HTMLButtonElement>('.cz-pair .fv-btn')].find(
        (b) => b.textContent?.trim() === 'Add',
      )!;
    // nothing to add until the YAML names a card's type
    expect(add().disabled).toBe(true);
    const note = { type: 'markdown', content: 'Bins on Tuesday' };
    yaml().dispatchEvent(new CustomEvent('value-changed', { detail: { value: note } }));
    await m.settle(2);
    add().click();
    await m.settle(2);
    expect(m.edit()).toEqual({ views: { home: { add: [note] } } });
    expect(m.parts().at(-1)).toBe('home/own:0');
    const own = await m.unfold('home/own:0');
    await m.act(own, 'Remove');
    expect(m.edit()).toBeUndefined();
  });

  it('lists what the Energy dashboard charts and forecasts, each by its card’s own words', async () => {
    // the Energy dashboard links a forecast to the array: tomorrow's production has a card
    const sources = DEMO_ENERGY_SOURCES.map((source) =>
      source['type'] === 'solar'
        ? { ...source, config_entry_solar_forecast: ['forecast'] }
        : source,
    );
    const m = await mount(true, { type: 'custom:fluvy-energy' }, sources);
    await m.open();
    const chip = (text: string) =>
      [...m.root.querySelectorAll<HTMLElement>('.cz-top .fv-chip')].find(
        (c) => c.textContent?.trim() === text,
      )!;
    const text = (id: string, cls: string) =>
      m.root.querySelector(`.cz-part[data-part="${id}"] .${cls}`)?.textContent?.trim();
    chip('Today').click();
    await m.settle(2);
    expect(m.parts()).toEqual([
      'today/period',
      'today/day_flow',
      'today/sankey',
      'today/score',
      'today/day_balance',
      'today/usage',
      'today/usage_water',
      'today/usage_gas',
    ]);
    expect(
      ['period', 'usage', 'usage_water', 'usage_gas'].map((id) =>
        text(`today/${id}`, 'fv-row__title'),
      ),
    ).toEqual(['Period', 'Energy usage', 'Water usage', 'Gas usage']);
    await m.flip(m.part('today/usage_water')!);
    expect(m.edit()).toEqual({ cards: { 'today/usage_water': { hidden: true } } });
    expect(text('today/usage_water', 'fv-row__sub')).toBe('Hidden');
    // the electricity's row is not marked by its neighbour's edit: no id is the head of another's
    expect(text('today/usage', 'fv-row__sub') ?? '').toBe('');
    await m.flip(m.part('today/usage_water')!);
    expect(m.edit()).toBeUndefined();

    chip('Production').click();
    await m.settle(2);
    expect(m.parts().slice(0, 4)).toEqual([
      'production/production',
      'production/tomorrow',
      'production/ahead',
      'production/history',
    ]);
    // today's and tomorrow's read the same meter: what each is stands under its name
    expect(text('production/tomorrow', 'fv-row__title')).toBe(
      text('production/production', 'fv-row__title'),
    );
    expect(text('production/production', 'fv-row__sub')).toBe('Production');
    expect(text('production/tomorrow', 'fv-row__sub')).toBe('Tomorrow · forecast');
    await m.flip(m.part('production/tomorrow')!);
    expect(m.edit()).toEqual({ cards: { 'production/tomorrow': { hidden: true } } });
    expect(text('production/production', 'fv-row__sub')).toBe('Production');
  });

  it('opens on the dashboard its address names', async () => {
    const m = await mount();
    m.panel.route = { prefix: '/fluvy', path: '/dashboard/fluvy-auto' };
    await m.until(() => m.root.querySelector('.cz-part'));
    expect(m.root.querySelector('.cz-top')).not.toBeNull();
    m.root.querySelector<HTMLButtonElement>('.cz-top .fv-round')!.click();
    await m.settle(2);
    expect(m.root.querySelector('.cz-top')).toBeNull();
    expect(m.row('Customise')).toBeDefined();
  });
});
