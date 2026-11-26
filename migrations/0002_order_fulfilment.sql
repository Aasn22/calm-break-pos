ALTER TABLE "orders" ADD COLUMN "confirmedAt" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "allergyNote" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paidAt" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paidBy" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "escalationMinutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "allergies" text DEFAULT '' NOT NULL;