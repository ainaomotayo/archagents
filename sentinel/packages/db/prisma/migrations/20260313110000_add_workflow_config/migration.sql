CREATE TABLE "workflow_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "skip_stages" TEXT[] NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "workflow_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "workflow_configs_org_id_key" ON "workflow_configs"("org_id");
ALTER TABLE "workflow_configs" ADD CONSTRAINT "workflow_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
