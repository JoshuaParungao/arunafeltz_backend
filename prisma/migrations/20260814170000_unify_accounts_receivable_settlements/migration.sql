-- PostgreSQL requires a newly added enum value to be committed before a
-- later migration can reference it in a check constraint.
ALTER TYPE "ServicePaymentStatus" ADD VALUE 'CANCELLED';
