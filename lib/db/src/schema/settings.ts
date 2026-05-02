import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  notificationEmail: text("notification_email"),
  supabaseUrl: text("supabase_url"),
  supabaseAnonKey: text("supabase_anon_key"),
  supabaseTableName: text("supabase_table_name"),
  dailyScheduleTime: text("daily_schedule_time").default("08:00"),
  emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(false),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
