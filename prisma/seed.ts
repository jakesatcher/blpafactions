import { PrismaClient } from "@prisma/client";
import { ORDERS } from "../src/lib/orders";

const prisma = new PrismaClient();

async function main() {
  for (const order of ORDERS) {
    await prisma.order.upsert({
      where: { slug: order.slug },
      update: { name: order.name, animal: order.animal },
      create: order,
    });
  }
  console.log(`Seeded ${ORDERS.length} Orders.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
