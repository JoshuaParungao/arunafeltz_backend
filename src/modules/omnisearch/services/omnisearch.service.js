const prisma = require("../../../config/prisma");

const isSuperOwner = (actor) => actor && actor.role === "SUPER_OWNER";

const resolveBranchId = (actor, requestedBranchId) => {
  if (isSuperOwner(actor)) {
    return requestedBranchId || actor.branchId || undefined;
  }
  return actor.branchId || requestedBranchId || undefined;
};

const executeOmnisearch = async (actor, { query = "", branchId: requestedBranchId = null }) => {
  const searchTerm = String(query || "").trim();
  if (!searchTerm) {
    return {
      products: [],
      serials: [],
      receipts: [],
      quotations: [],
      customers: [],
    };
  }

  const branchId = resolveBranchId(actor, requestedBranchId);
  const branchFilter = branchId ? { branchId } : {};

  // Check if search query might be a 5-digit number or numeric code (e.g. "00001" or "1")
  const numericMatch = searchTerm.match(/^\d+$/);
  const paddedCode = numericMatch ? searchTerm.padStart(5, "0") : null;

  // Execute 5 parallel queries using Promise.all for speed
  const [items, serials, sales, quotations, customers] = await Promise.all([
    // 1. Items / Products Lookup
    prisma.item.findMany({
      where: {
        ...branchFilter,
        status: "ACTIVE",
        OR: [
          { itemCode: { contains: searchTerm, mode: "insensitive" } },
          { itemName: { contains: searchTerm, mode: "insensitive" } },
          { brand: { contains: searchTerm, mode: "insensitive" } },
          { modelName: { contains: searchTerm, mode: "insensitive" } },
          { barcode: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: {
        id: true,
        itemCode: true,
        itemName: true,
        brand: true,
        modelName: true,
        isSerialized: true,
        hasWarranty: true,
        price1: true,
        inventoryBatches: {
          where: {
            status: "ACTIVE",
          },
          select: {
            quantityAvailable: true,
          },
        },
      },
    }),

    // 2. Serial Numbers & Barcodes
    prisma.itemSerial.findMany({
      where: {
        ...branchFilter,
        OR: [
          { serialNumber: { contains: searchTerm, mode: "insensitive" } },
          { item: { itemCode: { contains: searchTerm, mode: "insensitive" } } },
          { item: { itemName: { contains: searchTerm, mode: "insensitive" } } },
        ],
      },
      take: 6,
      select: {
        id: true,
        serialNumber: true,
        status: true,
        remarks: true,
        item: {
          select: {
            id: true,
            itemCode: true,
            itemName: true,
            brand: true,
            hasWarranty: true,
          },
        },
        saleItems: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            sale: {
              select: {
                id: true,
                receiptCode: true,
                saleDate: true,
                customer: {
                  select: {
                    id: true,
                    fullName: true,
                    mobileNumber: true,
                  },
                },
              },
            },
          },
        },
      },
    }),

    // 3. Receipts & Sales
    prisma.sale.findMany({
      where: {
        ...branchFilter,
        OR: [
          { receiptCode: { contains: searchTerm, mode: "insensitive" } },
          ...(paddedCode ? [{ receiptCode: { contains: paddedCode, mode: "insensitive" } }] : []),
          { customer: { fullName: { contains: searchTerm, mode: "insensitive" } } },
          { customer: { mobileNumber: { contains: searchTerm, mode: "insensitive" } } },
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        receiptCode: true,
        saleDate: true,
        createdAt: true,
        grandTotal: true,
        status: true,
        paymentStatus: true,
        customer: {
          select: {
            id: true,
            fullName: true,
            mobileNumber: true,
          },
        },
      },
    }),

    // 4. Quotations
    prisma.quotation.findMany({
      where: {
        ...branchFilter,
        OR: [
          { quotationCode: { contains: searchTerm, mode: "insensitive" } },
          ...(paddedCode ? [{ quotationCode: { contains: paddedCode, mode: "insensitive" } }] : []),
          { customer: { fullName: { contains: searchTerm, mode: "insensitive" } } },
          { title: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        quotationCode: true,
        createdAt: true,
        validUntil: true,
        grandTotal: true,
        status: true,
        isPcBuild: true,
        customer: {
          select: {
            id: true,
            fullName: true,
            mobileNumber: true,
          },
        },
      },
    }),

    // 5. Customers
    prisma.customer.findMany({
      where: {
        ...branchFilter,
        status: "ACTIVE",
        OR: [
          { fullName: { contains: searchTerm, mode: "insensitive" } },
          { mobileNumber: { contains: searchTerm, mode: "insensitive" } },
          { email: { contains: searchTerm, mode: "insensitive" } },
          { companyName: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: {
        id: true,
        customerCode: true,
        fullName: true,
        mobileNumber: true,
        email: true,
        priceTier: true,
      },
    }),
  ]);

  // Format and aggregate items stock count
  const formattedProducts = items.map((item) => {
    const totalAvailable = item.inventoryBatches.reduce(
      (acc, batch) => acc + Number(batch.quantityAvailable || 0),
      0
    );

    return {
      id: item.id,
      itemCode: item.itemCode,
      itemName: item.itemName,
      brand: item.brand,
      modelName: item.modelName,
      price: Number(item.price1 || 0),
      isSerialized: item.isSerialized,
      hasWarranty: item.hasWarranty,
      stock: totalAvailable,
    };
  });

  const formattedSerials = serials.map((serial) => {
    const lastSaleItem = serial.saleItems?.[0];
    const sale = lastSaleItem?.sale;
    return {
      id: serial.id,
      serialNumber: serial.serialNumber,
      status: serial.status,
      remarks: serial.remarks,
      itemCode: serial.item?.itemCode,
      itemName: serial.item?.itemName,
      receiptCode: sale?.receiptCode || null,
      soldTo: sale?.customer?.fullName || null,
      saleDate: sale?.saleDate || null,
    };
  });

  return {
    products: formattedProducts,
    serials: formattedSerials,
    receipts: sales,
    quotations,
    customers,
  };
};

module.exports = {
  executeOmnisearch,
};
