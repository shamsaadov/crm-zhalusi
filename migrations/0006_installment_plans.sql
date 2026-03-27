CREATE TABLE "installment_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" varchar NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"down_payment" numeric(12, 2) DEFAULT '0',
	"months" integer NOT NULL,
	"payment_day" integer NOT NULL,
	"monthly_payment" numeric(12, 2) NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"user_id" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installment_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" varchar NOT NULL,
	"payment_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"is_paid" boolean DEFAULT false,
	"paid_at" date,
	"finance_operation_id" varchar,
	"user_id" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_plan_id_installment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_finance_operation_id_finance_operations_id_fk" FOREIGN KEY ("finance_operation_id") REFERENCES "public"."finance_operations"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "installment_payments" ADD CONSTRAINT "installment_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_installment_plans_order" ON "installment_plans" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_installment_payments_plan" ON "installment_payments" ("plan_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_installment_payments_due_date" ON "installment_payments" ("due_date");
