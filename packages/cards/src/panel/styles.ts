import { css } from 'lit';

/**
 * The panel's layout on top of the cards' language (`baseStyles`): one centred column of cards (760 at most,
 * the phone's 16 gutter). Its breakpoint is its own width, not the screen's (inside Home Assistant the sidebar
 * takes part of it): from 648 it is laid out as on a desktop (tabs as a full row, 12 between cells, bigger
 * miniatures). One rhythm for every choice inside a card: three cells of 108 on a phone, 216 on a desktop.
 */
export const panelStyles = css`
  :host {
    display: block;
    min-height: 100%;
    container: pn / inline-size;
    background: var(--fluvy-page);
    color: var(--fluvy-text);
    font-family: var(--fluvy-font-sans);
  }
  /* the safe areas are Home Assistant's variables where it sets them (the floating frame's 16 px opening), else
     the device's */
  /* Home Assistant pads a custom panel by the safe areas itself: the column only subtracts them from its height
     (and the dock sticks clear of them), it never pads by them again */
  .pn {
    --pn-inset-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
    --pn-inset-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
    /* the one rhythm between the cells of a row (8 on a phone, 12 on a desktop) */
    --pn-gap: 8px;
    display: flex;
    gap: 24px;
    max-width: 760px;
    min-height: calc(100dvh - var(--pn-inset-top) - var(--pn-inset-bottom));
    margin: 0 auto;
    padding: 12px 16px 16px;
    box-sizing: border-box;
  }
  @container pn (min-width: 648px) {
    .pn {
      --pn-gap: 12px;
      padding: 24px;
    }
  }
  /* the settings' column: the title, the tabs, the open tab's cards, the dock */
  .pn-col {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  /* from 1184 the preview has a column of its own beside the settings: it starts level with the open tab's first
     card (the title and the tabs belong to the settings' column) and stays in view while they scroll */
  .pn.is-side {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    grid-template-rows: auto auto 1fr auto;
    grid-template-areas:
      'top .'
      'tabs .'
      'body aside'
      'dock aside';
    column-gap: 24px;
    row-gap: 16px;
    max-width: 1184px;
  }
  .pn.is-side > .pn-col {
    display: contents;
  }
  .pn.is-side .pn-top {
    grid-area: top;
  }
  .pn.is-side .pn-tabs {
    grid-area: tabs;
  }
  .pn.is-side .pn-body {
    grid-area: body;
  }
  .pn.is-side .pn-dock {
    grid-area: dock;
  }
  .pn-aside {
    grid-area: aside;
    position: sticky;
    top: calc(24px + var(--pn-inset-top));
    align-self: start;
    /* taller than the window (the dashboard's dial and energy flow), it scrolls within itself: always in view */
    max-height: calc(100dvh - 48px - var(--pn-inset-top) - var(--pn-inset-bottom));
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--fluvy-border-strong) transparent;
    border-radius: var(--fluvy-radius-card);
  }
  /* every row of equal cells (the gallery, options, filling chips, pairs): whole-pixel cells on the exact gap, the
     pixel or two a division leaves over as a tail at the end (0.01 px keeps an exact division from losing a pixel
     to floating point); three laid out two and one (the third across both) take a pair's cells */
  .pn-gallery,
  .pn :is(.fv-options, .fv-chips--fill)[style*='repeat(3,']:has(> :nth-child(3):last-child) {
    grid-template-columns: repeat(
      3,
      round(down, calc((100% - 2 * var(--pn-gap)) / 3 + 0.01px), 1px)
    ) !important;
    column-gap: var(--pn-gap) !important;
    justify-content: start;
  }
  .pn :is(.fv-options, .fv-chips--fill)[style*='repeat(2,']:has(> :nth-child(2):last-child),
  .pn :is(.fv-options, .fv-chips--fill)[style*='repeat(2,']:has(> :nth-child(3):last-child) {
    grid-template-columns: repeat(
      2,
      round(down, calc((100% - var(--pn-gap)) / 2 + 0.01px), 1px)
    ) !important;
    column-gap: var(--pn-gap) !important;
    justify-content: start;
  }
  .pn-top {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
  }
  .pn-top .fv-ico {
    background: none;
    color: var(--fluvy-text);
  }
  .pn-titles {
    min-width: 0;
  }
  .pn-title {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    line-height: 32px;
    letter-spacing: -0.01em;
  }
  .pn-sub {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--fluvy-text-secondary);
  }

  /* the tabs: a tab row (14 px face) on the card surface, the open one in the selected ink. A phone scrolls
     content-sized pills to the page's edge, fading only on a side where the row goes on; a wide panel lays
     them out as one full row, the column's width exactly. */
  .pn-tabs {
    margin: 0 -16px;
  }
  .pn-tabs__row {
    display: flex;
    gap: 8px;
    padding: 0 16px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-mask-image: linear-gradient(
      90deg,
      var(--pn-fade-start, transparent),
      #000 24px,
      #000 calc(100% - 24px),
      var(--pn-fade-end, transparent)
    );
    mask-image: linear-gradient(
      90deg,
      var(--pn-fade-start, transparent),
      #000 24px,
      #000 calc(100% - 24px),
      var(--pn-fade-end, transparent)
    );
  }
  .pn-tabs__row.is-start {
    --pn-fade-start: #000;
  }
  .pn-tabs__row.is-end {
    --pn-fade-end: #000;
  }
  .pn-tabs__row::-webkit-scrollbar {
    display: none;
  }
  .pn-tabs .fv-chip {
    flex: 0 0 auto;
  }
  .pn-tabs .fv-chip__pill {
    background: var(--fluvy-card);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
    color: var(--fluvy-text-secondary);
    font-size: 14px;
  }
  .pn-tabs .fv-chip.is-active .fv-chip__pill {
    background: var(--fluvy-selected, var(--fluvy-text));
    color: var(--fluvy-on-selected, var(--fluvy-page));
    box-shadow: none;
  }
  .pn-tabs.is-wide {
    margin: 0;
  }
  .pn-tabs.is-wide .pn-tabs__row {
    display: grid;
    /* six equal tabs on the 8 gap — a tab whose words need more ("Tableaux de bord") keeps them and the others share
       what is left: a word is never cut for the sake of equal cells */
    grid-template-columns: repeat(6, minmax(max-content, 1fr));
    column-gap: 8px;
    justify-content: start;
    padding: 0;
    overflow: visible;
    -webkit-mask-image: none;
    mask-image: none;
  }
  .pn-tabs.is-wide .fv-chip__pill {
    padding-inline: 8px;
  }

  /* a tab's cards; after the first entrance a new tab only fades in */
  .pn-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .pn-body.is-new {
    animation: fv-fade 160ms var(--fv-ease-out) both;
  }

  .pn-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  /* a card of rows only: its first icon circle 20 from the top, as under a head */
  .pn-card.pn-rows {
    padding-block: 12px;
  }
  .pn-line,
  .pn-label {
    margin: 4px 0 -4px;
  }
  /* what a choice does, in the sub line's voice, bound to its label (8 above what it explains) */
  .pn-hint {
    margin: -8px 0 -4px;
    font-size: 13px;
    font-weight: 500;
    line-height: 20px;
    color: var(--fluvy-text-secondary);
    text-wrap: pretty;
  }
  /* a status panel inside a card: what qualifies the choice above it (the theme in use), in its role's fill, the
     way out as a button beneath */
  .pn-status {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    margin-top: 12px;
    padding: 16px;
    border-radius: var(--fluvy-radius-control);
    text-wrap: pretty;
  }
  .pn-status--warning {
    background: var(--fluvy-warning-fill);
    box-shadow: inset 0 0 0 1px var(--fluvy-warning-fill-border);
    color: var(--fluvy-warning-on-fill);
  }
  .pn-status__title {
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
  }
  .pn-status__text {
    font-size: 13px;
    font-weight: 500;
    line-height: 20px;
  }
  .pn-status__btn {
    justify-self: start;
    margin-top: 4px;
  }
  /* its words are an action's, never cut: a button wider than its panel (a long language) takes the panel's width
     and its words two lines, with the 14 above and below that one line has (the child combinator outranks the
     content-sized button's own padding), their line boxes whole: only a label of one line is trimmed to its capitals */
  .pn-status > .pn-status__btn {
    max-width: 100%;
    height: auto;
    min-height: 48px;
    padding-block: 14px;
    line-height: 20px;
    white-space: normal;
    text-align: center;
    text-wrap: balance;
    text-box: normal;
  }
  /* the rows that lead a card (a switch under the head, before what it changes): the preview's own margin follows */
  .pn-rows--lead {
    margin-bottom: 0;
  }
  /* what a value means, under it (the address: open it once on the tablet) */
  .pn-hint--after {
    margin: -4px 0 0; /* one step (8) under the button, with the card's 12 between children */
  }
  /* a chip row binds to the label above it (8 from the label's box to the pill, as in the gallery) */
  .pn-card .fv-chips {
    margin-top: -4px;
  }
  /* a dropdown under its label, the same 8 */
  .pn-label + fluvy-select,
  .pn-label + .pn-pair {
    margin-top: -4px;
  }
  .pn-card .fv-chips--fill {
    column-gap: 8px;
  }
  @container pn (min-width: 648px) {
    .pn-card .fv-chips--fill {
      column-gap: 12px;
    }
  }
  /* prose wraps: a sub never ends in an ellipsis here, and its row grows around it */
  .pn .fv-card__head {
    height: auto;
    min-height: 44px;
  }
  .pn .fv-card__sub,
  .pn .fv-row__title,
  .pn .fv-row__sub {
    white-space: normal;
  }
  .pn .fv-row {
    height: auto;
    min-height: 60px;
    padding-block: 8px;
    box-sizing: border-box;
  }
  .pn-card.is-armed .fv-row__title,
  .pn-reset.is-armed .fv-row__title {
    color: var(--fluvy-warning);
  }
  /* a choice shown to someone who may not change it */
  .pn-chips--static .fv-chip {
    pointer-events: none;
  }
  /* a saved or community swatch: its author under the name, in the secondary ink */
  .pn-swatch__by {
    display: block;
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
    color: var(--fluvy-text-secondary);
  }
  .pn-swatch.is-active .pn-swatch__by {
    color: inherit;
    opacity: 0.8;
  }
  /* the Share card's two text fields: a label over a 44 field */
  .pn-text {
    display: block;
  }
  .pn-text .pn-label {
    display: block;
    margin: 0;
  }
  .pn-text .fv-field {
    display: flex;
    margin-top: 8px;
  }
  .pn-fields {
    margin-top: 4px;
  }
  /* the wall's preview: the clock over two tiles on the wall's background (the mesh, or the page's plain fill),
     in the night's tokens when it is night, under the veil the night darkens it with */
  .pn-preview--wall {
    position: relative;
    overflow: hidden;
    padding: 16px;
    border-radius: var(--fluvy-radius-lg);
    background: var(--fluvy-page);
  }
  .pn-preview__veil {
    position: absolute;
    inset: 0;
    background: #000; /* the wall's veil is black: a screen going dark, whatever the palette */
    pointer-events: none;
  }
  .pn-hint + fluvy-select,
  .pn-hint + ha-selector {
    margin-top: 12px;
  }
  /* Home Assistant's own picker (what a dashboard leaves out) takes the card's width, as its own forms give it */
  ha-selector {
    display: block;
  }
  /* the wall's address: a value that wraps in a read-only box, its copy button under it — beside it where a
     panel is wide enough for both (the button keeps its content width) */
  .pn-address {
    display: grid;
    gap: 8px;
    margin-top: -4px; /* the dropdowns' distance under their label: 4 from the label's box */
  }
  .pn-address .fv-btn {
    justify-self: start;
  }
  .pn-address__url {
    display: block;
    min-height: 44px;
    padding: 12px 16px;
    border-radius: var(--fluvy-radius-control);
    background: var(--fluvy-page);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    overflow-wrap: anywhere;
    user-select: all;
    -webkit-user-select: all;
  }
  @container pn (min-width: 648px) {
    .pn-address {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
    }
  }
  .pn-preview--wall fluvy-clock-card {
    display: block;
    margin-bottom: 16px;
  }
  /* the night's two times, side by side */
  .pn-times {
    margin-top: 12px;
  }
  .pn-rows {
    display: flex;
    flex-direction: column;
  }
  /* a list long enough to scroll stops inside its own box, so the rows below it keep their place */
  .pn-scroll {
    overflow-y: auto;
    padding-inline-end: 4px;
    overscroll-behavior: contain;
  }
  /* what is left out already, folded: its count is the row, a tap opens the chips */
  .pn-fold > summary {
    cursor: pointer;
    align-self: start;
    padding-block: 2px;
  }
  .pn-fold[open] > summary {
    margin-block-end: 6px;
  }
  /* the dashboards' view tabs as a header shows them: the header's colour and hairline, its 56 line, the name at
     its weight; the tabs at their real size (a row longer than the card fades out at its end, as on a phone) */
  .pn-tabsmock {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 56px;
    padding-inline: 16px 0;
    overflow: hidden;
    border-radius: var(--fluvy-radius-control);
    background: var(--fluvy-card);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
  }
  .pn-tabsmock--hidden .pn-tabsmock__title {
    flex: 1 1 auto;
    max-width: none;
  }
  /* with the tabs hidden, the header's actions at the mock's end (the corner card's choice) */
  .pn-tabsmock__actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    margin-inline-start: auto;
    padding-inline-end: 16px;
    color: var(--fluvy-text);
  }
  .pn-tabsmock__actions svg {
    width: 20px;
    height: 20px;
  }
  .pn-tabsmock__title {
    flex: 0 0 auto;
    min-width: 0;
    max-width: 40%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 24px;
    color: var(--fluvy-text);
  }
  .pn-tabsmock__tabs {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    align-self: stretch;
    min-width: 0;
    overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent);
    mask-image: linear-gradient(90deg, #000 calc(100% - 24px), transparent);
  }
  .pn-tabsmock__tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding-inline: 12px;
    align-self: stretch;
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
    white-space: nowrap;
    color: var(--fluvy-text-secondary);
  }
  .pn-tabsmock__tab svg {
    width: 20px;
    height: 20px;
  }
  .pn-tabsmock__tab.is-active {
    color: var(--fluvy-text);
  }
  .pn-tabsmock--fluvy .pn-tabsmock__tab.is-active::after,
  .pn-tabsmock--ha .pn-tabsmock__tab.is-active::after {
    content: '';
    position: absolute;
    inset: auto 12px 0;
    height: 2px;
    background: var(--fluvy-accent);
  }
  /* Home Assistant's own: icons at 24, the whole tab underlined in the ink */
  .pn-tabsmock--ha:not(:has(.pn-tabsmock__title)) {
    padding-inline-start: 0;
  }
  .pn-tabsmock--ha .pn-tabsmock__tab {
    padding-inline: 16px;
    color: var(--fluvy-text);
    opacity: 0.8;
  }
  .pn-tabsmock--ha .pn-tabsmock__tab svg {
    width: 24px;
    height: 24px;
  }
  .pn-tabsmock--ha .pn-tabsmock__tab.is-active {
    opacity: 1;
  }
  .pn-tabsmock--ha .pn-tabsmock__tab.is-active::after {
    inset-inline: 0;
    background: var(--fluvy-text);
  }
  .pn-tabsmock--pills .pn-tabsmock__tabs {
    gap: 8px;
  }
  .pn-tabsmock--pills .pn-tabsmock__tab {
    align-self: center;
    height: 36px;
    padding-inline: 16px;
    border-radius: var(--fluvy-radius-pill, 9999px);
    background: var(--fluvy-card);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
  }
  .pn-tabsmock--pills .pn-tabsmock__tab.is-active {
    background: var(--fluvy-selected, var(--fluvy-text));
    color: var(--fluvy-on-selected, var(--fluvy-page));
    box-shadow: none;
  }
  /* the corner of every page: the sidebar's head beside the header (56), over the first 16 of the sidebar and of the
     page, each on its fill; the hairline under the heads when chosen */
  .pn-corner {
    position: relative;
    display: grid;
    /* the sidebar's head at most Home Assistant's 256, the header the rest and never under its actions */
    grid-template-columns: minmax(0, 256px) minmax(min-content, 1fr);
    height: 72px;
    overflow: hidden;
    border-radius: var(--fluvy-radius-control);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
  }
  /* the preview's frame over its two columns' fills */
  .pn-corner::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
    pointer-events: none;
  }
  .pn-corner__side {
    min-width: 0;
    background: var(--fluvy-card);
  }
  .pn-corner__head {
    min-width: 0;
    background: var(--fluvy-page);
  }
  .pn-corner__row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 56px;
    padding-inline: 12px;
    box-sizing: border-box;
  }
  .pn-corner__head .pn-corner__row {
    background: var(--fluvy-card);
  }
  .pn-corner.is-page .pn-corner__head .pn-corner__row {
    background: transparent;
  }
  /* the header's actions at its end: Home Assistant's four, or its one menu as Fluvy's "…" */
  .pn-corner__actions {
    justify-content: flex-end;
    gap: 8px;
    padding-inline: 12px 16px;
    color: var(--fluvy-text);
  }
  .pn-corner__actions svg {
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
  }
  /* the dashboard's name before the actions, where the header has the room (it gives way first) */
  .pn-corner__title {
    flex: 1 1 auto;
    min-width: 0;
    /* no say in the column's width: the actions set the header's least */
    contain: inline-size;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 24px;
    color: var(--fluvy-text);
  }
  /* a phone's card: the header's name has no room beside the actions (a cut letter is not a name) */
  @container pn (max-width: 523px) {
    .pn-corner__title {
      display: none;
    }
  }
  /* a narrow card: the actions closer, so the name keeps its room */
  @container pn (max-width: 380px) {
    .pn-corner__actions {
      gap: 4px;
      padding-inline: 8px;
    }
  }
  .pn-corner.has-lines .pn-corner__row {
    box-shadow: inset 0 -1px 0 var(--fluvy-border);
  }
  .pn-corner__logo {
    flex: 0 0 24px;
    height: 24px;
    background: center / 24px 24px no-repeat;
  }
  .pn-corner__menu {
    display: inline-flex;
    flex: 0 0 24px;
    color: var(--fluvy-text-secondary);
  }
  .pn-corner__menu svg {
    width: 24px;
    height: 24px;
  }
  .pn-corner__name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 15px;
    font-weight: 600;
    line-height: 24px;
    color: var(--fluvy-text);
  }
  /* what each tab shows: under the styles, at the card's own step */
  .pn-card .pn-tabs-content {
    margin-top: 0;
  }
  /* equal buttons across the column (export | import): whole-pixel cells, the odd pixel to the gap */
  .pn-pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    column-gap: 8px;
  }
  .pn-pair:has(> :nth-child(2)) {
    grid-template-columns: repeat(2, round(down, calc((100% - 8px) / 2), 1px));
    justify-content: space-between;
  }
  @container pn (min-width: 648px) {
    .pn-pair:has(> :nth-child(2)) {
      grid-template-columns: repeat(2, round(down, calc((100% - 12px) / 2), 1px));
    }
  }
  /* a pair of worded buttons ("Export a palette" | "Import a palette") stacks where a phone's column (under 432:
     two 202 cells hold every language's words, 174–190 wide) cannot hold both side by side — never a smaller face,
     never a word cut */
  @container pn (max-width: 431px) {
    .pn-pair--words:has(> :nth-child(2)) {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 8px;
    }
  }
  .pn-file {
    position: relative;
    overflow: hidden;
    cursor: pointer;
  }
  .pn-file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  /* palettes: three a row at every width, each a miniature of the product */
  .pn-gallery {
    display: grid;
    row-gap: var(--pn-gap);
  }
  .pn-swatch {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 8px 12px;
    border: 0;
    border-radius: var(--fluvy-radius-control);
    background: var(--fluvy-page);
    color: var(--fluvy-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pn-swatch.is-active {
    background: var(--fluvy-accent-fill);
    color: var(--fluvy-accent-on-fill);
  }
  .pn-swatch__name {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    height: 16px;
    font-size: 13px;
    font-weight: 600;
    line-height: 16px;
  }
  .pn-swatch__label {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pn-swatch__name svg {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
  }

  /* the miniature: the palette's page with the picture of its tiles, scaled whole */
  .pn-art {
    display: block;
    height: 72px;
    padding: 8px;
    box-sizing: border-box;
    border-radius: var(--fluvy-radius-md);
    background: var(--sw-page);
    box-shadow: inset 0 0 0 1px var(--sw-border);
  }
  @container pn (min-width: 648px) {
    .pn-gallery .pn-art {
      height: 96px;
    }
  }
  /* the picture the panel draws itself fills its miniature; the engine's drawings in a tile keep their own size */
  .pn-art > svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .pn-art__on {
    fill: var(--sw-fill);
  }
  .pn-art__disc {
    fill: var(--sw-card);
  }
  .pn-art__glyph {
    fill: var(--sw-accent);
  }
  .pn-art__tick {
    stroke: var(--sw-tick);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .pn-art__off {
    fill: var(--sw-card);
    stroke: var(--sw-border);
  }
  .pn-art__hl {
    fill: var(--sw-hl);
  }
  .pn-art--new {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--fluvy-card);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
    color: var(--fluvy-text-secondary);
  }
  .pn-art--new svg {
    width: 20px;
    height: 20px;
  }

  /* a custom palette: a builder of its own under both lines */
  .pn-custom {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 8px 8px;
    border: 0;
    border-radius: var(--fluvy-radius-control);
    background: var(--fluvy-page);
    color: var(--fluvy-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .pn-custom .pn-art {
    flex: 0 0 96px;
    height: 56px;
  }
  .pn-custom__text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }
  .pn-custom__title {
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
  }
  .pn-custom__sub {
    font-size: 13px;
    font-weight: 500;
    line-height: 16px;
    color: var(--fluvy-text-secondary);
  }
  .pn-custom__tail {
    display: inline-flex;
    color: var(--fluvy-text-secondary);
  }
  .pn-custom__tail svg {
    width: 20px;
    height: 20px;
  }
  .pn-custom.is-active {
    background: var(--fluvy-accent-fill);
    color: var(--fluvy-accent-on-fill);
  }
  .pn-custom.is-active :is(.pn-custom__sub, .pn-custom__tail) {
    color: var(--fluvy-accent-on-fill);
  }
  .pn-custom.is-active .pn-custom__sub {
    opacity: 0.72;
  }

  /* colours: six dots a row on a phone, twelve on a wide panel; the chosen one carries a check */
  /* cells an even number of pixels wide (a 44 dot centres on a whole pixel) and a whole gap; what does not
     divide is a tail of a few pixels at the end */
  .pn-dots {
    --n: 6;
    --basis: 8px;
    --cell: clamp(
      44px,
      round(down, calc((100% - (var(--n) - 1) * var(--basis)) / var(--n)), 2px),
      56px
    );
    display: grid;
    grid-template-columns: repeat(var(--n), var(--cell));
    column-gap: round(down, calc((100% - var(--n) * var(--cell)) / (var(--n) - 1)), 1px);
    row-gap: 8px;
    justify-items: center;
  }
  /* twelve a row once they keep the 8 between them (a 616 content, from 704); six a row below that — a row of six of
     its own (a status's colours) keeps its six and fills the width */
  @container pn (min-width: 704px) {
    .pn-dots:not(.pn-dots--six) {
      --n: 12;
    }
  }
  /* three a row where six 44s cannot keep 4 between them (a 284 content, from 356: a 320 phone's 248): a dot is never
     smaller than a finger's 44, so the row wraps */
  @container pn (max-width: 355px) {
    .pn-dots {
      --n: 3;
    }
  }
  /* colours shown to someone who may not change them */
  .pn-dots--static .pn-dot {
    pointer-events: none;
  }
  .pn-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    /* its edge is its own colour a shade deeper (a grey ring stair-stepped round a saturated dot); a pale dot
       still stands off the card by it */
    border: 1px solid color-mix(in oklab, var(--dot, var(--fluvy-page)) 86%, var(--fluvy-text));
    border-radius: 50%;
    background: var(--dot, var(--fluvy-page));
    color: var(--dot-ink, var(--fluvy-text-secondary));
    cursor: pointer;
  }
  .pn-dot svg {
    width: 20px;
    height: 20px;
  }
  /* any colour: a hex field of our own, the system's well behind its swatch */
  /* the language's field, its swatch well flush at the right end */
  .pn-hex {
    padding-right: 0;
  }
  .pn-hex__input {
    font-variant-numeric: tabular-nums;
  }
  .pn-hex__well {
    position: relative;
    display: inline-flex;
    flex: 0 0 44px;
    align-items: center;
    justify-content: center;
    height: 44px;
    cursor: pointer;
  }
  .pn-hex__well::before {
    content: '';
    width: 24px;
    height: 24px;
    border: 1px solid color-mix(in oklab, var(--dot) 86%, var(--fluvy-text));
    border-radius: 50%;
    background: var(--dot);
  }
  .pn-hex__well input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  /* the Charts tab's tiles (the styles, the gauges): rows of two on a phone, four on a wide panel, and a last row short
     of them sharing the width among its own (charts.ts), so every row is full; the previews' two modes side by side */
  .pn-tiles {
    display: grid;
    gap: var(--pn-gap);
  }
  .pn-tiles__row {
    display: grid;
    grid-template-columns: repeat(
      var(--n),
      round(down, calc((100% - (var(--n) - 1) * var(--pn-gap)) / var(--n) + 0.01px), 1px)
    );
    gap: var(--pn-gap);
    justify-content: start;
  }
  .pn-modes {
    display: grid;
    grid-template-columns: repeat(2, round(down, calc((100% - var(--pn-gap)) / 2 + 0.01px), 1px));
    gap: var(--pn-gap);
    justify-content: start;
  }
  .pn-tiles--static .pn-tile,
  .pn-sets--static .pn-set {
    pointer-events: none;
  }
  /* a chart's picture: the engine's drawing on the card's surface, as a palette's is its page (the knob's halo is that
     surface, so it cuts the line under it) */
  .pn-art--chart {
    --sw-page: var(--fluvy-card);
    --sw-border: var(--fluvy-border);
    --knob-halo: var(--fluvy-card);
  }
  @container pn (min-width: 648px) {
    .pn-art--style {
      height: 96px;
    }
  }
  /* a gauge's picture is the dial's own height (96 across and its opening, 100 down) inside its 8: the dial's disc on
     the grid, the ring and the ruler centred on it */
  .pn-art--gauge {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 116px;
  }
  /* what the chosen style lets the house tune, said where there is nothing to tune */
  .pn-note {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    line-height: 20px;
    color: var(--fluvy-text-secondary);
    text-wrap: pretty;
  }
  /* the sets of series colours: a row each, as the custom palette's (its picture, its name, a check when worn), as wide
     as the card: what the words need never widens it */
  .pn-sets {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--pn-gap);
  }
  /* the words wrap as the custom palette's do, on two lines at most; a set's name (the house's own words) ends in its
     ellipsis where a word is wider than its line or a third line would start */
  .pn-set .pn-custom__title {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pn-set .pn-art {
    padding: 8px 12px;
  }
  /* a set's six colours, on the picker's columns: each a 36 dot in its 44, the one being picked ringed in the accent
     with the card between, each carrying its mark (the palette's where it follows the palette, a lock where fixed) */
  .pn-slot {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--dot-ink);
    cursor: pointer;
  }
  .pn-slot::before {
    content: '';
    position: absolute;
    inset: 4px;
    border: 1px solid color-mix(in oklab, var(--dot) 86%, var(--fluvy-text));
    border-radius: 50%;
    background: var(--dot);
  }
  .pn-slot svg {
    position: relative;
    width: 16px;
    height: 16px;
  }
  .pn-slot.is-active {
    box-shadow: inset 0 0 0 2px var(--fluvy-accent);
  }
  /* the colour being picked: its number, and its mark in words at the end of the row */
  .pn-slot-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 8px;
  }
  .pn-slot-head__title {
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
  }
  .pn-mark {
    gap: 4px;
  }
  .pn-mark svg {
    width: 16px;
    height: 16px;
  }
  .pn-check.pn-status {
    margin-top: 0;
  }
  /* the two modes side by side, each a card in its own colours (the look scoped to it), its name over its drawings */
  .pn-mode {
    --knob-halo: var(--fluvy-card);
    display: grid;
    align-content: start;
    gap: 8px;
    min-width: 0;
    padding: 12px;
    border-radius: var(--fluvy-radius-control);
    background: var(--fluvy-card);
    box-shadow: inset 0 0 0 1px var(--fluvy-border);
    color: var(--fluvy-text);
  }
  .pn-mode__name {
    margin: 0;
  }
  .fc-preview {
    display: grid;
    gap: 12px;
  }
  .fc-preview__gauge {
    display: flex;
    justify-content: center;
  }
  /* the light half of a dark panel: a light card's fills, not the dark mode's six points more */
  :host .pn-day .fc-chart {
    --fc-boost: 0;
  }
  /* the bubble arrives with the dot it belongs to, once the line has drawn itself (at once, still) */
  .fc-preview .fc-chart:not(.is-still) ~ .fv-bubble {
    animation: fv-fade 500ms var(--fv-ease) both;
    animation-delay: 620ms;
  }

  /* the preview: the cards at their real size, laid out by the width it has (under the settings, or in the side
     column) — two phone tiles over the thermostat, or with room for them the desktop tiles (152) beside it */
  .pn-card--preview {
    container: pv / inline-size;
  }
  .pn-preview {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 12px;
    border-radius: var(--fluvy-radius-card);
    background: var(--fluvy-page);
    color: var(--fluvy-text);
  }
  /* the house's cards see-through: they stand on a picture, as a view's background shows through them — its colours
     taken towards the page's, so the greeting's words, which stand on it, read in either mode */
  .pn-preview--glass {
    background:
      radial-gradient(
        60% 40% at 12% 8%,
        color-mix(in srgb, #ff8a5c 70%, var(--fluvy-page)),
        transparent 70%
      ),
      radial-gradient(
        55% 40% at 92% 30%,
        color-mix(in srgb, #ffd166 70%, var(--fluvy-page)),
        transparent 70%
      ),
      radial-gradient(
        60% 45% at 20% 92%,
        color-mix(in srgb, #2ec4b6 70%, var(--fluvy-page)),
        transparent 70%
      ),
      linear-gradient(
        160deg,
        color-mix(in srgb, #2f5fb3 60%, var(--fluvy-page)),
        color-mix(in srgb, #6c8ed4 60%, var(--fluvy-page))
      );
  }
  /* two whole-pixel cells, the odd pixel to the gap */
  .pn-preview__tiles {
    display: grid;
    grid-template-columns: repeat(2, round(down, calc((100% - 8px) / 2 + 0.01px), 1px));
    justify-content: space-between;
    gap: 8px;
    align-content: start;
  }
  .pn-preview__extra {
    display: none;
  }
  /* the greeting over the cards: its avatar wears the highlight */
  .pn-preview__hello {
    grid-column: 1 / -1;
    min-width: 0;
  }
  /* two tiles side by side need 132 each to keep their switches beside their circles: one a row under that */
  @container pv (max-width: 311px) {
    .pn-preview__tiles {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  /* the desktop sizes when they fit (a 672 preview): the tiles (152) beside the thermostat, a second pair under
     them; on the dashboard's, the energy flow under the tiles and the thermostat beside both */
  @container pv (min-width: 672px) {
    .pn-preview {
      grid-template-columns: minmax(0, 312px) minmax(0, 312px);
      justify-content: center;
      gap: 16px;
      padding: 16px;
    }
    .pn-preview__tiles {
      grid-template-columns: repeat(2, minmax(0, 152px));
    }
    .pn-preview__extra {
      display: block;
    }
    .pn-preview--dash {
      grid-template-rows: auto 1fr;
      align-items: start;
    }
    .pn-preview__side {
      grid-column: 2;
      grid-row: 1 / span 2;
    }
  }

  /* the dock at the foot: the notice, and the bar while a look is pending (in the flow, so it never covers the
     last card; sticky, so it is at hand while the page scrolls) */
  .pn-dock {
    position: sticky;
    bottom: calc(16px + var(--pn-inset-bottom));
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: auto;
  }
  .pn-dock:empty {
    display: none;
  }
  @container pn (min-width: 648px) {
    .pn-dock {
      bottom: calc(24px + var(--pn-inset-bottom));
    }
  }
  .pn-foot,
  .pn-notice {
    animation: pn-rise 220ms var(--fv-ease-out) both;
  }
  .pn-foot.is-leaving {
    animation: pn-sink 160ms var(--fv-ease) both;
  }
  @keyframes pn-rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  @keyframes pn-sink {
    to {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  :host([reduced-motion]) :is(.pn-foot, .pn-notice, .pn-body) {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    :is(.pn-foot, .pn-notice, .pn-body) {
      animation: none;
    }
  }
  .pn-notice {
    align-self: center;
    display: inline-flex;
    align-items: center;
    height: 44px;
    border-radius: var(--fluvy-radius-pill, 9999px);
    white-space: nowrap;
    background: var(--fluvy-text);
    color: var(--fluvy-page);
    font-size: 14px;
    font-weight: 600;
    box-shadow: var(--fluvy-shadow-lift);
  }
  /* the bar: what changes and Discard on the first row, the two ways to apply as an equal pair under them (one
     row on a wide panel) */
  .pn-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'text discard'
      'pair pair';
    align-items: center;
    gap: 8px;
    padding: 12px;
    border-radius: var(--fluvy-radius-card);
    background: var(--fluvy-card-elevated);
    box-shadow:
      var(--fluvy-shadow-lift),
      inset 0 0 0 1px var(--fluvy-border);
  }
  .pn-bar--trial {
    grid-template-areas: 'text discard';
  }
  .pn-bar__text {
    grid-area: text;
    padding-left: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .pn-bar__discard {
    grid-area: discard;
  }
  .pn-bar__pair {
    grid-area: pair;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .pn-bar__pair:has(> :nth-child(2)) {
    grid-template-columns: repeat(2, round(down, calc((100% - 8px) / 2), 1px));
    justify-content: space-between;
  }
  /* a label longer than its half: the pair one over the other, each as wide as the bar */
  .pn-bar__pair.pn-bar__pair--stack {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  @container pn (min-width: 760px) {
    .pn-bar {
      grid-template-columns: minmax(0, 1fr) auto 352px;
      grid-template-areas: 'text discard pair';
    }
    .pn-bar--single {
      grid-template-columns: minmax(0, 1fr) auto 172px;
    }
    .pn-bar--trial {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'text discard';
    }
  }
`;
