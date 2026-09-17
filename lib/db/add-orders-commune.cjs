// One-off: add orders.commune and backfill it for existing rows. Guarded
// so re-running is a no-op. Safe to delete after it has been applied to
// every environment.
//
// Backfill condition: address exactly matches (trimmed, case-sensitive) one
// of the official commune names for that order's wilaya (case-insensitive
// wilaya match only). These are the rows previously edited through
// OrderDetail's commune dropdown, which wrote the dataset's exact string
// into address (artifacts/flychat/src/pages/app/OrderDetail.tsx). Everything
// else (manually-created orders where address is free-text street+commune,
// or simply doesn't match) is left NULL rather than guessed — see
// artifacts/api-server/src/routes/carriers.ts dispatch, which now blocks on
// a missing/invalid commune instead of sending Ecotrack a value it will
// reject.
//
// Canonical commune data: artifacts/api-server/src/lib/carriers/algeria-communes.json
// (single source of truth — see algeria-communes-data.ts for why it's JSON,
// not a TS literal: this script needs to require() it with no build step).
const { Pool } = require("pg");
const wilayas = require("../../artifacts/api-server/src/lib/carriers/algeria-communes.json");
const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

(async () => {
  const { rows: before } = await p.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'commune'`
  );
  if (before.length) {
    console.log("Column orders.commune already exists — nothing to do.");
    await p.end();
    return;
  }

  await p.query(`ALTER TABLE orders ADD COLUMN commune TEXT`);
  console.log("ADDED column orders.commune.");

  let backfilled = 0;
  for (const w of wilayas) {
    const { rowCount } = await p.query(
      `UPDATE orders SET commune = address
       WHERE commune IS NULL AND address IS NOT NULL
         AND LOWER(wilaya) = LOWER($1)
         AND TRIM(address) = ANY($2::text[])`,
      [w.name, w.communes]
    );
    backfilled += rowCount;
  }

  const { rows: totals } = await p.query(
    `SELECT COUNT(*) AS total, COUNT(commune) AS with_commune FROM orders`
  );
  const total = Number(totals[0].total);
  const withCommune = Number(totals[0].with_commune);
  console.log(`Backfilled ${backfilled} row(s). ${withCommune}/${total} orders now have a commune; ${total - withCommune} left NULL.`);

  await p.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
