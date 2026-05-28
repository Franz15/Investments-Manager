/**
 * Seed script: imports defaultPortfolioFunds.json into the global Fund collection.
 * Safe to re-run — uses upsert by ISIN (or name+category for funds without ISIN).
 *
 * Usage:
 *   node backend/scripts/seedFunds.js
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import Fund from '../models/Fund.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ISINs que se muestran por defecto en cada categoría del Portfolio Builder
const MAIN_FUND_ISINS = new Set([
  'FR0000989626', // Monetarios
  'FI0008811997',
  'IE00BFZMJT78',
  'ES0112618006', // RF corto plazo
  'LU1623762843',
  'LU0942882589',
  'ES0140794001',
  'ES0140072002', // RF medio plazo
  'IE0031786696',
  'IE00BYX5NX33',
  'ES0119199000', // Renta Variable
  'ES0175414012',
  'LU1694789451',
  'LU1508158430',
  'IE00BLP5S460', // Alternativos
]);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set in environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const jsonPath = path.join(__dirname, '../data/defaultPortfolioFunds.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${raw.length} funds from JSON`);

  let inserted = 0;
  let updated = 0;

  for (const f of raw) {
    const isin = (f.isin || '').trim() || null;
    const doc = {
      name: f.name,
      isin,
      link: f.link || null,
      category: f.category,
      notes: f.notes || null,
      tags: [
        ...(Array.isArray(f.tags) ? f.tags : []),
        ...(isin && MAIN_FUND_ISINS.has(isin) ? ['recomendado'] : []),
      ],
      return12M: f.return12M || null,
      volatility12M: f.volatility12M || null,
    };

    let result;
    if (isin) {
      result = await Fund.updateOne({ isin }, { $set: doc }, { upsert: true });
    } else {
      // Fondos sin ISIN: upsert por nombre + categoría
      result = await Fund.updateOne(
        { name: f.name, category: f.category },
        { $set: doc },
        { upsert: true }
      );
    }

    if (result.upsertedCount) inserted++;
    else if (result.modifiedCount) updated++;
  }

  console.log(`Done — inserted: ${inserted}, updated: ${updated}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
