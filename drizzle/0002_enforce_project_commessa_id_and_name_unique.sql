ALTER TABLE "projects" ALTER COLUMN "commessa_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_commessa_id_unique" UNIQUE("commessa_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_name_unique" UNIQUE("name");