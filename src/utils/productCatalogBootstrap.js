const prisma = require("../config/prisma");
const logger = require("./logger");
const initialProducts = require("../data/initialProducts.json");

const ensureProductCatalog = async (force = false) => {
  try {
    const currentCount = await prisma.item.count();
    if (currentCount > 0 && !force) {
      logger.info(`Product catalog already populated (${currentCount} items)`);
      return { skipped: true, currentCount };
    }

    logger.info("Initializing product catalog from real dataset...");
    const startTime = Date.now();

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
    const otherBranches = branches.filter((b) => b.id !== mainBranch.id);

    // 2. Superowner / Admin actor
    const actorUser = await prisma.user.findFirst({
      where: {
        OR: [
          { role: "SUPER_OWNER" },
          { username: "superowner" },
          { username: "calix" },
        ],
      },
      select: { id: true },
    });
    const actorId = actorUser?.id || null;

    // 3. Units of Measure
    const uniqueUnitNames = new Set();
    initialProducts.forEach((p) => {
      uniqueUnitNames.add(p.unit || "PIECE");
    });

    const unitMap = new Map();
    for (const unitName of uniqueUnitNames) {
      let unit = await prisma.unit.findFirst({
        where: {
          OR: [
            { name: { equals: unitName, mode: "insensitive" } },
            { unitCode: { equals: unitName, mode: "insensitive" } },
          ],
        },
      });

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
      }
      unitMap.set(unitName, unit.id);
    }

    // 4. Categories & Subcategories
    const catHierarchy = new Map();
    initialProducts.forEach((p) => {
      const cat = p.category || "GENERAL";
      const sub = p.subCategory || cat;
      if (!catHierarchy.has(cat)) catHierarchy.set(cat, new Set());
      catHierarchy.get(cat).add(sub);
    });

    const allSubNames = new Map();
    for (const [cat, subs] of catHierarchy.entries()) {
      for (const sub of subs) {
        if (sub !== cat) {
          if (!allSubNames.has(sub)) allSubNames.set(sub, []);
          allSubNames.get(sub).push(cat);
        }
      }
    }

    const branchCategoryMap = new Map();

    for (const branch of branches) {
      let catCounter = 1;
      for (const [topCatName, subcats] of catHierarchy.entries()) {
        let topCat = await prisma.itemCategory.findFirst({
          where: {
            branchId: branch.id,
            name: { equals: topCatName, mode: "insensitive" },
            parentId: null,
          },
        });

        if (!topCat) {
          const catCode = `CAT-${branch.code}-${String(catCounter++).padStart(3, "0")}`;
          topCat = await prisma.itemCategory.create({
            data: {
              branchId: branch.id,
              categoryCode: catCode,
              name: topCatName,
              status: "ACTIVE",
              createdById: actorId,
              updatedById: actorId,
            },
          });
        }

        for (const subcatName of subcats) {
          if (subcatName === topCatName) {
            branchCategoryMap.set(`${branch.id}:${topCatName}:${subcatName}`, topCat.id);
          } else {
            const isColliding =
              (allSubNames.get(subcatName)?.length || 0) > 1 || catHierarchy.has(subcatName);
            const finalSubName = isColliding ? `${topCatName} - ${subcatName}` : subcatName;

            let subCat = await prisma.itemCategory.findFirst({
              where: {
                branchId: branch.id,
                name: { equals: finalSubName, mode: "insensitive" },
              },
            });

            if (!subCat) {
              const subCode = `CAT-${branch.code}-${String(catCounter++).padStart(3, "0")}`;
              subCat = await prisma.itemCategory.create({
                data: {
                  branchId: branch.id,
                  categoryCode: subCode,
                  name: finalSubName,
                  parentId: topCat.id,
                  status: "ACTIVE",
                  createdById: actorId,
                  updatedById: actorId,
                },
              });
            }
            branchCategoryMap.set(`${branch.id}:${topCatName}:${subcatName}`, subCat.id);
          }
        }
      }
    }

    // 5. Items and Inventory Batches
    let batchCount = 0;
    let totalStockUnits = 0;

    for (let i = 0; i < initialProducts.length; i++) {
      const p = initialProducts[i];
      const itemCode = p.itemCode;
      const itemName = p.itemName;
      const catName = p.category;
      const subcatName = p.subCategory || catName;
      const unitId = unitMap.get(p.unit) || unitMap.get("PIECE");

      const costPrice = p.costPrice;
      const price1 = p.price1;
      const price2 = p.price2;
      const price3 = p.price3;
      const price4 = p.price4;
      const price5 = p.price5;
      const availableQty = p.available;

      const mainCatId = branchCategoryMap.get(`${mainBranch.id}:${catName}:${subcatName}`);

      const mainItem = await prisma.item.create({
        data: {
          itemCode,
          itemName,
          costPrice,
          price1,
          price2,
          price3,
          price4,
          price5,
          minimumStock: 5,
          reorderLevel: 5,
          status: "ACTIVE",
          branchId: mainBranch.id,
          categoryId: mainCatId,
          unitId,
          createdById: actorId,
          updatedById: actorId,
        },
      });

      if (availableQty > 0) {
        batchCount++;
        totalStockUnits += availableQty;
        const batchCode = `BAT-INIT-${itemCode}`;
        const movementCode = `MOV-INIT-${itemCode}`;

        const batch = await prisma.inventoryBatch.create({
          data: {
            batchCode,
            quantityIn: availableQty,
            quantityAvailable: availableQty,
            unitCost: costPrice,
            sellingPrice1: price1,
            sellingPrice2: price2,
            sellingPrice3: price3,
            sellingPrice4: price4,
            sellingPrice5: price5,
            remarks: "Opening inventory balance from product database",
            status: "ACTIVE",
            branchId: mainBranch.id,
            itemId: mainItem.id,
            createdById: actorId,
            updatedById: actorId,
          },
        });

        await prisma.inventoryMovement.create({
          data: {
            movementCode,
            type: "STOCK_IN",
            source: "MANUAL",
            quantity: availableQty,
            previousQuantity: 0,
            newQuantity: availableQty,
            unitCost: costPrice,
            remarks: "Opening inventory balance",
            branchId: mainBranch.id,
            itemId: mainItem.id,
            batchId: batch.id,
            createdById: actorId,
            updatedById: actorId,
          },
        });
      }

      for (const otherBranch of otherBranches) {
        const otherCatId = branchCategoryMap.get(`${otherBranch.id}:${catName}:${subcatName}`);
        await prisma.item.create({
          data: {
            itemCode,
            itemName,
            costPrice,
            price1,
            price2,
            price3,
            price4,
            price5,
            minimumStock: 5,
            reorderLevel: 5,
            status: "ACTIVE",
            branchId: otherBranch.id,
            categoryId: otherCatId,
            unitId,
            createdById: actorId,
            updatedById: actorId,
          },
        });
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Product catalog bootstrap completed in ${duration}s. Items: ${initialProducts.length}, Batches: ${batchCount}, Total Units: ${totalStockUnits}`);
    return {
      success: true,
      items: initialProducts.length,
      batches: batchCount,
      totalStockUnits,
      duration,
    };
  } catch (error) {
    logger.error("Error in product catalog bootstrap:", { message: error.message, stack: error.stack });
    throw error;
  }
};

module.exports = { ensureProductCatalog };
