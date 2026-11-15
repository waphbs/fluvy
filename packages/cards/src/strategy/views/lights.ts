import type { AreaRegistryEntry } from '@fluvy/core';
import { flowed, lightGroups } from '../layout.js';
import { roomParts, roomPath, roomRail, railFirst, type RoomBack } from '../rooms.js';
import type { Section, StrategyContext, View, ViewSpec } from '../types.js';
import { lightsView } from './home.js';

/*
 * The lights dashboard (`custom:fluvy-lights`): every light at once on its first page, each room's own on a page of
 * its own, and the rail at the top of both so a room steps to its neighbours without going back to the list.
 */

/** Every light, by room, as the home dashboard's lights view draws it. */
export const LIGHT_VIEWS: readonly ViewSpec[] = [
  {
    key: 'lights',
    icon: 'fluvy:bulb',
    title: 'room.lights',
    build: (ctx) => railFirst(ctx, lightsView(ctx)),
    when: (ctx) => ctx.home.lights.length > 0,
  },
];

/** A room's page on the lights dashboard: its rail and its lights alone. */
export function lightsRoomView(
  ctx: StrategyContext,
  area: AreaRegistryEntry,
  columns: number,
  back: RoomBack,
): View {
  const sections: Section[] = [
    ...flowed(
      ctx,
      [
        roomRail(ctx, roomPath(ctx.base, area)),
        ...lightGroups(ctx, roomParts(ctx.home, area.area_id).lights, true),
      ],
      [],
      columns,
    ),
  ];
  return {
    title: area.name,
    icon: area.icon ?? 'fluvy:home',
    path: `room-${area.area_id}`,
    type: 'sections',
    max_columns: columns,
    subview: true,
    back_path: back.path,
    sections,
  };
}
