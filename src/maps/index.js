import { buildMarket } from './market.js';
import { buildRange } from './range.js';
import { buildAimLab } from './aimlab.js';
import { buildDocks } from './docks.js';
import { buildSpire } from './spire.js';

export const MAPS = {
  market: { name: 'Rainline Market', build: buildMarket },
  docks: { name: 'Kowloon Docks', build: buildDocks },
  spire: { name: 'Spire Plaza', build: buildSpire },
  range: { name: 'Test Range 07', build: buildRange },
  aimlab: { name: 'Aim Lab', build: buildAimLab },
};
export const DEFAULT_MAP = 'market';
