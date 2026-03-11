-- AlterTable: Add new fields to users
ALTER TABLE "users" ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "external_id" TEXT;
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_external_id_idx" ON "users"("external_id");

-- CreateTable: sso_configs
CREATE TABLE "sso_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "issuer_url" TEXT,
    "saml_metadata" TEXT,
    "scim_token" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sso_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sso_configs_org_id_provider_key" ON "sso_configs"("org_id", "provider");
ALTER TABLE "sso_configs" ADD CONSTRAINT "sso_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: org_memberships
CREATE TABLE "org_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "org_memberships_org_id_user_id_key" ON "org_memberships"("org_id", "user_id");
CREATE INDEX "org_memberships_user_id_idx" ON "org_memberships"("user_id");
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: encryption_keys
CREATE TABLE "encryption_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "wrapped_dek" TEXT NOT NULL,
    "kek_id" TEXT NOT NULL,
    "kek_provider" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "encryption_keys_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "encryption_keys_org_id_purpose_active_idx" ON "encryption_keys"("org_id", "purpose", "active");
ALTER TABLE "encryption_keys" ADD CONSTRAINT "encryption_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: api_keys
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_salt" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'service',
    "expires_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_keys_key_prefix_idx" ON "api_keys"("key_prefix");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: scim_sync_states
CREATE TABLE "scim_sync_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "last_sync_at" TIMESTAMP(3) NOT NULL,
    "users_created" INTEGER NOT NULL DEFAULT 0,
    "users_updated" INTEGER NOT NULL DEFAULT 0,
    "users_deleted" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "error_detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scim_sync_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scim_sync_states_org_id_key" ON "scim_sync_states"("org_id");
ALTER TABLE "scim_sync_states" ADD CONSTRAINT "scim_sync_states_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
