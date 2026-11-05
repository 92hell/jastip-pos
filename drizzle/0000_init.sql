CREATE TABLE "business_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"shop_name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"instagram" text DEFAULT '' NOT NULL,
	"whatsapp" text DEFAULT '' NOT NULL,
	"payment_accounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" text DEFAULT '' NOT NULL,
	"voucher_amount" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_settings_single_row" CHECK ("business_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'helper' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;