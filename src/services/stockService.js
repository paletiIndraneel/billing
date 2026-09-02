// Central service for all inventory stock movements.
// Every stock change (sale, purchase, return, adjustment, packaging) must go through adjustStock or packageStock.
//
// Rules:
//   - Must be called inside a Dexie 'rw' transaction covering db.productVariants, db.products, db.stockLedger.
//   - packsDelta > 0  →  stock in  (purchase, return, opening)
//   - packsDelta < 0  →  stock out (sale, adjustment, write-off)
//   - Throws if the resulting balance would go below zero.
//   - unitCost: cost per pack paid to supplier (for purchases/opening stock only).
//   - type 'void': stock reversal when an invoice is deleted (no WAC recalculation).
//     When unitCost is provided on stock-in, averageCost is recalculated:
//       newAvgCost = (currentPacks * oldAvgCost + newPacks * unitCost) / (currentPacks + newPacks)
//
// PACKED mode:  stock lives on productVariants.stockQty
// BULK mode:    stock lives on products.masterStock (shared pool across all variants).
//               When a BULK product has been packaged (variant.stockQty > 0), sales deduct
//               from variant.stockQty first (hybrid mode — purchases still add to masterStock).
// BULK WAC:     averageCost is stored per-pack on each variant but derived from a single
//               cost-per-base-unit so all sibling variants stay consistent.

import { db } from '../db/db';
import { convertUnit } from '../utils/unitConversion';

// Returns the effective pack size in the product's canonical base unit.
// If product.baseUnit is set and differs from variant.unit, the raw packSize
// (which is in variant.unit) is multiplied by the conversion factor.
// Falls back to raw packSize when baseUnit is absent or units are incompatible.
function effectivePackSz(variant, product) {
  const raw = Number(variant.packSize) > 0 ? Number(variant.packSize) : 1;
  const base = product?.baseUnit;
  if (!base || !variant.unit) return raw;
  const from = variant.unit.toUpperCase();
  const to = base.toUpperCase();
  if (from === to) return raw;
  try { return raw * convertUnit(1, from, to); } catch { return raw; }
}

export async function adjustStock({ variantId, productId, packsDelta, type, reference = '', note = '', unitCost = null, batchNo = null }) {
  const v = await db.productVariants.get(variantId);
  if (!v) throw new Error(`Variant not found: ${variantId}`);
  if (productId !== undefined && productId !== null && v.productId !== productId) {
    throw new Error(`Stock integrity error: variant ${variantId} belongs to product ${v.productId}, not ${productId}`);
  }

  const pid = productId ?? v.productId;
  const prod = await db.products.get(pid);
  const packSz = effectivePackSz(v, prod);
  const isBulk = (prod?.inventoryMode ?? 'packed') === 'bulk';

  // Hybrid sale: BULK product that has packaged stock in variant.stockQty.
  // Sales deduct from variant.stockQty; purchases/returns still use masterStock.
  const isHybridSale = isBulk && packsDelta < 0 && v.stockQty > 0;
  const currentBase = (isBulk && !isHybridSale) ? (prod?.masterStock ?? 0) : v.stockQty;

  const baseQtyDelta = packsDelta * packSz;
  const newBase = currentBase + baseQtyDelta;

  if (newBase < 0) {
    const availPacks = currentBase / packSz;
    throw new Error(`Insufficient stock — available: ${availPacks.toFixed(2)} packs`);
  }

  // Weighted average cost — recalculated only on stock-in with a known purchase cost.
  // Deductions (sales, write-offs, void) leave averageCost unchanged.
  let newAverageCost = v.averageCost ?? v.purchasePrice ?? 0;
  if (packsDelta > 0 && unitCost !== null && unitCost >= 0) {
    const currentPacks = currentBase / packSz;
    if (currentPacks + packsDelta > 0) {
      newAverageCost = (currentPacks * newAverageCost + packsDelta * unitCost) / (currentPacks + packsDelta);
    }
  }

  if (isHybridSale) {
    // Deduct from variant.stockQty (packaged stock). masterStock is unchanged.
    await db.productVariants.update(variantId, { stockQty: newBase });
  } else if (isBulk) {
    await db.products.update(pid, { masterStock: newBase });
    if (packsDelta > 0 && unitCost !== null && unitCost >= 0) {
      // BULK WAC: derive cost per base unit so all sibling variants stay consistent.
      // Example: 1KG variant averageCost = ₹50 → costPerBase = ₹50/KG
      //          2KG sibling variant     → averageCost = ₹50 × 2 = ₹100
      const costPerBase = newAverageCost / packSz;
      const siblings = await db.productVariants.where('productId').equals(pid).toArray();
      for (const sib of siblings) {
        const sibPackSz = effectivePackSz(sib, prod);
        await db.productVariants.update(sib.id, {
          averageCost: costPerBase * sibPackSz,
          ...(sib.id === variantId ? { purchasePrice: unitCost } : {}),
        });
      }
      // Cache base cost on product for reporting convenience
      await db.products.update(pid, { masterStock: newBase, avgCostPerBase: costPerBase });
    }
  } else {
    // PACKED mode
    const variantUpdate = { stockQty: newBase };
    if (packsDelta > 0 && unitCost !== null && unitCost >= 0) {
      variantUpdate.averageCost = newAverageCost;
      variantUpdate.purchasePrice = unitCost;
    }
    await db.productVariants.update(variantId, variantUpdate);
  }

  await db.stockLedger.add({
    variantId,
    productId: pid,
    type,
    packs: packsDelta,
    baseQtyDelta,
    balanceQty: newBase,
    unitCost: unitCost ?? null,
    batchNo: batchNo || null,
    reference,
    note,
    date: new Date().toISOString(),
  });

  return { newBalance: newBase, isBulk, isHybridSale, packSz, averageCost: newAverageCost };
}

/**
 * Convert bulk raw stock into individual packed variants.
 * Deducts total base units from products.masterStock and credits each variant's stockQty.
 * Must be called inside a Dexie 'rw' transaction covering db.products, db.productVariants, db.stockLedger.
 *
 * @param {object} params
 * @param {number} params.productId        - ID of the BULK product
 * @param {Array}  params.packagingItems   - [{ variantId, qty }] qty in packs
 * @param {string} [params.reference]      - Reference string (e.g., PKG-20240601)
 * @param {string} [params.note]           - Optional notes
 */
export async function packageStock({ productId, packagingItems, reference = '', note = '' }) {
  const prod = await db.products.get(productId);
  if (!prod) throw new Error(`Product not found: ${productId}`);
  if ((prod.inventoryMode ?? 'packed') !== 'bulk') {
    throw new Error('Packaging is only available for BULK inventory products');
  }

  // Resolve variants and compute total base units required
  let totalBaseUnitsNeeded = 0;
  const resolvedItems = [];

  for (const { variantId, qty } of packagingItems) {
    const packs = Number(qty) || 0;
    if (packs <= 0) continue;
    const v = await db.productVariants.get(variantId);
    if (!v || v.productId !== productId) throw new Error(`Variant ${variantId} does not belong to product ${productId}`);
    const packSz = effectivePackSz(v, prod);
    const baseUnits = packs * packSz;
    totalBaseUnitsNeeded += baseUnits;
    resolvedItems.push({ v, packs, packSz, baseUnits });
  }

  if (resolvedItems.length === 0) throw new Error('No valid packaging quantities entered');

  const masterStock = prod.masterStock ?? 0;
  if (masterStock < totalBaseUnitsNeeded) {
    const unit = prod.baseUnit || resolvedItems[0]?.v.unit || 'units';
    throw new Error(
      `Insufficient bulk stock — available: ${masterStock} ${unit}, needed: ${totalBaseUnitsNeeded} ${unit}`
    );
  }

  const now = new Date().toISOString();
  const ref = reference || `PKG-${Date.now()}`;
  const newMasterStock = masterStock - totalBaseUnitsNeeded;

  await db.products.update(productId, { masterStock: newMasterStock });

  for (const { v, packs, packSz, baseUnits } of resolvedItems) {
    const newVariantStock = (v.stockQty || 0) + baseUnits;
    await db.productVariants.update(v.id, { stockQty: newVariantStock });
    await db.stockLedger.add({
      variantId: v.id,
      productId,
      type: 'packaging',
      packs,
      baseQtyDelta: baseUnits,
      balanceQty: newVariantStock,
      unitCost: v.averageCost ?? v.purchasePrice ?? 0,
      reference: ref,
      note: note || `Packaged ${packs} × ${packSz} ${v.unit} from bulk`,
      date: now,
    });
  }

  return {
    newMasterStock,
    packed: resolvedItems.map(d => ({ variantId: d.v.id, packs: d.packs, baseUnits: d.baseUnits })),
  };
}
