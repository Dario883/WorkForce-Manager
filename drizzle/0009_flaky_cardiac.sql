DO $$ BEGIN
 CREATE TYPE "public"."person_type" AS ENUM('consulente', 'stage', 'dipendente');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "type" "person_type" DEFAULT 'dipendente' NOT NULL;