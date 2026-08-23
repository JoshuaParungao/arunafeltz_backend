const fs = require("fs");

const filePath = "./prisma/schema.prisma";

if (!fs.existsSync(filePath)) {
  console.error("schema.prisma not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (content.includes("model CreditAccount") || content.includes("model CreditCollection")) {
  console.log("SKIP: Credit / Installment models already exist.");
  process.exit(0);
}

content = content.replace(
  `enum SalePaymentStatus {
  PAID
  PARTIALLY_PAID
  UNPAID
  REFUNDED
}
`,
  `enum SalePaymentStatus {
  PAID
  PARTIALLY_PAID
  UNPAID
  REFUNDED
}

enum InstallmentTerm {
  STRAIGHT
  MONTH_3
  MONTH_6
  MONTH_9
  MONTH_12
  MONTH_18
  MONTH_24
}

enum CreditAccountStatus {
  ACTIVE
  PAID
  CANCELLED
  DEFAULTED
}

enum CreditCollectionStatus {
  POSTED
  CANCELLED
}
`
);

content = content.replace(
  `  quotations         Quotation[]
  sales              Sale[]
`,
  `  quotations         Quotation[]
  sales              Sale[]
  creditAccounts     CreditAccount[]
  creditCollections  CreditCollection[]
`
);

content = content.replace(
  `  createdSalePayments       SalePayment[]       @relation("SalePaymentCreatedBy")
`,
  `  createdSalePayments       SalePayment[]       @relation("SalePaymentCreatedBy")
  createdCreditAccounts       CreditAccount[]     @relation("CreditAccountCreatedBy")
  updatedCreditAccounts       CreditAccount[]     @relation("CreditAccountUpdatedBy")
  cancelledCreditAccounts     CreditAccount[]     @relation("CreditAccountCancelledBy")
  collectedCreditCollections  CreditCollection[]  @relation("CreditCollectionCollectedBy")
  createdCreditCollections    CreditCollection[]  @relation("CreditCollectionCreatedBy")
  cancelledCreditCollections  CreditCollection[]  @relation("CreditCollectionCancelledBy")
`
);

content = content.replace(
  `  quotations Quotation[]
  sales      Sale[]
`,
  `  quotations        Quotation[]
  sales             Sale[]
  creditAccounts    CreditAccount[]
  creditCollections CreditCollection[]
`
);

content = content.replace(
  `  items    SaleItem[]
  payments SalePayment[]
`,
  `  items         SaleItem[]
  payments      SalePayment[]
  creditAccount CreditAccount?
`
);

content = content + `

model CreditAccount {
  id String @id @default(cuid())

  creditCode String
  status     CreditAccountStatus @default(ACTIVE)

  term      InstallmentTerm
  termBasis Decimal @db.Decimal(8, 4)

  cashPromoTotalAmount    Decimal @db.Decimal(12, 2)
  regularPriceTotalAmount Decimal @db.Decimal(12, 2)
  downpaymentAmount       Decimal @default(0) @db.Decimal(12, 2)

  balanceAmount    Decimal @db.Decimal(12, 2)
  monthlyDueAmount Decimal? @db.Decimal(12, 2)
  totalCollected   Decimal @default(0) @db.Decimal(12, 2)
  remainingBalance Decimal @db.Decimal(12, 2)

  dueDay      Int?
  firstDueDate DateTime?
  nextDueDate  DateTime?

  paidAt              DateTime?
  cancelledAt         DateTime?
  cancellationReason  String?
  remarks             String?

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Restrict)

  saleId String? @unique
  sale   Sale?   @relation(fields: [saleId], references: [id], onDelete: SetNull)

  createdById String?
  createdBy   User?   @relation("CreditAccountCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  updatedById String?
  updatedBy   User?   @relation("CreditAccountUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy   User?   @relation("CreditAccountCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  collections CreditCollection[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, creditCode])
  @@index([branchId])
  @@index([customerId])
  @@index([saleId])
  @@index([status])
  @@index([term])
  @@index([nextDueDate])
  @@index([createdById])
  @@index([updatedById])
  @@index([cancelledById])
}

model CreditCollection {
  id String @id @default(cuid())

  collectionCode String
  status         CreditCollectionStatus @default(POSTED)

  amount          Decimal @db.Decimal(12, 2)
  previousBalance Decimal @db.Decimal(12, 2)
  newBalance      Decimal @db.Decimal(12, 2)

  paymentMethod SalePaymentMethod @default(CASH)
  referenceNo   String?
  remarks       String?
  paidAt        DateTime @default(now())

  cancelledAt        DateTime?
  cancellationReason String?

  creditAccountId String
  creditAccount   CreditAccount @relation(fields: [creditAccountId], references: [id], onDelete: Restrict)

  branchId String
  branch   Branch @relation(fields: [branchId], references: [id], onDelete: Restrict)

  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Restrict)

  collectedById String?
  collectedBy   User?   @relation("CreditCollectionCollectedBy", fields: [collectedById], references: [id], onDelete: SetNull)

  createdById String?
  createdBy   User?   @relation("CreditCollectionCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  cancelledById String?
  cancelledBy   User?   @relation("CreditCollectionCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([branchId, collectionCode])
  @@index([creditAccountId])
  @@index([branchId])
  @@index([customerId])
  @@index([status])
  @@index([paymentMethod])
  @@index([paidAt])
  @@index([collectedById])
  @@index([createdById])
  @@index([cancelledById])
}
`;

fs.writeFileSync(filePath, content);

console.log("DONE: Credit / Installment Prisma models added.");
