const { z } = require("zod");

const restoreDatabaseSchema = z.object({
  password: z
    .string()
    .min(1, "Password is required to confirm database restore"),
  backupData: z.object({
    version: z.string().optional(),
    exportedAt: z.string().optional(),
    checksum: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    data: z.record(z.any()).refine(
      (val) => typeof val === "object" && val !== null,
      "Backup data must contain a valid tables record"
    ),
  }),
});

module.exports = {
  restoreDatabaseSchema,
};
