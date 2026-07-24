DO $$ BEGIN
 CREATE TYPE "public"."activity_log_action" AS ENUM('created', 'updated', 'deleted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" varchar(255) NOT NULL,
	"action" "activity_log_action" NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" integer NOT NULL,
	"entity_name" varchar(255) NOT NULL,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "pm_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_pm_id_people_id_fk" FOREIGN KEY ("pm_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
