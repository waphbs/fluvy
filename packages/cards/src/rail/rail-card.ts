import { navigate, type FluvyCardConfig, type LovelaceGridOptions } from '@fluvy/core';
import { chips, type ChipItem } from '@fluvy/ui';
import { css, html, type CSSResultGroup, type TemplateResult } from 'lit';
import { Card, onPageStyles, type CardEditor } from '../shared/base.js';

/** A room the rail offers: its name, its icon, where it opens. */
export interface RailRoom {
  readonly name: string;
  readonly icon?: string;
  readonly path: string;
}

export interface RoomRailCardConfig extends FluvyCardConfig {
  /** The rooms, in the house's order (the dashboard's rooms, not every area). */
  rooms?: readonly RailRoom[];
  /** The path the page it stands on has: its room's chip is the one marked. */
  current?: string;
}

/**
 * The rooms of a dashboard in one rail: a horizontal row of chips, each a room's icon and name, scrolling sideways
 * where the row is wider than the page (#193, the rooms page's top). The room the page belongs to is the chip marked
 * current (`aria-current`), so a room's own page still says where it stands and lets one step to its neighbours.
 *
 * No surface of its own: the rail stands on the page as a heading does, and takes its ink from the page's background.
 */
export class FluvyRoomRailCard extends Card<RoomRailCardConfig> {
  /** The rail's height at a 360 column: a 36 chip with the 8 under it before the next card. */
  static override layoutHeight(): number {
    return 44;
  }

  protected override get surface(): boolean {
    return false;
  }

  static override styles: CSSResultGroup = [
    ...(Card.styles as CSSResultGroup[]),
    onPageStyles,
    css`
      .rail {
        animation: fv-enter 420ms var(--fv-ease-out) both;
        animation-delay: var(--fv-enter-delay, 0ms);
      }
      /* a row that scrolls sideways rather than wraps: the page keeps its height, the rail its one line */
      .fv-rail {
        height: auto;
        margin-top: 0;
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        overscroll-behavior-x: contain;
        scroll-snap-type: x proximity;
        scrollbar-width: none;
        margin-inline: -4px;
        padding: 0 4px 4px;
      }
      .fv-rail::-webkit-scrollbar {
        display: none;
      }
      .fv-rail .fv-chip {
        scroll-snap-align: start;
      }
    `,
  ];

  static getStubConfig(): RoomRailCardConfig {
    return { type: 'custom:fluvy-room-rail-card', rooms: [] };
  }

  /** Its editor: an empty form (the rail is the dashboard's to build). */
  static override editor(): Promise<CardEditor> {
    return import('./rail-editor.js');
  }

  override getCardSize(): number {
    return 1;
  }

  override getGridOptions(): LovelaceGridOptions {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  protected renderCard(): TemplateResult {
    const rooms = this.config?.rooms ?? [];
    if (!rooms.length) return html``;
    const current = this.config?.current;
    const items: ChipItem[] = rooms.map((room) => ({
      key: room.path,
      label: room.name,
      name: true,
      glyph: room.icon ?? 'fluvy:home',
      ...(room.path === current ? { active: true } : {}),
    }));
    return html`<div class="rail" role="navigation">
      ${chips(items, (path) => navigate(path), 'fv-rail')}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'fluvy-room-rail-card': FluvyRoomRailCard;
  }
}
