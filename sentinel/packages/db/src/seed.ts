import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Demo Organization",
      slug: "demo",
      plan: "professional",
      settings: {},
    },
  });

  const projects = await Promise.all([
    prisma.project.create({
      data: { orgId: org.id, name: "sentinel-core", repoUrl: "https://github.com/demo/sentinel-core" },
    }).catch(() => prisma.project.findFirst({ where: { name: "sentinel-core" } })),
    prisma.project.create({
      data: { orgId: org.id, name: "payment-service", repoUrl: "https://github.com/demo/payment-service" },
    }).catch(() => prisma.project.findFirst({ where: { name: "payment-service" } })),
    prisma.project.create({
      data: { orgId: org.id, name: "auth-gateway", repoUrl: "https://github.com/demo/auth-gateway" },
    }).catch(() => prisma.project.findFirst({ where: { name: "auth-gateway" } })),
  ]);

  await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      orgId: org.id,
      email: "admin@demo.com",
      name: "Admin",
      role: "admin",
      authProvider: "github",
    },
  });

  console.log("Seeded:", { org: org.slug, projects: projects.length, user: "admin@demo.com" });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
