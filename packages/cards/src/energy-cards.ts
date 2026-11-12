// the family's words first: they are here before anything in its chunk says them
import './energy/english.js';
import { registerCard } from '@fluvy/core';
import { FluvyEnergyBalanceCard } from './balance/balance-card.js';
import { FluvyEnergyCard } from './energy/energy-card.js';
import { FluvyEnergyDevicesCard } from './energy-devices/energy-devices-card.js';
import { FluvyEnergyFlowCard } from './energy-flow/energy-flow-card.js';
import { ENERGY_FAMILY } from './energy-family.js';
import { FluvyGridCard } from './grid/grid-card.js';
import { FluvyMetersCard } from './meters/meters-card.js';
import { FluvyProductionCard } from './production/production-card.js';
import { FluvyForecastCard } from './forecast/forecast-card.js';
import { FluvyHistoryBarsCard } from './history-bars/history-bars-card.js';
import { FluvyBatteriesCard } from './batteries/batteries-card.js';
import { FluvyEvChargerCard } from './ev-charger/ev-charger-card.js';
import { FluvyEnergySankeyCard } from './sankey/sankey-card.js';
import { FluvyEnergyScoreCard } from './score/score-card.js';

/**
 * The energy family's elements: this module is its own chunk, fetched at start (`index.ts`) and defined as it
 * lands. The names, descriptions and heights live in `energy-family.ts`, which every page carries.
 */
const ELEMENTS: Readonly<Record<string, CustomElementConstructor>> = {
  'fluvy-energy-card': FluvyEnergyCard,
  'fluvy-energy-flow-card': FluvyEnergyFlowCard,
  'fluvy-energy-balance-card': FluvyEnergyBalanceCard,
  'fluvy-grid-card': FluvyGridCard,
  'fluvy-energy-devices-card': FluvyEnergyDevicesCard,
  'fluvy-production-card': FluvyProductionCard,
  'fluvy-forecast-card': FluvyForecastCard,
  'fluvy-history-bars-card': FluvyHistoryBarsCard,
  'fluvy-batteries-card': FluvyBatteriesCard,
  'fluvy-ev-charger-card': FluvyEvChargerCard,
  'fluvy-meters-card': FluvyMetersCard,
  'fluvy-energy-sankey-card': FluvyEnergySankeyCard,
  'fluvy-energy-score-card': FluvyEnergyScoreCard,
};

export const CARDS = ENERGY_FAMILY.map(
  ([tag, name, description]) =>
    [tag, ELEMENTS[tag] as CustomElementConstructor, name, description] as const,
);

for (const [tag, element, name, description] of CARDS)
  registerCard({ tag, name, description }, element);
