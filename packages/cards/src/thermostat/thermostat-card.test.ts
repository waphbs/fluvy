// @vitest-environment happy-dom
import {
  ensureLanguage,
  resolveEntity,
  setLanguageOverride,
  type HassEntity,
  type HomeAssistant,
  type LovelaceCardConfig,
} from '@fluvy/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { familiesDefined } from '../index.js';
import { shownNames } from '../shared/fixtures/editor.js';
import { visibleFields } from '../shared/form.js';
import {
  FluvyThermostatCard,
  modeLabel,
  modeOrder,
  stepTarget,
  type ThermostatCardConfig,
} from './thermostat-card.js';
import * as thermostatEditor from './thermostat-editor.js';

// the index fetches the lazy families, this card's among them: they land before this file's page goes
beforeAll(() => familiesDefined);

const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown>,
): HassEntity => ({
  entity_id,
  state,
  attributes: { friendly_name: 'Garderobe', ...attributes },
  last_changed: '2026-10-17T08:00:00Z',
  last_updated: '2026-10-17T08:00:00Z',
});

/** The #46 thermostat: a HomeMatic entity, whose modes come as Auto, Heat, Off. */
const homematic = entity('climate.garderobe', 'heat', {
  hvac_modes: ['auto', 'heat', 'off'],
  min_temp: 5,
  max_temp: 30.5,
  target_temp_step: 0.5,
  temperature: 19.5,
  current_temperature: 20.6,
});
const range = entity('climate.range', 'heat_cool', {
  hvac_modes: ['off', 'heat_cool'],
  supported_features: 2,
  min_temp: 15,
  max_temp: 30,
  target_temp_step: 0.5,
  target_temp_low: 20,
  target_temp_high: 24,
  hvac_action: 'idle',
});
const humidifier = entity('humidifier.bedroom', 'on', {
  available_modes: ['normal', 'sleep', 'off', 'auto', 'baby', 'comfort', 'boost'],
  mode: 'sleep',
  humidity: 50,
});
const tank = entity('water_heater.tank', 'eco', {
  operation_list: ['eco', 'heat_pump', 'off', 'electric', 'gas', 'performance', 'high_demand'],
  temperature: 50,
});

const house = (...states: HassEntity[]): HomeAssistant =>
  ({
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    config: { unit_system: { temperature: '°C' } },
    states: Object.fromEntries(states.map((s) => [s.entity_id, s])),
    entities: {},
    devices: {},
    areas: {},
    callService: vi.fn(async () => undefined),
  }) as unknown as HomeAssistant;

/** An entity as the card reads it. */
const viewOf = (state: HassEntity) => resolveEntity(house(state), state.entity_id);

const config = (more: Partial<ThermostatCardConfig> = {}): ThermostatCardConfig => ({
  type: 'custom:fluvy-thermostat-card',
  entity: 'climate.garderobe',
  ...more,
});

describe('the modes, in one order for the card and its editor (#46)', () => {
  it('draws a climate’s in Home Assistant’s order, Off first, whatever order the entity lists them in', () => {
    expect(modeOrder(viewOf(homematic))).toEqual(['off', 'heat', 'auto']);
    // a mode it has no word for goes after the ones it knows, in the entity's own order
    expect(
      modeOrder(
        viewOf(entity('climate.x', 'heat', { hvac_modes: ['boost', 'heat', 'eco', 'off'] })),
      ),
    ).toEqual(['off', 'heat', 'boost', 'eco']);
    expect(modeOrder(resolveEntity(house(), 'climate.none'))).toEqual([]);
  });

  it('lists a water heater’s operations as it does, and a humidifier’s Off before its modes', () => {
    expect(modeOrder(viewOf(tank))).toEqual(tank.attributes['operation_list']);
    expect(modeOrder(viewOf(humidifier))).toEqual([
      'off',
      'normal',
      'sleep',
      'auto',
      'baby',
      'comfort',
      'boost',
    ]);
  });

  it('shows the editor the order the card draws, so taking one out never turns the rest round', () => {
    const defaults = (state: HassEntity): unknown =>
      thermostatEditor.defaults(
        { type: 'custom:fluvy-thermostat-card', entity: state.entity_id },
        house(state),
      )['modes'];
    // the HomeMatic default drew Off · Heat · Auto but offered Auto · Heat · Off: unticking Heat wrote Auto · Off
    expect(defaults(homematic)).toEqual(['off', 'heat', 'auto']);
    // a humidifier and a water heater show their first six where the config lists none
    expect(defaults(humidifier)).toEqual(['off', 'normal', 'sleep', 'auto', 'baby', 'comfort']);
    expect(defaults(tank)).toHaveLength(6);
  });

  it('offers the entity’s own modes in the editor, worded as the card words them, dragged into order', () => {
    const hass = house(homematic);
    const choices = thermostatEditor.choices(config(), hass);
    expect(choices['modes']).toEqual([
      { value: 'off', label: 'Off' },
      { value: 'heat', label: 'Heat' },
      { value: 'auto', label: 'Auto' },
    ]);
    expect(thermostatEditor.choices(config({ entity: 'climate.none' }), hass)).toEqual({});
    const field = thermostatEditor.getConfigForm().schema.find((item) => item.name === 'modes');
    expect(field?.selector?.['select']).toMatchObject({ multiple: true, reorder: true });
  });

  it('words a mode as Fluvy does, else as Home Assistant does, else tidies it', () => {
    const hass = {
      ...house(),
      formatEntityState: (stateObj: HassEntity) =>
        stateObj.state === 'heat_pump' ? 'Wärmepumpe' : stateObj.state,
      formatEntityAttributeValue: (_: HassEntity, attribute: string, value: unknown) =>
        attribute === 'mode' && value === 'sleep' ? 'Schlafen' : String(value),
    } as unknown as HomeAssistant;
    expect(modeLabel(hass, viewOf(homematic), 'heat')).toBe('Heat');
    expect(modeLabel(hass, viewOf(tank), 'heat_pump')).toBe('Wärmepumpe');
    expect(modeLabel(hass, viewOf(tank), 'high_demand')).toBe('High demand');
    expect(modeLabel(hass, viewOf(tank), 'off')).toBe('Off');
    expect(modeLabel(hass, viewOf(humidifier), 'sleep')).toBe('Schlafen');
    expect(modeLabel(hass, viewOf(humidifier), 'baby')).toBe('Baby');
  });
});

describe('the card’s height and its grid', () => {
  const height = (more: Partial<ThermostatCardConfig>): number =>
    FluvyThermostatCard.layoutHeight(config(more));

  it('counts its modes by how they are drawn: tiles 128, chips or a full row 88, none hidden', () => {
    expect(height({ variant: 'compact' })).toBe(292);
    expect(height({ variant: 'compact', modes_style: 'chips' })).toBe(252);
    expect(height({ variant: 'compact', show_modes: false })).toBe(164);
    expect(height({ variant: 'compact', modes_style: 'full', show_modes: false })).toBe(164);
    expect(height({ variant: 'ruler' })).toBe(396);
    expect(height({ variant: 'ruler', modes_style: 'chips' })).toBe(356);
    expect(height({ variant: 'ruler', modes_style: 'chips', show_modes: false })).toBe(268);
    expect(height({})).toBe(484);
    expect(height({ modes_style: 'full' })).toBe(444);
  });

  it('is 56 shorter as a dial without its stepper, and the same as a readout without it', () => {
    expect(height({ show_stepper: false })).toBe(428);
    expect(height({ show_stepper: false, show_modes: false })).toBe(300);
    expect(height({ variant: 'compact', show_stepper: false })).toBe(292);
  });

  it('asks for half a section at the least as a compact card, as Home Assistant’s thermostat does', () => {
    const card = document.createElement('fluvy-thermostat-card') as FluvyThermostatCard;
    card.setConfig(config({ variant: 'compact' }) as LovelaceCardConfig);
    expect(card.getGridOptions()).toEqual({ columns: 6, rows: 'auto', min_columns: 6 });
    card.setConfig(config({ variant: 'ruler' }) as LovelaceCardConfig);
    expect(card.getGridOptions().min_columns).toBe(6);
    card.setConfig(config() as LovelaceCardConfig);
    expect(card.getGridOptions().min_columns).toBe(8);
  });
});

describe('a step from the stepper', () => {
  const limits = { min: 5, max: 30.5, step: 0.5 };

  it('moves a target one step on its grid, inside its range', () => {
    expect(stepTarget({ value: 9.5 }, 1, limits)).toEqual({ value: 10 });
    expect(stepTarget({ value: 30.5 }, 1, limits)).toEqual({ value: 30.5 });
    expect(stepTarget({ value: 5.2 }, -1, limits)).toEqual({ value: 5 });
  });

  it('moves the end of a range it was given, a step clear of the other, which stays', () => {
    expect(stepTarget({ low: 20, high: 24 }, 1, limits, 1)).toEqual({ low: 20, high: 24.5 });
    expect(stepTarget({ low: 20, high: 24 }, 1, limits, 0)).toEqual({ low: 20.5, high: 24 });
    // the low end stops a step under the high one; the high one a step over the low one
    expect(stepTarget({ low: 23.5, high: 24 }, 1, limits, 0)).toEqual({ low: 23.5, high: 24 });
    expect(stepTarget({ low: 20, high: 20.5 }, -1, limits, 1)).toEqual({ low: 20, high: 20.5 });
  });
});

describe('the value row of a range', () => {
  it('gives the stepper to the end pressed: its high end, then + sends the high end a step up', async () => {
    vi.useFakeTimers();
    const hass = house(range);
    const card = document.createElement('fluvy-thermostat-card') as FluvyThermostatCard;
    card.setConfig(config({ entity: 'climate.range', variant: 'compact' }) as LovelaceCardConfig);
    card.hass = hass;
    document.body.append(card);
    await card.updateComplete;
    const ends = (): HTMLButtonElement[] => [
      ...card.renderRoot.querySelectorAll<HTMLButtonElement>('.cl-end'),
    ];
    expect(ends().map((end) => end.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    ends()[1]!.click();
    await card.updateComplete;
    expect(ends().map((end) => end.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    const plus = card.renderRoot.querySelectorAll<HTMLButtonElement>('.fv-stepper__half')[1]!;
    plus.dispatchEvent(new MouseEvent('click', { detail: 0, bubbles: true }));
    vi.advanceTimersByTime(700);
    expect(hass.callService).toHaveBeenCalledWith(
      'climate',
      'set_temperature',
      { target_temp_low: 20, target_temp_high: 24.5 },
      { entity_id: 'climate.range' },
    );
    card.remove();
    vi.useRealTimers();
  });

  it('keeps the stepper in its place, still, while the device is off', async () => {
    const card = document.createElement('fluvy-thermostat-card') as FluvyThermostatCard;
    card.setConfig(config({ variant: 'compact' }) as LovelaceCardConfig);
    card.hass = house({ ...homematic, state: 'off' });
    document.body.append(card);
    await card.updateComplete;
    const halves = card.renderRoot.querySelectorAll<HTMLButtonElement>('.fv-stepper__half');
    expect(halves).toHaveLength(2);
    expect([...halves].every((half) => half.disabled)).toBe(true);
    card.remove();
  });

  it('is the card’s tap without a stepper, the readout with its words', async () => {
    const card = document.createElement('fluvy-thermostat-card') as FluvyThermostatCard;
    card.setConfig(config({ variant: 'compact', show_stepper: false }) as LovelaceCardConfig);
    card.hass = house(homematic);
    document.body.append(card);
    await card.updateComplete;
    expect(card.renderRoot.querySelector('.fv-stepper')).toBeNull();
    const tap = card.renderRoot.querySelector<HTMLButtonElement>('.cl-value .fv-tile__tap');
    expect(tap?.getAttribute('aria-label')).toBe('Garderobe · Target · Now 20.6° 19.5 °C');
    card.remove();
  });
});

describe('a picture of the person’s own in the head (#99)', () => {
  const ac = entity('image.living_ac', '2026-11-04T08:00:00+00:00', {
    entity_picture: 'https://example.com/ac.png',
  });
  const draw = async (
    more: Partial<ThermostatCardConfig>,
    states = [homematic, ac],
  ): Promise<FluvyThermostatCard> => {
    const card = document.createElement('fluvy-thermostat-card') as FluvyThermostatCard;
    card.setConfig(config(more) as LovelaceCardConfig);
    card.hass = house(...states);
    document.body.append(card);
    await card.updateComplete;
    return card;
  };
  const picture = (card: FluvyThermostatCard): string | null | undefined =>
    card.renderRoot
      .querySelector<HTMLImageElement>('.fv-card__head .fv-ico--picture > img')
      ?.getAttribute('src');

  it('stands in the circle’s place: an address, or an entity’s picture', async () => {
    let card = await draw({ image: 'image.living_ac' });
    expect(picture(card)).toBe('https://example.com/ac.png');
    expect(
      card.renderRoot.querySelector('.fv-card__head .fv-ico:not(.fv-ico--picture)'),
    ).toBeNull();
    card.remove();
    card = await draw({ image: 'https://example.com/daikin.png', variant: 'compact' });
    expect(picture(card)).toBe('https://example.com/daikin.png');
    card.remove();
  });

  it('leaves the circle where there is nothing to show, and stays out of reach, greyed with the card', async () => {
    let card = await draw({ image: 'javascript:alert(1)' });
    expect(picture(card)).toBeUndefined();
    expect(card.renderRoot.querySelector('.fv-card__head .fv-ico')).not.toBeNull();
    card.remove();
    card = await draw({ image: 'image.living_ac' }, [{ ...homematic, state: 'unavailable' }, ac]);
    expect(picture(card)).toBe('https://example.com/ac.png');
    expect(card.renderRoot.querySelector('.is-unavailable .fv-ico--picture')).not.toBeNull();
    card.remove();
  });

  it('gives way to the circle where it would not load, never a broken picture', async () => {
    const card = await draw({ image: 'https://example.com/gone.png' });
    card.renderRoot
      .querySelector('.fv-card__head .fv-ico--picture > img')
      ?.dispatchEvent(new Event('error'));
    await card.updateComplete;
    expect(picture(card)).toBeUndefined();
    expect(card.renderRoot.querySelector('.fv-card__head .fv-ico')).not.toBeNull();
    card.remove();
  });

  it('draws its entity’s new picture: the image entity is watched', async () => {
    const card = await draw({ image: 'image.living_ac' });
    const hass = card.hass!;
    const next = { ...ac, attributes: { entity_picture: 'https://example.com/ac-2.png' } };
    card.hass = { ...hass, states: { ...hass.states, 'image.living_ac': next } };
    await card.updateComplete;
    expect(picture(card)).toBe('https://example.com/ac-2.png');
    card.remove();
  });

  it('comes back once it loads again (Home Assistant restarted), the circle kept until then', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // the picture as the house serves it, tried out of sight: not there while it restarts, then back
    let serving = false;
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        decode = (): Promise<void> => (serving ? Promise.resolve() : Promise.reject(new Error()));
      },
    );
    try {
      const card = await draw({ image: '/local/ac.png' });
      card.renderRoot
        .querySelector('.fv-card__head .fv-ico--picture > img')
        ?.dispatchEvent(new Event('error'));
      await card.updateComplete;
      await vi.advanceTimersByTimeAsync(10_000);
      await card.updateComplete;
      expect(picture(card)).toBeUndefined();
      serving = true;
      await vi.advanceTimersByTimeAsync(20_000);
      await card.updateComplete;
      expect(picture(card)).toBe('/local/ac.png');
      card.remove();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe('the fan speeds and presets, in the page’s words (#142)', () => {
  /** An air conditioner whose integration sends Home Assistant's standard speeds, Fluvy's `mid` and one of its own. */
  const aircon = entity('climate.living_ac', 'cool', {
    hvac_modes: ['off', 'cool'],
    temperature: 23,
    fan_modes: ['auto', 'low', 'mid', 'high', 'quiet'],
    fan_mode: 'auto',
    preset_modes: ['eco', 'boost'],
    preset_mode: 'eco',
  });
  /** Home Assistant's own German, as its formatter says an attribute's value (else the value as it is). */
  const GERMAN: Record<string, string> = {
    'fan_mode.low': 'Niedrig',
    'fan_mode.high': 'Hoch',
    'preset_mode.boost': 'Boost',
    'preset_mode.eco': 'Eco',
  };
  const chips = async (): Promise<string[]> => {
    const card = document.createElement('fluvy-thermostat-card') as FluvyThermostatCard;
    card.setConfig(config({ entity: aircon.entity_id }) as LovelaceCardConfig);
    card.hass = {
      ...house(aircon),
      language: 'de',
      locale: { language: 'de', number_format: 'language', time_format: '24' },
      formatEntityAttributeValue: (_: HassEntity, attribute: string, value: unknown) =>
        GERMAN[`${attribute}.${String(value)}`] ?? String(value),
    } as unknown as HomeAssistant;
    document.body.append(card);
    await card.updateComplete;
    const words = [...card.renderRoot.querySelectorAll('.fv-chip')].map(
      (chip) => chip.textContent?.trim() ?? '',
    );
    card.remove();
    return words;
  };

  afterAll(() => setLanguageOverride(undefined));

  it('says Home Assistant’s word first, then Fluvy’s for a standard speed, then the word as sent', async () => {
    await ensureLanguage('de');
    // the presets, then the speeds: Home Assistant has no word for `mid`, nor for the integration's `quiet`
    expect(await chips()).toEqual(['Eco', 'Boost', 'Auto', 'Niedrig', 'Mittel', 'Hoch', 'Quiet']);
  });

  it('says Fluvy’s own where a person chose a language of their own, Home Assistant’s being the page’s', async () => {
    setLanguageOverride('en');
    expect(await chips()).toEqual(['Eco', 'Boost', 'Auto', 'Low', 'Mid', 'High', 'Quiet']);
  });

  it('draws a speed the entity runs at but does not offer as the chosen one, unselectable (#fan)', async () => {
    // an ESPHome air conditioner whose firmware lists Low and High while the unit answers "middle"
    const middle = entity('climate.hall_ac', 'heat', {
      hvac_modes: ['off', 'heat'],
      temperature: 23,
      fan_modes: ['low', 'high'],
      fan_mode: 'middle',
    });
    const card = await draw(middle);
    const drawn = [...card.renderRoot.querySelectorAll('.fv-chip')];
    const fan = drawn.filter((chip) => ['Low', 'Mid', 'High'].includes(chip.textContent?.trim() ?? ''));
    expect(fan.map((chip) => chip.textContent?.trim())).toEqual(['Mid', 'Low', 'High']);
    expect(fan[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(fan[0]?.getAttribute('aria-disabled')).toBe('true');
    expect(fan[1]?.getAttribute('aria-pressed')).toBe('false');
    card.remove();
  });
});

/** A ruler of 8 a letter, a badge its words and its sides: the widths a head is fitted by. */
const RULER = {
  width: (_cls: string, text: string) => text.length * 8,
  pill: (_cls: string, text: string, sides: number) => text.length * 8 + sides,
  clear() {},
};
const draw = async (
  state: HassEntity,
  width = 360,
  more: Partial<ThermostatCardConfig> = {},
  says: Partial<HomeAssistant> = {},
): Promise<FluvyThermostatCard> => {
  const card = document.createElement('fluvy-thermostat-card') as FluvyThermostatCard;
  Object.assign((card as unknown as { head: object }).head, { ruler: RULER });
  card.setConfig(config({ entity: state.entity_id, ...more }) as LovelaceCardConfig);
  card.hass = { ...house(state), ...says } as HomeAssistant;
  card.width = width;
  document.body.append(card);
  await card.updateComplete;
  return card;
};
/** The head's badge: its word and its tone; none where it gave way. */
const badge = (card: FluvyThermostatCard): [word: string, tone: string] | null => {
  const pill = card.renderRoot.querySelector('.fv-card__head .fv-badge');
  return pill
    ? [pill.textContent?.trim() ?? '', /fv-badge--(\w+)/.exec(pill.className)?.[1] ?? '']
    : null;
};
const line = (card: FluvyThermostatCard): string =>
  card.renderRoot.querySelector('.fv-card__sub')?.textContent?.trim() ?? '';
describe('what it is doing, in the head (#185)', () => {
  const said = async (
    state: string,
    attributes: Record<string, unknown>,
    id = 'climate.garderobe',
  ): Promise<ReturnType<typeof badge>> => {
    const card = await draw(entity(id, state, { ...homematic.attributes, ...attributes }));
    const found = badge(card);
    card.remove();
    return found;
  };

  afterAll(() => setLanguageOverride(undefined));

  it('wears its action’s tone: idle and off quiet, whatever the mode, which the circle and the dial keep', async () => {
    expect(await said('heat', { hvac_action: 'heating' })).toEqual(['Heating', 'heat']);
    // Idle wore the heating tone, and read as heating
    expect(await said('heat', { hvac_action: 'idle' })).toEqual(['Idle', 'neutral']);
    expect(await said('heat', { hvac_action: 'off' })).toEqual(['Off', 'neutral']);
    expect(await said('cool', { hvac_action: 'cooling' })).toEqual(['Cooling', 'cool']);
    expect(await said('cool', { hvac_action: 'idle' })).toEqual(['Idle', 'neutral']);
    expect(await said('dry', { hvac_action: 'drying' })).toEqual(['Drying', 'dry']);
    expect(await said('fan_only', { hvac_action: 'fan' })).toEqual(['Fan', 'fan']);
    const card = await draw(
      entity('climate.garderobe', 'heat', { ...homematic.attributes, hvac_action: 'idle' }),
    );
    expect(card.renderRoot.querySelector('.fv-card__head .fv-ico--heat')).not.toBeNull();
    expect(card.renderRoot.querySelector('fluvy-dial')?.tone).toBe('heat');
    card.remove();
  });

  it('says every action Home Assistant knows, preheating and defrosting too, in the heating tone', async () => {
    expect(await said('heat', { hvac_action: 'preheating' })).toEqual(['Preheating', 'heat']);
    expect(await said('heat', { hvac_action: 'defrosting' })).toEqual(['Defrosting', 'heat']);
    // one that is none of Home Assistant's is said as it is sent, tidied, in its mode's tone
    expect(await said('cool', { hvac_action: 'self_cleaning' })).toEqual(['Self cleaning', 'cool']);
  });

  it('says the mode where the entity says no action, in the mode’s tone, and Off quiet', async () => {
    expect(await said('heat', {})).toEqual(['Heat', 'heat']);
    expect(await said('cool', { hvac_action: null })).toEqual(['Cool', 'cool']);
    expect(await said('off', {})).toEqual(['Off', 'neutral']);
  });

  it('says a humidifier’s action, and a water heater or a humidifier that is off quiet', async () => {
    const humid = (state: string, action?: string): ReturnType<typeof said> =>
      said(
        state,
        { ...humidifier.attributes, ...(action ? { action } : {}) },
        'humidifier.bedroom',
      );
    expect(await humid('on', 'humidifying')).toEqual(['Humidifying', 'water']);
    expect(await humid('on', 'idle')).toEqual(['Idle', 'neutral']);
    expect(await humid('on')).toEqual(['On', 'water']);
    expect(await humid('off')).toEqual(['Off', 'neutral']);
    expect(await said('eco', tank.attributes, 'water_heater.tank')).toEqual(['Eco', 'heat']);
    expect(await said('off', tank.attributes, 'water_heater.tank')).toEqual(['Off', 'neutral']);
  });

  /** Home Assistant's own German for an action, as its formatter says an attribute's value. */
  const german = {
    language: 'de',
    locale: { language: 'de', number_format: 'language', time_format: '24' },
    formatEntityAttributeValue: (_: HassEntity, attribute: string, value: unknown) =>
      attribute === 'hvac_action' && value === 'idle' ? 'Leerlauf' : String(value),
  } as unknown as Partial<HomeAssistant>;
  const idle = entity('climate.garderobe', 'heat', {
    ...homematic.attributes,
    hvac_action: 'idle',
    current_humidity: 46,
  });

  it('says Home Assistant’s own word for the action, Fluvy’s where it has none or the person chose a language', async () => {
    await ensureLanguage('de');
    let card = await draw(idle, 360, {}, german);
    expect(badge(card)).toEqual(['Leerlauf', 'neutral']);
    card.remove();
    // Home Assistant has no word of its own here: its formatter hands the value back, and Fluvy's stands
    const heating = { ...idle, attributes: { ...idle.attributes, hvac_action: 'heating' } };
    card = await draw(heating, 360, {}, german);
    expect(badge(card)).toEqual(['Heizt', 'heat']);
    card.remove();
    setLanguageOverride('en');
    card = await draw(idle, 360, {}, german);
    expect(badge(card)).toEqual(['Idle', 'neutral']);
    card.remove();
    setLanguageOverride(undefined);
  });

  it('is never lost: where its badge cannot stand beside the name it leads the line, the rest giving way after it', async () => {
    // a phone's column: the badge beside the name, the humidity under it
    let card = await draw(idle);
    expect([badge(card), line(card)]).toEqual([['Idle', 'neutral'], '46 % RH']);
    card.remove();
    // 300 of content: "Idle · 46 % RH" (112) holds the line whole where the name left its badge no room
    card = await draw(idle, 340, { name: 'The thermostat of the cloakroom' });
    expect([badge(card), line(card)]).toEqual([null, 'Idle · 46 % RH']);
    card.remove();
    // half a section: the word alone, where it vanished and nothing said the action
    card = await draw(idle, 172);
    expect([badge(card), line(card)]).toEqual([null, 'Idle']);
    card.remove();
    // the person's own line comes after it, and out of reach the word is the state's
    card = await draw(idle, 340, { name: 'The thermostat of the cloakroom', subtitle: 'Upstairs' });
    expect(line(card)).toBe('Idle · Upstairs');
    card.remove();
    card = await draw({ ...idle, state: 'unavailable' }, 172);
    expect([badge(card), line(card)]).toEqual([null, 'Unavailable']);
    card.remove();
  });

  it('gives Home Assistant’s word way to Fluvy’s own where even alone the line would not hold it', async () => {
    const long = {
      ...german,
      formatEntityAttributeValue: () => 'Im Leerlauf und wartet',
    } as unknown as Partial<HomeAssistant>;
    // 132 of content: Home Assistant's 22 letters (176) hold no line; Fluvy's "Bereit" does
    const card = await draw(idle, 172, {}, long);
    expect([badge(card), line(card)]).toEqual([null, 'Bereit']);
    card.remove();
  });
});

describe('what it is asked to say with it (#185)', () => {
  /** A radiator valve idle, its position, its battery near its end and its window sensor on its device. */
  const valve = entity('climate.bedroom_trv', 'heat', {
    friendly_name: 'Bedroom TRV',
    hvac_modes: ['off', 'heat'],
    temperature: 18,
    current_temperature: 18.4,
    current_humidity: 46,
    hvac_action: 'idle',
  });
  const SIBLINGS = [
    entity('sensor.bedroom_trv_position', '0', { unit_of_measurement: '%' }),
    entity('sensor.bedroom_trv_battery', '8', {
      device_class: 'battery',
      unit_of_measurement: '%',
    }),
    entity('binary_sensor.bedroom_trv_window', 'off', { device_class: 'window' }),
    entity('switch.boiler', 'on', {}),
    entity('sensor.landing_humidity', '58', { unit_of_measurement: '%' }),
  ];
  /** The valve's house: its siblings (`moved`: some as they stand now), each on its device. */
  const home = (...moved: HassEntity[]): Partial<HomeAssistant> => {
    const all = [valve, ...SIBLINGS].map(
      (state) => moved.find((now) => now.entity_id === state.entity_id) ?? state,
    );
    return {
      states: Object.fromEntries(all.map((state) => [state.entity_id, state])),
      entities: Object.fromEntries(
        [valve, ...SIBLINGS.slice(0, 3)].map(({ entity_id }) => [
          entity_id,
          { entity_id, device_id: 'valve' },
        ]),
      ),
    } as unknown as Partial<HomeAssistant>;
  };
  const drawn = (more: Partial<ThermostatCardConfig> = {}, width = 360, ...moved: HassEntity[]) =>
    draw(valve, width, more, home(...moved));
  const warned = (card: FluvyThermostatCard): string =>
    card.renderRoot.querySelector('.fv-card__sub .cl-warn')?.textContent?.trim() ?? '';
  const open = { ...SIBLINGS[2]!, state: 'on' };

  it('says nothing more until it is asked: the house upgraded draws what it drew', async () => {
    const card = await drawn();
    expect([badge(card), line(card), warned(card)]).toEqual([['Idle', 'neutral'], '46 % RH', '']);
    card.remove();
  });

  it('says how far the valve is open beside the word, found on its device or named', async () => {
    let card = await drawn({ show_valve: true });
    expect(badge(card)).toEqual(['Idle · 0 %', 'neutral']);
    card.remove();
    card = await drawn({ valve_entity: 'sensor.landing_humidity' });
    expect(badge(card)).toEqual(['Idle · 58 %', 'neutral']);
    card.remove();
    // half a section: the word leads the line, its figure after it
    card = await drawn({ show_valve: true }, 172);
    expect([badge(card), line(card)]).toEqual([null, 'Idle · 0 %']);
    card.remove();
  });

  it('says a window open in the warning tone, in its badge and where it leads the line', async () => {
    let card = await drawn({ show_window: true });
    expect(badge(card)).toEqual(['Idle', 'neutral']);
    card.remove();
    card = await drawn({ show_window: true }, 360, open);
    expect(badge(card)).toEqual(['Window open', 'warning']);
    card.remove();
    card = await drawn({ show_window: true }, 172, open);
    expect([badge(card), line(card), warned(card)]).toEqual([null, 'Window open', 'Window open']);
    card.remove();
  });

  it('leads the line with a low battery in the warning ink, the word after it where it steps down', async () => {
    let card = await drawn({ show_battery: true });
    expect([badge(card), line(card), warned(card)]).toEqual([
      ['Idle', 'neutral'],
      'Battery 8 % · 46 % RH',
      'Battery 8 %',
    ]);
    card.remove();
    // 172: the line holds "Battery 8 %" and no more beside the circle; without it, the word too
    card = await drawn({ show_battery: true, show_icon: 'never' }, 212);
    expect([line(card), warned(card)]).toEqual(['Battery 8 % · Idle', 'Battery 8 %']);
    card.remove();
    card = await drawn({ show_battery: true, show_window: true }, 320, open);
    expect(warned(card)).toBe('Battery 8 % · Window open');
    card.remove();
    // a battery that is not low says nothing
    const charged = { ...SIBLINGS[1]!, state: '64' };
    card = await drawn({ show_battery: true }, 360, charged);
    expect([line(card), warned(card)]).toEqual(['46 % RH', '']);
    card.remove();
  });

  it('reads the action and the humidity from another entity where one is named', async () => {
    const card = await drawn({
      state_entity: 'switch.boiler',
      humidity_entity: 'sensor.landing_humidity',
    });
    expect([badge(card), line(card)]).toEqual([['Heating', 'heat'], '58 % RH']);
    card.remove();
  });

  it('hides the word where asked: no badge, and nothing of it in the line', async () => {
    let card = await drawn({ show_state: false, show_valve: true });
    expect([badge(card), line(card)]).toEqual([null, '46 % RH']);
    card.remove();
    card = await drawn({ show_state: false, show_battery: true }, 172);
    expect(line(card)).toBe('Battery 8 %');
    card.remove();
  });

  it('draws again as what it found changes: its window sensor is followed while it is read', async () => {
    const card = await drawn({ show_window: true });
    expect(badge(card)?.[0]).toBe('Idle');
    const hass = card.hass!;
    card.hass = { ...hass, states: { ...hass.states, [open.entity_id]: open } };
    await card.updateComplete;
    expect(badge(card)).toEqual(['Window open', 'warning']);
    card.remove();
  });

  it('keeps its height whatever it is asked: nothing of it is a row', () => {
    const asked = {
      show_valve: true,
      show_window: true,
      show_battery: true,
      state_entity: 'switch.boiler',
      humidity_entity: 'sensor.landing_humidity',
      show_state: false,
    };
    for (const variant of ['dial', 'compact', 'ruler'] as const)
      expect(FluvyThermostatCard.layoutHeight(config({ variant, ...asked }))).toBe(
        FluvyThermostatCard.layoutHeight(config({ variant })),
      );
  });

  it('shows in its editor what it found for each sensor it is asked to read, and writes none of it', () => {
    const hass = { ...house(valve), ...home() } as HomeAssistant;
    const shown = (more: Partial<ThermostatCardConfig>) =>
      thermostatEditor.defaults(config({ entity: valve.entity_id, ...more }), hass);
    expect(shown({})).toMatchObject({
      show_state: true,
      show_valve: false,
      show_window: false,
      show_battery: false,
    });
    expect(shown({})).not.toHaveProperty('valve_entity');
    expect(shown({ show_valve: true, show_window: true, show_battery: true })).toMatchObject({
      valve_entity: 'sensor.bedroom_trv_position',
      window_entity: 'binary_sensor.bedroom_trv_window',
      battery_entity: 'sensor.bedroom_trv_battery',
    });
    // what cannot act is not offered: a humidifier has no valve and no window, a hidden word no options
    const fields = (data: Record<string, unknown>) =>
      shownNames(visibleFields(thermostatEditor.getConfigForm().schema, data, hass));
    const climate = fields({ entity: valve.entity_id, show_state: true });
    expect(climate).toEqual(
      expect.arrayContaining(['state_entity', 'show_valve', 'valve_attribute', 'show_window']),
    );
    const humidifier = fields({ entity: 'humidifier.bedroom', show_state: true });
    expect(humidifier).toEqual(expect.arrayContaining(['show_state', 'state_entity']));
    expect(humidifier).not.toEqual(expect.arrayContaining(['show_valve']));
    expect(humidifier).not.toEqual(expect.arrayContaining(['humidity_entity']));
    const hidden = fields({ entity: valve.entity_id, show_state: false });
    expect(hidden).not.toEqual(expect.arrayContaining(['state_entity']));
    expect(hidden).toEqual(expect.arrayContaining(['show_battery', 'humidity_entity']));
  });
});
