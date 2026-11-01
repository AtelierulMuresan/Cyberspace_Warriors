import { buildMarket } from './market.js';
import { buildRange } from './range.js';
import { buildAimLab } from './aimlab.js';

export const MAPS = {
  market: { name: 'Rainline Market', build: buildMarket },
  range: { name: 'Test Range 07', build: buildRange },
  aimlab: { name: 'Aim Lab', build: buildAimLab },
};
export const DEFAULT_MAP = 'market';
