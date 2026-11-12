import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = 'packages/cards/src/strategy/energy-roles.test.ts'
with open(path, encoding='utf-8') as f:
    text = f.read()

old_helper = """const reading = (
  id: string,
  friendly_name: string,
  state: string,
  device_class: 'power' | 'energy',
  platform?: string,
) => ({ id, friendly_name, state, device_class, platform });"""
new_helper = """const reading = (
  id: string,
  friendly_name: string,
  state: string,
  device_class: 'power' | 'energy' = 'energy',
  platform?: string,
  attributes?: Readonly<Record<string, unknown>>,
) => ({ id, friendly_name, state, device_class, platform, attributes });"""
assert old_helper in text
text = text.replace(old_helper, new_helper, 1)

old_roles = """  const home = new HomeRegistry({
    states: Object.fromEntries(
      readings.map(({ id, friendly_name, state, device_class }) => [
        id,
        {
          entity_id: id,
          state,
          attributes: {
            friendly_name,
            device_class,
            state_class: device_class === 'energy' ? 'total_increasing' : 'measurement',
            unit_of_measurement: device_class === 'energy' ? 'kWh' : 'W',
          },"""
new_roles = """  const home = new HomeRegistry({
    states: Object.fromEntries(
      readings.map(({ id, friendly_name, state, device_class, attributes }) => [
        id,
        {
          entity_id: id,
          state,
          attributes: {
            friendly_name,
            device_class,
            state_class: device_class === 'energy' ? 'total_increasing' : 'measurement',
            unit_of_measurement: device_class === 'energy' ? 'kWh' : 'W',
            ...attributes,
          },"""
assert old_roles in text
text = text.replace(old_roles, new_roles, 1)

old_day = """/** A forecast of a day: its total as the state, its hours in the attribute Solcast ships. */
const dayForecast = (id: string, name: string, state: string) => {
  const base = reading(id, name, state);
  return {
    ...base,
    attributes: {
      ...base.attributes,
      detailedHourly: Array.from({ length: 24 }, (_unused, hour) =>
        hour > 6 && hour < 19 ? 1 : 0,
      ),
    },
  };
};"""
new_day = """/** A forecast of a day: its total as the state, its hours in the attribute Solcast ships. */
const dayForecast = (id: string, name: string, state: string) =>
  reading(id, name, state, 'energy', undefined, {
    detailedHourly: Array.from({ length: 24 }, (_unused, hour) => (hour > 6 && hour < 19 ? 1 : 0)),
  });

/** The older name of the same helper, so the tests below read as they were written. */
const house = roles;"""
assert old_day in text
text = text.replace(old_day, new_day, 1)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(text)
print('patched test helpers')
