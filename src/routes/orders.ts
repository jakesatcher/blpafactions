import { Router } from "express";
import { prisma } from "../lib/prisma";
import { isOrderSlug } from "../lib/orders";
import { getOrderTotals } from "../services/orderTotals";

export const ordersRouter = Router();

ordersRouter.get("/orders", async (_req, res) => {
  const orders = await prisma.order.findMany({ orderBy: { slug: "asc" } });
  res.json(orders);
});

ordersRouter.get("/orders/totals", async (_req, res) => {
  res.json(await getOrderTotals());
});

ordersRouter.get("/orders/:slug", async (req, res) => {
  if (!isOrderSlug(req.params.slug)) {
    return res.status(404).json({ error: "unknown Order" });
  }
  const order = await prisma.order.findUnique({ where: { slug: req.params.slug } });
  res.json(order);
});
