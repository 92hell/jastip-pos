CREATE TABLE "stock_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"store" text DEFAULT '' NOT NULL,
	"unit_cost" bigint NOT NULL,
	"price" bigint NOT NULL,
	"event_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"stock_item_id" integer NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" bigint,
	"method" text,
	"event_id" integer,
	"moved_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "stock_item_id" integer;--> statement-breakpoint
ALTER TABLE "stock_items" ADD CONSTRAINT "stock_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_moves_item_idx" ON "stock_moves" USING btree ("stock_item_id");--> statement-breakpoint
CREATE INDEX "stock_moves_event_idx" ON "stock_moves" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_stock_item_id_stock_items_id_fk" FOREIGN KEY ("stock_item_id") REFERENCES "public"."stock_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_stock_idx" ON "order_items" USING btree ("stock_item_id");