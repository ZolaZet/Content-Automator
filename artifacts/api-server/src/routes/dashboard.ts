import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable, contentTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (_req, res) => {
  const businesses = await db.select().from(businessesTable);
  const allContent = await db.select().from(contentTable);
  const recentActivity = await db.select().from(activityTable);

  const totalBusinesses = businesses.length;
  const pendingReview = allContent.filter((c) => c.status === "pending_review").length;
  const totalPublished = allContent.filter((c) => c.status === "approved" || c.status === "published").length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const publishedThisMonth = allContent.filter(
    (c) =>
      (c.status === "approved" || c.status === "published") &&
      c.approvedAt &&
      new Date(c.approvedAt) >= startOfMonth
  ).length;

  const pendingBusinesses = businesses.filter((b) => b.status === "pending");
  const nextScheduledDate = pendingBusinesses.length > 0
    ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    : null;

  const activity = recentActivity
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((a) => ({
      id: a.id,
      type: a.type,
      description: a.description,
      createdAt: a.createdAt,
    }));

  res.json({
    totalBusinesses,
    pendingReview,
    publishedThisMonth,
    totalPublished,
    nextScheduledDate,
    recentActivity: activity,
  });
});

export default router;
