import { css } from 'lit';

/**
 * The details sheets' own rules (1.20, #162) on the language's sheet, card head, dial, action row, chips and rows: the
 * dialog that holds a sheet at the foot of a phone or in the middle of a wide screen, the head's picture and its two
 * rounds, the dial's place, the keys under it, and the day's line at the foot. Tokens only.
 */
export const detailsStyles = css`
  :host(:not([docked])) {
    display: contents;
  }
  dialog {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    overflow: hidden;
    padding: 0;
    border: 0;
    background: color-mix(in srgb, var(--fluvy-neutral-05) 48%, transparent);
    color: inherit;
    /* the sheet inside pans its own overflow (pan-y); a gesture that misses it pans nothing (the dialog hides it) */
    touch-action: auto;
    overscroll-behavior: contain;
    animation: fv-fade 240ms var(--fv-ease) both;
  }
  dialog[open] {
    display: flex;
  }
  dialog::backdrop {
    background: none;
  }
  @keyframes dt-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: none;
    }
  }
  @keyframes dt-down {
    to {
      transform: translateY(100%);
    }
  }
  @keyframes dt-rise {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes dt-sink {
    to {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
  }
  @keyframes dt-out {
    to {
      opacity: 0;
    }
  }
  /* the sheet reads at the size this device reads its dashboards at, as the cards under it do: its box is laid out
     smaller by that factor, so what it draws still fits the screen and scrolls inside it */
  dialog .fv-sheet {
    width: calc(100% / var(--fluvy-zoom, 1));
    max-width: calc(392px / var(--fluvy-zoom, 1));
    max-height: calc(100% / var(--fluvy-zoom, 1));
    overflow-y: auto;
    touch-action: pan-y;
    overscroll-behavior: contain;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    zoom: var(--fluvy-zoom, 1);
    animation: dt-up 320ms var(--fv-ease-out) both;
  }
  dialog.is-leaving {
    animation: dt-out 200ms var(--fv-ease) both;
  }
  dialog.is-leaving .fv-sheet {
    animation: dt-down 200ms var(--fv-ease) both;
  }
  .fv-sheet {
    position: relative;
    width: 100%;
  }

  /* a wide screen: a dialog in the middle of it, every corner round, no grabber to pull; it rises as it fades in */
  :host([wide]) dialog {
    justify-content: center;
  }
  :host([wide]) .fv-sheet {
    border-radius: var(--fluvy-radius-xl);
    box-shadow:
      0 0 0 1px var(--fluvy-edge, var(--fluvy-border)),
      0 24px 64px -24px rgb(0 0 0 / calc(0.4 * var(--fluvy-shade, 1)));
  }
  :host([wide]) dialog .fv-sheet {
    max-height: calc(100% - 48px);
    padding-bottom: 16px;
    animation: dt-rise 240ms var(--fv-ease-out) both;
  }
  :host([wide]) dialog.is-leaving .fv-sheet {
    animation: dt-sink 200ms var(--fv-ease) both;
  }
  :host([wide]) .fv-sheet__grabber {
    height: 16px;
  }
  :host([wide]) .fv-sheet__grabber span {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog .fv-sheet {
      animation: none !important;
    }
  }
  :host([reduced-motion]) :is(dialog, dialog .fv-sheet) {
    animation: none !important;
  }

  /* the head: the entity's circle (a player's artwork), its name over its line, and its two rounds, 8 apart */
  .fv-sheet__head > .fv-card__titles {
    flex: 1 1 auto;
    min-width: 0;
  }
  .fv-sheet__title,
  .fv-sheet__head .fv-card__sub {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .dt-pic {
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    overflow: hidden;
    border-radius: 50%;
    background: var(--fluvy-inset, var(--fluvy-page));
  }
  .dt-pic img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .dt-rounds {
    display: flex;
    flex: none;
    gap: 8px;
  }
  /* a column too narrow for the words beside the circle and the rounds: the words under them, the whole column theirs */
  .fv-sheet__head.is-stacked {
    flex-wrap: wrap;
    row-gap: 8px;
    height: auto;
  }
  .fv-sheet__head.is-stacked > .fv-card__titles {
    order: 1;
    flex-basis: 100%;
  }

  /* the one control: the dial in the middle of the sheet, 16 under the head */
  .dt-hero {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }

  /* the keys under the dial: a switch that is on wears its tone's fill, as a lit tile does */
  .dt-keys .fv-action.is-on {
    background: var(--tone-fill);
    box-shadow: inset 0 0 0 1px var(--tone-border);
    color: var(--tone-on);
  }

  /* rows 8 under what stands over them: a row's 60 holds its 44 circle 8 in */
  .dt-rows {
    margin-top: 8px;
  }

  /* the day at the foot: a hairline over it, its words on one line, the house's line under them; one button */
  .dt-day {
    position: relative;
    margin-top: 16px;
    padding-top: 12px;
    border-radius: var(--fluvy-radius-control);
  }
  .dt-day::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 1px;
    background: var(--fluvy-border);
  }
  .dt-day__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: 20px;
  }
  /* a column too narrow for the label and what the day amounts to on one line: one under the other */
  .dt-day__head.is-stacked {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    height: 40px;
  }
  .dt-day__label {
    font-size: 11px;
    font-weight: 600;
    line-height: 20px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--fluvy-text-secondary);
  }
  .dt-day__say {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    line-height: 20px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--fluvy-text-secondary);
  }
  .dt-day__say svg {
    width: 16px;
    height: 16px;
  }
  .dt-day__plot {
    position: relative;
    height: 48px;
    margin-top: 8px;
  }
  /* a rolling window ends at the edge: the dot at "now" stays whole */
  .dt-day__plot .fv-curve {
    overflow: visible;
  }
  .dt-day .fv-axis {
    margin-top: 4px;
  }
  /* out of reach, what the sheet controls fades as one: a row or a chip in it does not fade a second time */
  .dt-body.is-unavailable .is-unavailable {
    opacity: 1;
  }
`;
