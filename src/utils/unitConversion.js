// Centralised unit conversion engine.
// All inventory calculations that cross unit boundaries must go through convertUnit.
//
// Conversion factors are expressed as multiples of the base unit for each dimension:
//   Mass   → base unit: GM   (grams)
//   Volume → base unit: ML   (millilitres)
//   Count  → base unit: PCS  (pieces)

const FACTORS = {
  // ── Mass ──────────────────────────────────────────────────
  TON: 1_000_000,
  KG:  1_000,
  G:   1,
  GM:  1,
  // ── Volume ────────────────────────────────────────────────
  LTR: 1_000,
  L:   1_000,
  ML:  1,
  // ── Length ────────────────────────────────────────────────
  MTR: 100,
  CM:  1,
  // ── Energy ────────────────────────────────────────────────
  KWH: 1,
  // ── Count ─────────────────────────────────────────────────
  DOZEN:  12,
  DOZ:    12,
  GROSS:  144,
  PAIR:   2,
  SET:    1,
  BOX:    1,
  PACK:   1,
  PKT:    1,
  BAG:    1,
  BUNDLE: 1,
  ROLL:   1,
  NOS:    1,
  PCS:    1,
  PC:     1,
};

const DIMENSIONS = {
  TON: 'mass', KG: 'mass', G: 'mass', GM: 'mass',
  LTR: 'volume', L: 'volume', ML: 'volume',
  MTR: 'length', CM: 'length',
  KWH: 'energy',
  DOZEN: 'count', DOZ: 'count', GROSS: 'count', PAIR: 'count',
  SET: 'count', BOX: 'count', PACK: 'count', PKT: 'count',
  BAG: 'count', BUNDLE: 'count', ROLL: 'count', NOS: 'count',
  PCS: 'count', PC: 'count',
};

/**
 * Convert `value` from `fromUnit` to `toUnit`.
 * Throws if units are unknown or from different dimensions (e.g., KG → LTR).
 */
export function convertUnit(value, fromUnit, toUnit) {
  const from = String(fromUnit || '').toUpperCase().trim();
  const to   = String(toUnit   || '').toUpperCase().trim();
  if (from === to) return value;

  const fromFactor = FACTORS[from];
  const toFactor   = FACTORS[to];
  if (fromFactor === undefined) throw new Error(`Unknown unit: "${fromUnit}"`);
  if (toFactor   === undefined) throw new Error(`Unknown unit: "${toUnit}"`);

  const fromDim = DIMENSIONS[from];
  const toDim   = DIMENSIONS[to];
  if (fromDim !== toDim) {
    throw new Error(`Cannot convert ${fromUnit} (${fromDim}) to ${toUnit} (${toDim})`);
  }

  return (value * fromFactor) / toFactor;
}

/** Returns true if the two units can be converted without error. */
export function canConvert(fromUnit, toUnit) {
  try { convertUnit(1, fromUnit, toUnit); return true; } catch { return false; }
}

export const UNIT_OPTIONS = [
  { value: 'KG',     label: 'KG – Kilogram',       dim: 'mass'   },
  { value: 'GM',     label: 'GM – Gram',            dim: 'mass'   },
  { value: 'TON',    label: 'TON – Metric Tonne',   dim: 'mass'   },
  { value: 'LTR',    label: 'LTR – Litre',          dim: 'volume' },
  { value: 'ML',     label: 'ML – Millilitre',      dim: 'volume' },
  { value: 'MTR',    label: 'MTR – Metre',          dim: 'length' },
  { value: 'CM',     label: 'CM – Centimetre',      dim: 'length' },
  { value: 'KWH',    label: 'kWh – Kilowatt-hour',  dim: 'energy' },
  { value: 'PCS',    label: 'PCS – Pieces',         dim: 'count'  },
  { value: 'NOS',    label: 'NOS – Numbers',        dim: 'count'  },
  { value: 'DOZEN',  label: 'DOZEN – 12 pcs',       dim: 'count'  },
  { value: 'PAIR',   label: 'PAIR – 2 pcs',         dim: 'count'  },
  { value: 'BOX',    label: 'BOX',                  dim: 'count'  },
  { value: 'PACK',   label: 'PACK',                 dim: 'count'  },
  { value: 'PKT',    label: 'PKT – Packet',         dim: 'count'  },
  { value: 'BAG',    label: 'BAG',                  dim: 'count'  },
  { value: 'BUNDLE', label: 'BUNDLE',               dim: 'count'  },
  { value: 'SET',    label: 'SET',                  dim: 'count'  },
  { value: 'ROLL',   label: 'ROLL',                 dim: 'count'  },
];
