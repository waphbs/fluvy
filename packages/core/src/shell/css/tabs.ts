import { mask } from './shared.js';

/*
 * A dashboard's header as the house chose it: the corner (`fluvy-header-page`: on the page's colour, no bar;
 * `fluvy-flat`: no hairline under it; `fluvy-actions-menu`: its actions in Home Assistant's one menu, whose button shows
 * Fluvy's "…") and its view tabs, in `hui-root`'s header (`.toolbar > ha-menu-button, ha-tab-group, .action-items`), as the
 * house chose them (`look/tabs.ts` marks the root). Every rule hangs on a mark, so the sheet can stay filled whatever
 * the theme: a dashboard that does not wear the look, the edit mode and the `ha` style carry no mark and keep Home
 * Assistant's own tabs. Home Assistant gives an icon tab its view's name only as `aria-label` (and a tooltip): the
 * name is written after the icon from there; a view without an icon, in a row asked for icons, gets the one its name says
 * (`fluvy-icon`, drawn as a mask in the tab's ink). A name is centred on its capitals, as the labels of Fluvy's own
 * controls are (`fluvy/labels.css`, #122): the words Home Assistant puts in the tab's `base` where they are alone there
 * (the base made a block: a flex row's words cannot be trimmed), and the name written after an icon; words beside Home
 * Assistant's own icon in the base (a view showing both) keep their line. A tab hidden from this person (`.hide-tab`)
 * stays hidden. On the phone the row scrolls under the finger and fades where it goes on — at its start once scrolled,
 * at its end while there is more (`look/tabs.ts` follows the scroll; without it the end fades) — and Home Assistant's
 * chevrons give way; on a wide screen they stay, for the mouse. The dashboard's name never shrinks for the tabs (the
 * row scrolls; a long name ends in an ellipsis at 40 %), and stands on the view's column: 12 + 12 from the bar's edge,
 * the view's 24 grown with this device's size. On a wide screen Home Assistant's chevrons sit on the header's colour,
 * the words fading under them.
 */

const ROOT = ':host([fluvy-tabs])';
const TAB = 'ha-tab-group-tab:not(.hide-tab)';
const NAMES = ':host([fluvy-tab-content="names"])';
const BOTH = ':host([fluvy-tab-content="both"])';
const ICONS = ':host([fluvy-tab-content="icons"])';
const FLUVY = ':host([fluvy-tabs="fluvy"])';
const PILLS = ':host([fluvy-tabs="pills"])';
const HIDDEN = ':host([fluvy-tabs="hidden"])';
/** The row's two fades, each 24 px where the row goes on (0 where it does not). */
const FADE =
  'linear-gradient(90deg, transparent, #000 var(--fluvy-tabs-fade-start, 0px), #000 calc(100% - var(--fluvy-tabs-fade-end, 24px)), transparent)';

export const viewTabsCss = `${ROOT} ha-tab-group { --ha-tab-indicator-color: transparent; }
${ROOT} ha-tab-group::part(tabs) { border-block-end: 0; }
${ROOT} ${TAB} { display: inline-flex; align-items: center; gap: 8px; box-sizing: border-box; padding-inline: 12px; border-block-end: 0; margin-block-end: 0; opacity: 1; font-size: 14px; font-weight: 600; letter-spacing: 0; line-height: 20px; white-space: nowrap; color: var(--fluvy-text-secondary, var(--secondary-text-color)); transition: color 160ms ease, background-color 160ms ease; }
${ROOT} ${TAB}::part(base) { padding: 0; color: inherit; }
@supports (text-box: trim-both cap alphabetic) { ${ROOT} ${TAB}:not(.icon-only, .icon-and-title)::part(base), ${NAMES} ${TAB}.icon-and-title::part(base), ${ROOT} ${TAB}::after { display: block; padding-block: calc(0.5lh - 1cap + round(0.5cap, 1px)) calc(0.5lh - round(0.5cap, 1px)); text-box: trim-both cap alphabetic; } }
${ROOT} ${TAB}[active], ${ROOT} ${TAB}:hover { color: var(--fluvy-text, var(--primary-text-color)); }
${ROOT} ${TAB}:focus-visible { outline: 2px solid var(--fluvy-accent, var(--primary-color)); outline-offset: -2px; border-radius: var(--fluvy-radius-control, 12px); }
${ROOT} ${TAB} > ha-icon { --mdc-icon-size: 20px; }
${NAMES} ${TAB} { gap: 0; }
${NAMES} ${TAB}:is(.icon-only, .icon-and-title)[aria-label] > ha-icon { display: none; }
${NAMES} ${TAB}.icon-only[aria-label]::after, ${BOTH} ${TAB}.icon-only[aria-label]::after { content: attr(aria-label); }
${ICONS} ${TAB} > ha-icon { --mdc-icon-size: 24px; }
${ICONS} ${TAB}.icon-and-title { font-size: 0; gap: 0; }
${ICONS} ${TAB}[fluvy-icon]::before, ${BOTH} ${TAB}[fluvy-icon]::before { content: ''; flex: 0 0 auto; width: 24px; height: 24px; background-color: currentColor; -webkit-mask: var(--fluvy-tab-icon) center / contain no-repeat; mask: var(--fluvy-tab-icon) center / contain no-repeat; }
${BOTH} ${TAB}[fluvy-icon]::before { width: 20px; height: 20px; }
${ICONS} ${TAB}[fluvy-icon]::part(base) { display: none; }
${FLUVY} ${TAB}[active] { background: linear-gradient(var(--fluvy-accent, var(--primary-color)) 0 0) 50% 100% / calc(100% - 24px) 2px no-repeat; }
${PILLS} ha-tab-group::part(tabs) { height: var(--ha-tab-group-tab-height, 56px); align-items: center; gap: 8px; }
${PILLS} ha-tab-group::part(nav) { padding-inline: 4px; }
${PILLS} ${TAB} { height: 36px; padding-inline: 16px; border-radius: var(--fluvy-radius-pill, 9999px); background-color: var(--fluvy-card, var(--card-background-color)); box-shadow: inset 0 0 0 1px var(--fluvy-border, var(--divider-color)); }
${PILLS} ${TAB}[active] { background-color: var(--fluvy-selected, var(--fluvy-text)); color: var(--fluvy-on-selected, var(--fluvy-page)); box-shadow: none; }
${PILLS} ${TAB}:focus-visible { outline-offset: 2px; border-radius: var(--fluvy-radius-pill, 9999px); }
${ROOT} .narrow ha-tab-group::part(scroll-button) { display: none; }
:host([fluvy-tabs]:not([fluvy-flat])) ha-tab-group::part(scroll-button) { inset-block-end: 1px; }
${ROOT} ha-tab-group::part(scroll-button-start) { width: 48px; justify-content: flex-start; background: linear-gradient(90deg, var(--app-header-background-color) 60%, transparent); }
${ROOT} ha-tab-group::part(scroll-button-end) { width: 48px; justify-content: flex-end; background: linear-gradient(270deg, var(--app-header-background-color) 60%, transparent); }
${ROOT} .narrow ha-tab-group::part(tabs) { padding-inline-end: 24px; }
/* The row scrolls under the finger wherever it is too long for the header (a phone with five views, a larger system
 * font): Home Assistant's own scroller is left to scroll, its chevrons are the mouse's. The fades are always on, 0px
 * where the row ends (look/tabs.ts writes them). */
${ROOT} ha-tab-group::part(nav) { overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; -webkit-mask-image: ${FADE}; mask-image: ${FADE}; }
${ROOT} ha-tab-group::part(nav)::-webkit-scrollbar { display: none; }
/* A phone's header is narrow: the tabs tighten (8 + 8 around a name) and their row keeps no gap, so five views fit
 * on a 360 px screen instead of ending under the header's menu; a row that still does not fit scrolls. */
@media (max-width: 600px) {
  ${ROOT} ${TAB} { padding-inline: 8px; }
  ${ROOT}:not([fluvy-tabs="pills"]) ha-tab-group::part(tabs) { gap: 0; }
}
/* A 360 px phone: 8 + 8 around five names is still a little too much, 6 + 6 fits under the header's menu. */
@media (max-width: 400px) { ${ROOT} ${TAB} { padding-inline: 6px; } }
${HIDDEN} ha-tab-group { display: none; }
${ROOT} .toolbar > ha-menu-button, :host([fluvy-tab-title]) .toolbar > ha-menu-button { order: -1; }
${ROOT} .toolbar > .action-items { margin-inline-start: auto; }
:host([fluvy-flat]) .toolbar { border-bottom: 0; }
:host([fluvy-actions-menu]) #dashboardmenu { position: relative; --icon-primary-color: transparent; }
:host([fluvy-actions-menu]) #dashboardmenu::after { content: ''; position: absolute; inset: 0; margin: auto; width: 24px; height: 24px; pointer-events: none; background-color: var(--app-header-text-color, var(--fluvy-text)); -webkit-mask: ${mask('dots')} center / 24px 24px no-repeat; mask: ${mask('dots')} center / 24px 24px no-repeat; }
:host([fluvy-header-page]) { --app-header-background-color: var(--fluvy-page, var(--primary-background-color)); }
:host([fluvy-tab-title]) .toolbar:has(> ha-tab-group)::before { content: var(--fluvy-dashboard-title); flex: 0 0 auto; max-width: 40%; margin-inline: calc(24px * var(--fluvy-zoom, 1) - 12px) 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; line-height: 24px; color: var(--fluvy-text, var(--app-header-text-color)); }
:host([fluvy-tab-title]:not([fluvy-tabs="hidden"])) .narrow .toolbar::before { display: none; }
:host([fluvy-tab-title][fluvy-tabs="hidden"]) .toolbar:has(> ha-tab-group)::before { flex: 1 1 auto; min-width: 0; max-width: none; }
:host([fluvy-tab-title][fluvy-tabs="hidden"]) .narrow .toolbar::before { margin-inline-start: 8px; }`;
