-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "DeviceOS" AS ENUM ('WINDOWS', 'MACOS', 'LINUX', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "ToolType" AS ENUM ('WEB', 'APP', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('BUILT_IN', 'APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('DESKTOP_APP', 'BROWSER_EXTENSION');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_master_entries" (
    "id" TEXT NOT NULL,
    "sap_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_master_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "sap_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "os_type" "DeviceOS" NOT NULL DEFAULT 'UNKNOWN',
    "hostname" TEXT NOT NULL,
    "app_version" TEXT,
    "extension_status" BOOLEAN NOT NULL DEFAULT false,
    "device_token_hash" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_signatures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ToolType" NOT NULL DEFAULT 'WEB',
    "pattern" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "icon_url" TEXT,
    "status" "ToolStatus" NOT NULL DEFAULT 'BUILT_IN',
    "added_by" TEXT NOT NULL DEFAULT 'system',
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_tool_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "tool_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "source" "UsageSource" NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "raw_identifier" TEXT,
    "browser_name" TEXT,
    "is_unknown_tool" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "student_master_entries_sap_id_key" ON "student_master_entries"("sap_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_sap_id_key" ON "students"("sap_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_email_key" ON "students"("email");

-- CreateIndex
CREATE UNIQUE INDEX "devices_student_id_hostname_key" ON "devices"("student_id", "hostname");

-- CreateIndex
CREATE INDEX "usage_events_student_id_idx" ON "usage_events"("student_id");

-- CreateIndex
CREATE INDEX "usage_events_tool_id_idx" ON "usage_events"("tool_id");

-- CreateIndex
CREATE INDEX "usage_events_start_time_idx" ON "usage_events"("start_time");

-- CreateIndex
CREATE INDEX "usage_events_source_idx" ON "usage_events"("source");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "ai_tool_signatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
