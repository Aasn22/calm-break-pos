ALTER TABLE "order_items" ADD COLUMN "segment" text DEFAULT 'cafe' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "escalationMinutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "dueAt" timestamp;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "deliveredAt" timestamp;