import { Router } from "express";
import { db } from "@workspace/db";
import { businessesTable, contentTable, activityTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/dashboard/stats", async (_req, res) => {
  const businesses = await db.select().from(businessesTable);
  const allContent = await db.select().from(contentTable);
  const recentActivity = await db.select().from(activityTable);

  const totalBusinesses = businesses.filter((b) => b.status === "published").length;
  const pendingReview = allContent.filter((c) => c.status === "pending_review").length;
  const approvedQueue = allContent.filter((c) => c.status === "approved").length;
  const totalPublished = allContent.filter((c) => c.status === "published").length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const publishedThisMonth = allContent.filter(
    (c) =>
      c.status === "published" &&
      c.publishedAt &&
      new Date(c.publishedAt) >= startOfMonth
  ).length;

  const pendingBusinesses = businesses.filter((b) => b.status === "pending");

  // Compute the actual next run date based on the configured schedule time
  let nextScheduledDate: string | null = null;
  if (pendingBusinesses.length > 0) {
    const settings = await db.select().from(settingsTable);
    const scheduleTime = settings[0]?.dailyScheduleTime ?? "08:00";
    const [hh, mm] = scheduleTime.split(":").map(Number);
    if (hh !== undefined && mm !== undefined && !isNaN(hh) && !isNaN(mm)) {
      // Use SA time (UTC+2) to figure out whether today's slot has passed
      const nowSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Johannesburg" }));
      const todaySlot = new Date(nowSA);
      todaySlot.setHours(hh, mm, 0, 0);
      const target = nowSA < todaySlot ? nowSA : new Date(nowSA.getTime() + 86400000);
      nextScheduledDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")} at ${scheduleTime}`;
    }
  }

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
    approvedQueue,
    publishedThisMonth,
    totalPublished,
    nextScheduledDate,
    recentActivity: activity,
  });
});

export default router;
