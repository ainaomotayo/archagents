-- CreateTable
CREATE TABLE "vcs_installations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "installation_id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT,
    "display_name" TEXT,
    "webhook_secret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "vcs_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vcs_installation_github" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vcs_installation_id" UUID NOT NULL,
    "app_id" TEXT NOT NULL,
    "numeric_install_id" INTEGER NOT NULL,
    "private_key" TEXT NOT NULL,

    CONSTRAINT "vcs_installation_github_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vcs_installation_gitlab" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vcs_installation_id" UUID NOT NULL,
    "gitlab_url" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "token_type" TEXT NOT NULL,

    CONSTRAINT "vcs_installation_gitlab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vcs_installation_bitbucket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vcs_installation_id" UUID NOT NULL,
    "workspace" TEXT NOT NULL,
    "client_key" TEXT NOT NULL,
    "shared_secret" TEXT NOT NULL,

    CONSTRAINT "vcs_installation_bitbucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vcs_installation_azure_devops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vcs_installation_id" UUID NOT NULL,
    "organization_url" TEXT NOT NULL,
    "project_name" TEXT NOT NULL,
    "pat" TEXT NOT NULL,

    CONSTRAINT "vcs_installation_azure_devops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vcs_installations_provider_installation_id_key" ON "vcs_installations"("provider", "installation_id");

-- CreateIndex
CREATE INDEX "vcs_installations_org_id_provider_idx" ON "vcs_installations"("org_id", "provider");

-- CreateIndex
CREATE INDEX "vcs_installations_provider_owner_idx" ON "vcs_installations"("provider", "owner");

-- CreateIndex
CREATE UNIQUE INDEX "vcs_installation_github_vcs_installation_id_key" ON "vcs_installation_github"("vcs_installation_id");

-- CreateIndex
CREATE UNIQUE INDEX "vcs_installation_gitlab_vcs_installation_id_key" ON "vcs_installation_gitlab"("vcs_installation_id");

-- CreateIndex
CREATE UNIQUE INDEX "vcs_installation_bitbucket_vcs_installation_id_key" ON "vcs_installation_bitbucket"("vcs_installation_id");

-- CreateIndex
CREATE UNIQUE INDEX "vcs_installation_azure_devops_vcs_installation_id_key" ON "vcs_installation_azure_devops"("vcs_installation_id");

-- AddForeignKey
ALTER TABLE "vcs_installations" ADD CONSTRAINT "vcs_installations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vcs_installation_github" ADD CONSTRAINT "vcs_installation_github_vcs_installation_id_fkey" FOREIGN KEY ("vcs_installation_id") REFERENCES "vcs_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vcs_installation_gitlab" ADD CONSTRAINT "vcs_installation_gitlab_vcs_installation_id_fkey" FOREIGN KEY ("vcs_installation_id") REFERENCES "vcs_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vcs_installation_bitbucket" ADD CONSTRAINT "vcs_installation_bitbucket_vcs_installation_id_fkey" FOREIGN KEY ("vcs_installation_id") REFERENCES "vcs_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vcs_installation_azure_devops" ADD CONSTRAINT "vcs_installation_azure_devops_vcs_installation_id_fkey" FOREIGN KEY ("vcs_installation_id") REFERENCES "vcs_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
