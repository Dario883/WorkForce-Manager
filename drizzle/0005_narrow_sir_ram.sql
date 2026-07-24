DO $$ BEGIN
 CREATE TYPE "public"."absence_status" AS ENUM('in_attesa', 'approvata', 'rifiutata');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "absences" ADD COLUMN "status" "absence_status" DEFAULT 'in_attesa' NOT NULL;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "manager_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "people" ADD CONSTRAINT "people_manager_id_people_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
