-- CreateTable
CREATE TABLE "github_installations" (
    "id" UUID NOT NULL,
    "installation_id" INTEGER NOT NULL,
    "org_id" UUID NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_installations_installation_id_key" ON "github_installations"("installation_id");

-- CreateIndex
CREATE INDEX "github_installations_org_id_idx" ON "github_installations"("org_id");
