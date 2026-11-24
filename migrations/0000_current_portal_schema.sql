CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text DEFAULT 'calm-break-main' NOT NULL,
	"userId" text NOT NULL,
	"orderId" text NOT NULL,
	"accountUserId" text NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text DEFAULT 'calm-break-main' NOT NULL,
	"userId" text NOT NULL,
	"orderId" text NOT NULL,
	"productId" text NOT NULL,
	"productName" text NOT NULL,
	"quantity" integer NOT NULL,
	"unitPrice" numeric(12, 2) NOT NULL,
	"modifiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text DEFAULT 'calm-break-main' NOT NULL,
	"userId" text NOT NULL,
	"customerUserId" text,
	"orderNumber" bigserial NOT NULL,
	"segment" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"paymentMethod" text NOT NULL,
	"paymentReference" text,
	"deliveryLocation" text,
	"orderType" text DEFAULT 'takeaway' NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"prepStartedAt" timestamp,
	"readyAt" timestamp,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text DEFAULT 'calm-break-main' NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sku" text NOT NULL,
	"segment" text NOT NULL,
	"category" text NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"lowStockAt" integer DEFAULT 5 NOT NULL,
	"prepMinutes" integer DEFAULT 0 NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "products_workspaceId_sku_unique" UNIQUE("workspaceId","sku")
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text DEFAULT 'calm-break-main' NOT NULL,
	"userId" text NOT NULL,
	"purchaseId" text NOT NULL,
	"productId" text NOT NULL,
	"quantity" integer NOT NULL,
	"unitCost" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"workspaceId" text DEFAULT 'calm-break-main' NOT NULL,
	"userId" text NOT NULL,
	"supplier" text NOT NULL,
	"invoiceNumber" text,
	"segment" text NOT NULL,
	"status" text DEFAULT 'ordered' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"receivedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'customer' NOT NULL,
	"workspaceId" text DEFAULT 'calm-break-main' NOT NULL,
	"employeeId" text,
	"username" text,
	"isApproved" boolean DEFAULT true NOT NULL,
	"approvedAt" timestamp,
	"approvedBy" text,
	"creditLimit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"monthlyDeductionLimit" numeric(12, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_employeeId_unique" UNIQUE("employeeId"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('customer', 'admin', 'cashier', 'shopkeeper', 'chef', 'order_taker', 'barista', 'kitchen', 'manager')),
	CONSTRAINT "user_username_format_check" CHECK ("user"."username" is null or "user"."username" ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountUserId_user_id_fk" FOREIGN KEY ("accountUserId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerUserId_user_id_fk" FOREIGN KEY ("customerUserId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseId_purchases_id_fk" FOREIGN KEY ("purchaseId") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_productId_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_account_created_idx" ON "ledger_entries" USING btree ("workspaceId","accountUserId","createdAt");--> statement-breakpoint
CREATE INDEX "orders_workspace_created_idx" ON "orders" USING btree ("workspaceId","createdAt");--> statement-breakpoint
CREATE INDEX "orders_workspace_status_idx" ON "orders" USING btree ("workspaceId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_key" ON "user" USING btree ("username") WHERE "user"."username" is not null;