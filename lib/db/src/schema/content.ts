import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { businessesTable } from "./businesses";

export const contentStatusEnum = ["draft", "pending_review", "approved", "published", "rejected"] as const;

export const contentTable = pgTable("content_entries", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businessesTable.id, { onDelete: "cascade" }),
  founderName: text("founder_name"),
  founderBio: text("founder_bio"),
  standoutProduct: text("standout_product"),
  productDescription: text("product_description"),
  businessDescription: text("business_description"),
  location: text("location"),
  madeInSA: text("made_in_sa"),
  callToAction: text("call_to_action"),
  websiteUrl: text("website_url"),
  status: text("status").notNull().default("draft"),
  rejectionNote: text("rejection_note"),
  scheduledDate: text("scheduled_date"),
  generatedAt: timestamp("generated_at"),
  approvedAt: timestamp("approved_at"),
  publishedAt: timestamp("published_at"),
});

export const insertContentSchema = createInsertSchema(contentTable).omit({ id: true });
export type InsertContent = z.infer<typeof insertContentSchema>;
export type ContentEntry = typeof contentTable.$inferSelect;
