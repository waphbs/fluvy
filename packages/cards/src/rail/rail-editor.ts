import type { LovelaceConfigForm } from '@fluvy/core';
import type { BaseKey } from '../shared/base.js';

/**
 * The room rail's editor: nothing to fill in. Its rooms and which of them is current come from the dashboard that
 * builds it (`strategy/rooms.ts`), so the rail stands on the page as it is — no entity, no action, no field.
 */
export const base: readonly BaseKey[] = [];

export const keys: readonly string[] = [];

export function getConfigForm(): LovelaceConfigForm {
  return { schema: [] };
}
