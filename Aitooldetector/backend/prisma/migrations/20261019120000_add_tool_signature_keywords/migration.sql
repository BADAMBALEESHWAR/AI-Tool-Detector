-- `keywords` was added to schema.prisma without a migration (databases created
-- with `prisma db push` already have it), so it is added idempotently here.
ALTER TABLE "ai_tool_signatures" ADD COLUMN IF NOT EXISTS "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[];
