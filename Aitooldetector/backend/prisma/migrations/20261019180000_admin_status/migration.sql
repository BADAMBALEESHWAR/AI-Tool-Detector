-- Sign-up requests wait as 'pending' until a superadmin approves them.
ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
