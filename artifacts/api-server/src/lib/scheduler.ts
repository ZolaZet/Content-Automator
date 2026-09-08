import cron from "node-cron";
import { db } from "@workspace/db";
import { contentTable, settingsTable } from "@workspace/db";
import { logger } from "./logger";
import { pickNextBusiness, generateContentForBusiness } from "./ai-generator";

type ScheduledTask = ReturnType<typeof cron.schedule>;
const SCHEDULE_TIMEZONE = "Africa/Johannesburg";

let currentTask: ScheduledTask | null = null;
let currentTime: string | null = null;

function timeToCron(hhmm: string): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  if (hh === undefined || mm === undefined || isNaN(hh) || isNaN(mm)) {
    throw new Error(`Invalid schedule time: ${hhmm}`);
  }
  return `${mm} ${hh} * * *`;
}

async function runDailyGeneration() {
  logger.info("Daily scheduler: running content generation");
  try {
    const businessId = await pickNextBusiness();
    if (!businessId) {
      logger.info("Daily scheduler: no pending businesses available, skipping");
      return;
    }
    const content = await generateContentForBusiness(businessId);
    logger.info({ contentId: content.id, businessId }, "Daily scheduler: content generated successfully");
  } catch (err) {
    logger.error({ err }, "Daily scheduler: content generation failed");
  }
}

function dateInSouthAfrica(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isPastScheduledTime(hhmm: string): boolean {
  const [hh, mm] = hhmm.split(":").map(Number);
  if (hh === undefined || mm === undefined || isNaN(hh) || isNaN(mm)) return false;

  const nowSA = new Date(new Date().toLocaleString("en-US", { timeZone: SCHEDULE_TIMEZONE }));
  const todaySlot = new Date(nowSA);
  todaySlot.setHours(hh, mm, 0, 0);
  return nowSA >= todaySlot;
}

async function runCatchUpIfNeeded(hhmm: string) {
  if (!isPastScheduledTime(hhmm)) return;

  const today = dateInSouthAfrica(new Date());
  const generatedToday = await db.select({ generatedAt: contentTable.generatedAt }).from(contentTable);
  const hasGenerationToday = generatedToday.some(
    (entry) => entry.generatedAt && dateInSouthAfrica(new Date(entry.generatedAt)) === today,
  );

  if (hasGenerationToday) {
    logger.info({ today, hhmm }, "Daily scheduler: today's generation already exists");
    return;
  }

  logger.info(
    { today, hhmm },
    "Daily scheduler: scheduled time already passed, running catch-up generation",
  );
  await runDailyGeneration();
}

export function reschedule(hhmm: string) {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }

  if (!hhmm) {
    logger.info("Daily scheduler: disabled (no schedule time set)");
    currentTime = null;
    return;
  }

  let cronExpr: string;
  try {
    cronExpr = timeToCron(hhmm);
  } catch (err) {
    logger.warn({ err, hhmm }, "Daily scheduler: invalid time format, scheduler not started");
    return;
  }

  currentTask = cron.schedule(cronExpr, runDailyGeneration, {
    timezone: SCHEDULE_TIMEZONE,
  });

  currentTime = hhmm;
  logger.info({ hhmm, cronExpr }, "Daily scheduler: scheduled");
}

export function getCurrentScheduleTime(): string | null {
  return currentTime;
}

export async function startScheduler() {
  try {
    const rows = await db.select().from(settingsTable);
    const time = rows[0]?.dailyScheduleTime ?? "08:00";
    reschedule(time);
    await runCatchUpIfNeeded(time);
  } catch (err) {
    logger.error({ err }, "Daily scheduler: failed to start, will use default 08:00");
    reschedule("08:00");
    await runCatchUpIfNeeded("08:00");
  }
}
