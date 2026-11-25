CREATE TABLE "loyalty_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text NOT NULL,
	"customerId" text NOT NULL,
	"actorId" text NOT NULL,
	"orderId" text,
	"points" integer NOT NULL,
	"kind" text NOT NULL,
	"note" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_order_unique" UNIQUE("orderId")
);
--> statement-breakpoint
CREATE TABLE "loyalty_policy" (
	"workspaceId" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"pointsPerDollar" integer DEFAULT 1 NOT NULL,
	"rewardPoints" integer DEFAULT 100 NOT NULL,
	"rewardLabel" text DEFAULT 'Café reward' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_customerId_user_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_actorId_user_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loyalty_customer_idx" ON "loyalty_entries" USING btree ("workspaceId","customerId","createdAt");