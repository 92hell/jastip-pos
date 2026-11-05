CREATE TABLE "client_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"order_id" integer,
	"payment_id" integer,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"kind" text NOT NULL,
	"method" text,
	"amount" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"proof" "bytea",
	"proof_type" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dp_percent" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "client_credits" ADD CONSTRAINT "client_credits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credits" ADD CONSTRAINT "client_credits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credits" ADD CONSTRAINT "client_credits_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_credits_client_idx" ON "client_credits" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_token_unique" UNIQUE("invoice_token");