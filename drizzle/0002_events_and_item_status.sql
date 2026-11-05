CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'trip' NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"order_deadline" date,
	"note" text DEFAULT '' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_bundle_id_order_bundles_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "status" text DEFAULT 'requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "sold_out_resolution" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "replaces_item_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "event_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_bundle_id_order_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."order_bundles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_event_idx" ON "orders" USING btree ("event_id");