const { Prisma } = require("@prisma/client");
const prisma = require("../config/prisma");
const logger = require("./logger");
const initialProducts = require("../data/initialProducts.json");
const initialServiceCatalog = require("../data/initialServiceCatalog.json");

const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const LEGACY_DUMMY_CATEGORY_NAMES = new Set([
  "ACCESSORIES",
  "CABLES",
  "ADAPTERS",
  "HUBS",
  "CHARGERS",
  "COOLING ACCESSORIES",
  "OTHER ACCESSORIES",
  "CPU / PROCESSOR",
  "DESKTOP CPU",
  "LAPTOP CPU",
  "SERVER CPU",
  "GPU / GRAPHICS CARD",
  "GAMING GPU",
  "PROFESSIONAL / WORKSTATION GPU",
  "EXTERNAL GPU (EGPU)",
  "MOTHERBOARD",
  "DESKTOP MOTHERBOARD",
  "SERVER MOTHERBOARD",
  "EMBEDDED / INDUSTRIAL MOTHERBOARD",
  "PERIPHERALS",
  "HEADSET / AUDIO",
  "SPEAKERS",
  "CONTROLLER / GAMEPAD",
  "RAM / MEMORY",
  "DESKTOP RAM",
  "LAPTOP RAM (SO-DIMM)",
  "SERVER RAM",
  "STORAGE",
  "HDD (HARD DISK DRIVE)",
  "SATA SSD",
  "NVME SSD",
  "USB FLASH DRIVE",
]);

const syncItemSerializationAndWarranty = async () => {
  logger.info("Syncing item serialization and warranty flags across all branches...");
  const serializedCodes = initialProducts
    .filter((p) => Boolean(p.isSerialized))
    .map((p) => p.itemCode);
  const nonSerializedCodes = initialProducts
    .filter((p) => !p.isSerialized)
    .map((p) => p.itemCode);

  const [updatedSerialized, updatedNonSerialized] = await Promise.all([
    serializedCodes.length > 0
      ? prisma.item.updateMany({
          where: { itemCode: { in: serializedCodes } },
          data: {
            isSerialized: true,
            hasWarranty: true,
            description: "[WARRANTY: 1 YEAR WARRANTY]",
            brand: null,
            modelName: null,
            attributes: Prisma.DbNull,
          },
        })
      : { count: 0 },
    nonSerializedCodes.length > 0
      ? prisma.item.updateMany({
          where: { itemCode: { in: nonSerializedCodes } },
          data: {
            isSerialized: false,
            hasWarranty: false,
            description: "[WARRANTY: NO WARRANTY]",
            brand: null,
            modelName: null,
            attributes: Prisma.DbNull,
          },
        })
      : { count: 0 },
  ]);

  logger.info(
    `Serialization sync completed: ${updatedSerialized.count} serialized, ${updatedNonSerialized.count} non-serialized`
  );

  return {
    serializedUpdated: updatedSerialized.count,
    nonSerializedUpdated: updatedNonSerialized.count,
  };
};

const ensureProductCatalog = async (force = false) => {
  try {
    const startTime = Date.now();
    const initialItemCount = await prisma.item.count();
    logger.info(
      `Running product catalog sync/bootstrap (existing items: ${initialItemCount}, force: ${Boolean(force)})...`
    );

    // 1. Branches
    const branches = await prisma.branch.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    });

    if (branches.length === 0) {
      logger.warn("No active branches found. Skipping catalog bootstrap.");
      return { skipped: true, reason: "NO_ACTIVE_BRANCHES" };
    }

    const mainBranch = branches.find((b) => b.code === "MAIN") || branches[0];

    // 2. Superowner / Admin actor
    const actorUser = await prisma.user.findFirst({
      where: {
        OR: [{ role: "SUPER_OWNER" }, { username: "superowner" }, { username: "calix" }],
      },
      select: { id: true },
    });
    const actorId = actorUser?.id || null;

    // 3. Units of Measure (exact units from Excel dataset)
    const uniqueUnitNames = new Set();
    for (const p of initialProducts) {
      const unitName = normalizeText(p.unit || "PIECE").toUpperCase() || "PIECE";
      uniqueUnitNames.add(unitName);
    }

    const existingUnits = await prisma.unit.findMany({
      select: { id: true, unitCode: true, name: true, status: true },
    });
    const unitByUpper = new Map();
    for (const u of existingUnits) {
      if (u.name) unitByUpper.set(normalizeText(u.name).toUpperCase(), u);
      if (u.unitCode) unitByUpper.set(normalizeText(u.unitCode).toUpperCase(), u);
    }

    const unitMap = new Map();
    for (const unitName of uniqueUnitNames) {
      let unit = unitByUpper.get(unitName);
      if (!unit) {
        unit = await prisma.unit.create({
          data: {
            unitCode: unitName.substring(0, 30),
            name: unitName,
            status: "ACTIVE",
            createdById: actorId,
            updatedById: actorId,
          },
        });
        unitByUpper.set(unitName, unit);
      } else if (unit.status !== "ACTIVE" || unit.name !== unitName) {
        unit = await prisma.unit.update({
          where: { id: unit.id },
          data: {
            name: unitName,
            status: "ACTIVE",
            updatedById: actorId,
          },
        });
      }
      unitMap.set(unitName, unit.id);
    }

    // 4. Categories & Subcategories hierarchy (strictly from initialProducts.json)
    const catHierarchy = new Map(); // catUpper -> { displayName, subs: Map<subUpper, subDisplayName> }
    for (const p of initialProducts) {
      const cat = normalizeText(p.category) || "GENERAL";
      const sub = normalizeText(p.subCategory) || cat;
      const catUpper = cat.toUpperCase();
      const subUpper = sub.toUpperCase();

      if (!catHierarchy.has(catUpper)) {
        catHierarchy.set(catUpper, { displayName: cat, subs: new Map() });
      }
      catHierarchy.get(catUpper).subs.set(subUpper, sub);
    }

    const allSubOwners = new Map(); // subUpper -> Array<catUpper>
    for (const [catUpper, entry] of catHierarchy.entries()) {
      for (const subUpper of entry.subs.keys()) {
        if (subUpper !== catUpper) {
          if (!allSubOwners.has(subUpper)) allSubOwners.set(subUpper, []);
          allSubOwners.get(subUpper).push(catUpper);
        }
      }
    }

    const branchCategoryMap = new Map(); // `${branch.id}:${catUpper}:${subUpper}` -> categoryId
    const validCatNamesByBranch = new Map(); // branch.id -> Set<UPPERCASE_NAME>

    for (const branch of branches) {
      const existingCats = await prisma.itemCategory.findMany({
        where: { branchId: branch.id },
        select: { id: true, categoryCode: true, name: true, parentId: true, status: true },
      });

      const usedCodes = new Set(
        existingCats.map((c) => normalizeText(c.categoryCode).toUpperCase()).filter(Boolean)
      );
      const catByUpperName = new Map();
      for (const c of existingCats) {
        const key = c.name.trim().toUpperCase();
        if (!catByUpperName.has(key)) {
          catByUpperName.set(key, c);
        }
      }

      let codeSeq = 1;
      const nextCategoryCode = () => {
        let candidate = "";
        do {
          candidate = `CAT-${branch.code}-${String(codeSeq++).padStart(3, "0")}`;
        } while (usedCodes.has(candidate.toUpperCase()));
        usedCodes.add(candidate.toUpperCase());
        return candidate;
      };

      const validNamesUpper = new Set();
      validCatNamesByBranch.set(branch.id, validNamesUpper);
      const topCatByUpper = new Map();

      // 4A. Ensure all top-level Main Categories
      for (const [topUpper, { displayName: topCatName }] of catHierarchy.entries()) {
        validNamesUpper.add(topUpper);

        // Also check unnormalized whitespace matches in existing DB categories
        let topCat =
          catByUpperName.get(topUpper) ||
          existingCats.find(
            (c) => normalizeText(c.name).toUpperCase() === topUpper && !c.parentId
          ) ||
          existingCats.find((c) => normalizeText(c.name).toUpperCase() === topUpper);

        if (!topCat) {
          topCat = await prisma.itemCategory.create({
            data: {
              branchId: branch.id,
              categoryCode: nextCategoryCode(),
              name: topCatName,
              parentId: null,
              attributeSchema: Prisma.DbNull,
              status: "ACTIVE",
              createdById: actorId,
              updatedById: actorId,
            },
          });
          catByUpperName.set(topUpper, topCat);
        } else if (
          topCat.name !== topCatName ||
          topCat.parentId !== null ||
          topCat.status !== "ACTIVE"
        ) {
          // Ensure clean normalized name and root placement
          const conflictingTarget =
            topCat.name.toUpperCase() !== topUpper ? catByUpperName.get(topUpper) : null;
          if (!conflictingTarget || conflictingTarget.id === topCat.id) {
            catByUpperName.delete(topCat.name.trim().toUpperCase());
            topCat = await prisma.itemCategory.update({
              where: { id: topCat.id },
              data: {
                name: topCatName,
                parentId: null,
                attributeSchema: Prisma.DbNull,
                status: "ACTIVE",
                updatedById: actorId,
              },
            });
            catByUpperName.set(topUpper, topCat);
          } else {
            topCat = conflictingTarget;
          }
        }

        topCatByUpper.set(topUpper, topCat);
      }

      // 4B. Ensure all Child Subcategories under their exact Main Category
      for (const [topUpper, { displayName: topCatName, subs }] of catHierarchy.entries()) {
        const topCat = topCatByUpper.get(topUpper);

        for (const [subUpper, subName] of subs.entries()) {
          if (subUpper === topUpper) {
            branchCategoryMap.set(`${branch.id}:${topUpper}:${subUpper}`, topCat.id);
            continue;
          }

          const isColliding =
            (allSubOwners.get(subUpper)?.length || 0) > 1 || catHierarchy.has(subUpper);
          const finalSubName = isColliding ? `${subName} (${topCatName})` : subName;
          const finalSubUpper = finalSubName.toUpperCase();
          validNamesUpper.add(finalSubUpper);

          const legacyHyphenUpper = `${topCatName} - ${subName}`.toUpperCase();

          let subCat =
            catByUpperName.get(finalSubUpper) ||
            catByUpperName.get(legacyHyphenUpper) ||
            existingCats.find(
              (c) => normalizeText(c.name).toUpperCase() === finalSubUpper
            ) ||
            existingCats.find(
              (c) =>
                normalizeText(c.name).toUpperCase() === subUpper &&
                c.parentId === topCat.id
            );

          if (!subCat) {
            subCat = await prisma.itemCategory.create({
              data: {
                branchId: branch.id,
                categoryCode: nextCategoryCode(),
                name: finalSubName,
                parentId: topCat.id,
                attributeSchema: Prisma.DbNull,
                status: "ACTIVE",
                createdById: actorId,
                updatedById: actorId,
              },
            });
            catByUpperName.set(finalSubUpper, subCat);
          } else if (
            subCat.name !== finalSubName ||
            subCat.parentId !== topCat.id ||
            subCat.status !== "ACTIVE"
          ) {
            const conflictingTarget =
              subCat.name.toUpperCase() !== finalSubUpper
                ? catByUpperName.get(finalSubUpper)
                : null;
            if (!conflictingTarget || conflictingTarget.id === subCat.id) {
              catByUpperName.delete(subCat.name.trim().toUpperCase());
              subCat = await prisma.itemCategory.update({
                where: { id: subCat.id },
                data: {
                  name: finalSubName,
                  parentId: topCat.id,
                  attributeSchema: Prisma.DbNull,
                  status: "ACTIVE",
                  updatedById: actorId,
                },
              });
              catByUpperName.set(finalSubUpper, subCat);
            } else {
              subCat = conflictingTarget;
            }
          }

          branchCategoryMap.set(`${branch.id}:${topUpper}:${subUpper}`, subCat.id);
        }
      }
    }

    // 5. Create / Align Items per branch
    const fallbackUnitId = unitMap.get("PIECE") || [...unitMap.values()][0];
    let createdItemsTotal = 0;
    let updatedItemsTotal = 0;
    let createdBatchesTotal = 0;
    let totalStockUnits = 0;

    for (const branch of branches) {
      const existingItems = await prisma.item.findMany({
        where: { branchId: branch.id },
        select: {
          id: true,
          itemCode: true,
          itemName: true,
          description: true,
          brand: true,
          modelName: true,
          attributes: true,
          isSerialized: true,
          hasWarranty: true,
          status: true,
          categoryId: true,
          unitId: true,
          costPrice: true,
          price1: true,
          price2: true,
          price3: true,
          price4: true,
          price5: true,
          _count: { select: { inventoryBatches: true } },
        },
      });

      const existingByCode = new Map(existingItems.map((it) => [it.itemCode, it]));
      const toCreate = [];
      const toUpdate = [];

      for (const p of initialProducts) {
        const catUpper = (normalizeText(p.category) || "GENERAL").toUpperCase();
        const subUpper = (normalizeText(p.subCategory) || catUpper).toUpperCase();
        const targetCategoryId = branchCategoryMap.get(`${branch.id}:${catUpper}:${subUpper}`);
        const unitKey = (normalizeText(p.unit) || "PIECE").toUpperCase();
        const targetUnitId = unitMap.get(unitKey) || fallbackUnitId;
        const isSerialized = Boolean(p.isSerialized);
        const hasWarranty = Boolean(p.hasWarranty);
        const description =
          p.description ||
          (isSerialized ? "[WARRANTY: 1 YEAR WARRANTY]" : "[WARRANTY: NO WARRANTY]");

        const existing = existingByCode.get(p.itemCode);
        if (!existing) {
          toCreate.push({
            itemCode: p.itemCode,
            itemName: p.itemName,
            description,
            brand: null,
            modelName: null,
            isSerialized,
            hasWarranty,
            costPrice: p.costPrice,
            price1: p.price1,
            price2: p.price2,
            price3: p.price3,
            price4: p.price4,
            price5: p.price5,
            minimumStock: 5,
            reorderLevel: 5,
            status: "ACTIVE",
            branchId: branch.id,
            categoryId: targetCategoryId,
            unitId: targetUnitId,
            createdById: actorId,
            updatedById: actorId,
          });
        } else {
          const shouldUpdatePrices = force === true || initialItemCount === 0;
          const pricesDiffer =
            shouldUpdatePrices &&
            (Number(existing.costPrice) !== Number(p.costPrice) ||
              Number(existing.price1) !== Number(p.price1) ||
              Number(existing.price2) !== Number(p.price2) ||
              Number(existing.price3) !== Number(p.price3) ||
              Number(existing.price4) !== Number(p.price4) ||
              Number(existing.price5) !== Number(p.price5));

          const hasAttrs = existing.attributes !== null && existing.attributes !== undefined;
          const differs =
            existing.itemName !== p.itemName ||
            existing.categoryId !== targetCategoryId ||
            existing.unitId !== targetUnitId ||
            existing.isSerialized !== isSerialized ||
            existing.hasWarranty !== hasWarranty ||
            existing.description !== description ||
            existing.brand !== null ||
            existing.modelName !== null ||
            hasAttrs ||
            pricesDiffer;

          if (differs) {
            toUpdate.push({
              id: existing.id,
              data: {
                itemName: p.itemName,
                categoryId: targetCategoryId,
                unitId: targetUnitId,
                isSerialized,
                hasWarranty,
                description,
                brand: null,
                modelName: null,
                attributes: Prisma.DbNull,
                updatedById: actorId,
                ...(shouldUpdatePrices
                  ? {
                      costPrice: p.costPrice,
                      price1: p.price1,
                      price2: p.price2,
                      price3: p.price3,
                      price4: p.price4,
                      price5: p.price5,
                    }
                  : {}),
              },
            });
          }
        }
      }

      if (toCreate.length > 0) {
        await prisma.item.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
        createdItemsTotal += toCreate.length;
      }

      if (toUpdate.length > 0) {
        const CHUNK = 25;
        for (let i = 0; i < toUpdate.length; i += CHUNK) {
          const slice = toUpdate.slice(i, i + CHUNK);
          await Promise.all(
            slice.map((u) =>
              prisma.item.update({
                where: { id: u.id },
                data: u.data,
              })
            )
          );
        }
        updatedItemsTotal += toUpdate.length;
      }

      // Opening inventory batches for MAIN branch items with available > 0 and no existing batches
      if (branch.id === mainBranch.id) {
        const mainItems = await prisma.item.findMany({
          where: { branchId: mainBranch.id },
          select: {
            id: true,
            itemCode: true,
            _count: { select: { inventoryBatches: true } },
          },
        });
        const existingBatchCodes = new Set(
          (
            await prisma.inventoryBatch.findMany({
              where: {
                branchId: mainBranch.id,
                batchCode: { startsWith: "BAT-INIT-" },
              },
              select: { batchCode: true },
            })
          ).map((b) => b.batchCode)
        );
        const mainItemByCode = new Map(mainItems.map((it) => [it.itemCode, it]));

        const batchRows = [];
        const movementProductMeta = [];

        for (const p of initialProducts) {
          const availableQty = Number(p.available || 0);
          if (availableQty <= 0) continue;

          const itemRow = mainItemByCode.get(p.itemCode);
          if (!itemRow || itemRow._count.inventoryBatches > 0) continue;

          const batchCode = `BAT-INIT-${p.itemCode}`;
          if (existingBatchCodes.has(batchCode)) continue;

          totalStockUnits += availableQty;
          batchRows.push({
            batchCode,
            quantityIn: availableQty,
            quantityAvailable: availableQty,
            unitCost: p.costPrice,
            sellingPrice1: p.price1,
            sellingPrice2: p.price2,
            sellingPrice3: p.price3,
            sellingPrice4: p.price4,
            sellingPrice5: p.price5,
            remarks: "Opening inventory balance from product database",
            status: "ACTIVE",
            branchId: mainBranch.id,
            itemId: itemRow.id,
            createdById: actorId,
            updatedById: actorId,
          });
          movementProductMeta.push({
            batchCode,
            movementCode: `MOV-INIT-${p.itemCode}`,
            quantity: availableQty,
            unitCost: p.costPrice,
            itemId: itemRow.id,
          });
        }

        if (batchRows.length > 0) {
          await prisma.inventoryBatch.createMany({
            data: batchRows,
            skipDuplicates: true,
          });
          createdBatchesTotal += batchRows.length;

          const createdBatches = await prisma.inventoryBatch.findMany({
            where: {
              branchId: mainBranch.id,
              batchCode: { in: batchRows.map((b) => b.batchCode) },
            },
            select: { id: true, batchCode: true },
          });
          const batchIdByCode = new Map(createdBatches.map((b) => [b.batchCode, b.id]));

          const movementRows = movementProductMeta
            .map((m) => ({
              movementCode: m.movementCode,
              type: "STOCK_IN",
              source: "MANUAL",
              quantity: m.quantity,
              previousQuantity: 0,
              newQuantity: m.quantity,
              unitCost: m.unitCost,
              remarks: "Opening inventory balance",
              branchId: mainBranch.id,
              itemId: m.itemId,
              batchId: batchIdByCode.get(m.batchCode) || null,
              createdById: actorId,
              updatedById: actorId,
            }))
            .filter((m) => Boolean(m.batchId));

          if (movementRows.length > 0) {
            await prisma.inventoryMovement.createMany({
              data: movementRows,
              skipDuplicates: true,
            });
          }
        }
      }
    }

    // 6. Clean up unused dummy / legacy categories (with 0 items attached)
    let deletedCategoriesTotal = 0;
    for (const branch of branches) {
      const validNamesUpper = validCatNamesByBranch.get(branch.id) || new Set();
      const cats = await prisma.itemCategory.findMany({
        where: { branchId: branch.id },
        select: {
          id: true,
          categoryCode: true,
          name: true,
          _count: { select: { items: true } },
        },
      });

      const orphanIds = cats
        .filter((c) => {
          if (c._count.items > 0) return false;
          const nameUpper = c.name.trim().toUpperCase();
          if (validNamesUpper.has(nameUpper)) return false;

          if (force === true) return true;
          return (
            LEGACY_DUMMY_CATEGORY_NAMES.has(nameUpper) ||
            !/^CAT-[A-Z0-9]+-\d+$/i.test(c.categoryCode || "") ||
            c.name !== normalizeText(c.name) ||
            c.name.includes(" - ")
          );
        })
        .map((c) => c.id);

      if (orphanIds.length > 0) {
        await prisma.itemCategory.updateMany({
          where: { branchId: branch.id, parentId: { in: orphanIds } },
          data: { parentId: null },
        });
        const deleted = await prisma.itemCategory.deleteMany({
          where: { id: { in: orphanIds } },
        });
        deletedCategoriesTotal += deleted.count;
      }
    }

    // 7. Clean up unused units not in Excel dataset
    const validUnitsUpper = new Set([...uniqueUnitNames]);
    const allUnitsWithCount = await prisma.unit.findMany({
      select: {
        id: true,
        name: true,
        unitCode: true,
        _count: { select: { items: true } },
      },
    });
    const unusedUnitIds = allUnitsWithCount
      .filter(
        (u) =>
          u._count.items === 0 &&
          !validUnitsUpper.has(normalizeText(u.name).toUpperCase()) &&
          !validUnitsUpper.has(normalizeText(u.unitCode).toUpperCase())
      )
      .map((u) => u.id);
    if (unusedUnitIds.length > 0) {
      await prisma.unit.deleteMany({
        where: { id: { in: unusedUnitIds } },
      });
    }

    // 8. Sync Service & Repair Rates Catalog (GLOBAL:service.catalog)
    const existingServiceCatalog = await prisma.businessSetting.findUnique({
      where: { scopeKey: "GLOBAL:service.catalog" },
      select: { value: true },
    });
    const serviceCatalogRows = Array.isArray(existingServiceCatalog?.value)
      ? existingServiceCatalog.value
      : null;
    const hasLegacyDummyServiceCatalog = Boolean(
      serviceCatalogRows?.some((item) => item && item.id === "sc-clean-laptop")
    );

    if (
      force === true ||
      !serviceCatalogRows ||
      serviceCatalogRows.length === 0 ||
      hasLegacyDummyServiceCatalog
    ) {
      await prisma.businessSetting.upsert({
        where: { scopeKey: "GLOBAL:service.catalog" },
        create: {
          scopeKey: "GLOBAL:service.catalog",
          key: "service.catalog",
          category: "OPERATION",
          valueType: "JSON",
          value: initialServiceCatalog,
          label: "Service & Repair Rates Catalog",
          description:
            "Predefined list of standard service rates, repair classifications, and pricing.",
          isEditable: true,
          isActive: true,
          ...(actorId ? { updatedById: actorId } : {}),
        },
        update: {
          value: initialServiceCatalog,
          isEditable: true,
          isActive: true,
          ...(actorId ? { updatedById: actorId } : {}),
        },
      });
      logger.info(
        `Synced GLOBAL:service.catalog with ${initialServiceCatalog.length} official service rates.`
      );
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      `Product catalog sync completed in ${duration}s. Created items: ${createdItemsTotal}, Updated items: ${updatedItemsTotal}, Created batches: ${createdBatchesTotal}, Deleted dummy categories: ${deletedCategoriesTotal}`
    );

    return {
      success: true,
      items: initialProducts.length,
      createdItems: createdItemsTotal,
      updatedItems: updatedItemsTotal,
      batches: createdBatchesTotal,
      totalStockUnits,
      deletedDummyCategories: deletedCategoriesTotal,
      duration,
    };
  } catch (error) {
    logger.error("Error in product catalog bootstrap:", {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

module.exports = {
  ensureProductCatalog,
  bootstrapProductCatalog: ensureProductCatalog,
  syncItemSerializationAndWarranty,
};
