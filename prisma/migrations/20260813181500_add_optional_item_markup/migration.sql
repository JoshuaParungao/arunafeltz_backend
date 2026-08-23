-- Optional per-item selling-price markup snapshots.
-- Formula: final unit price = selected base price / (1 - markupPercent / 100).
-- Existing historical rows remain NULL and are not rewritten.

ALTER TABLE "QuotationItem"
  ADD COLUMN "baseUnitPriceSnapshot" DECIMAL(12,2),
  ADD COLUMN "markupPercent" DECIMAL(7,4);

ALTER TABLE "SaleItem"
  ADD COLUMN "baseUnitPriceSnapshot" DECIMAL(12,2),
  ADD COLUMN "markupPercent" DECIMAL(7,4);

ALTER TABLE "QuotationItem"
  ADD CONSTRAINT "QuotationItem_markup_snapshot_check"
  CHECK (
    ("baseUnitPriceSnapshot" IS NULL OR "baseUnitPriceSnapshot" >= 0)
    AND
    ("markupPercent" IS NULL OR ("markupPercent" >= 0 AND "markupPercent" < 100))
  );

ALTER TABLE "SaleItem"
  ADD CONSTRAINT "SaleItem_markup_snapshot_check"
  CHECK (
    ("baseUnitPriceSnapshot" IS NULL OR "baseUnitPriceSnapshot" >= 0)
    AND
    ("markupPercent" IS NULL OR ("markupPercent" >= 0 AND "markupPercent" < 100))
  );
