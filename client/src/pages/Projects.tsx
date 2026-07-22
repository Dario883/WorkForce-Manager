import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, CalendarDays, Download, Upload } from "lucide-react";
import Papa from "papaparse";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Project } from "@shared/types";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS } from "@shared/types";

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
];

const projectFormSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio"),
  description: z.string().optional(),
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]),
  color: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
type ProjectFormValues = z.infer<typeof projectFormSchema>;

function ProjectDialog({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project;
}) {
  const utils = trpc.useUtils();
  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Progetto creato"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Progetto aggiornato"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? "",
      description: project?.description ?? "",
      status: project?.status ?? "planning",
      color: project?.color ?? "#6366f1",
      startDate: project?.startDate ? format(new Date(project.startDate), "yyyy-MM-dd") : "",
      endDate: project?.endDate ? format(new Date(project.endDate), "yyyy-MM-dd") : "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: project?.name ?? "",
        description: project?.description ?? "",
        status: project?.status ?? "planning",
        color: project?.color ?? "#6366f1",
        startDate: project?.startDate ? format(new Date(project.startDate), "yyyy-MM-dd") : "",
        endDate: project?.endDate ? format(new Date(project.endDate), "yyyy-MM-dd") : "",
      });
    }
  }, [open, project?.id]);

  const onSubmit = (values: ProjectFormValues) => {
    const payload = {
      name: values.name,
      description: values.description || null,
      status: values.status,
      color: values.color,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
    };
    if (project) {
      updateMutation.mutate({ id: project.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const selectedColor = form.watch("color");
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Modifica progetto" : "Nuovo progetto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Nome progetto *</Label>
            <Input {...form.register("name")} placeholder="Es. Redesign portale clienti" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Descrizione</Label>
            <Textarea {...form.register("description")} placeholder="Descrizione del progetto..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Stato</Label>
              <Select
                value={form.watch("status")}
                onValueChange={v => form.setValue("status", v as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Colore</Label>
              <div className="flex gap-2 flex-wrap pt-1">
                {PROJECT_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => form.setValue("color", color)}
                    className="h-6 w-6 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: color,
                      borderColor: selectedColor === color ? "#1e293b" : "transparent",
                      transform: selectedColor === color ? "scale(1.2)" : "scale(1)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Data inizio</Label>
              <Input {...form.register("startDate")} type="date" />
            </div>
            <div className="space-y-1.5">
              <Label>Data fine</Label>
              <Input {...form.register("endDate")} type="date" />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvataggio..." : project ? "Salva modifiche" : "Crea progetto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Projects() {
  const { data: projects, isLoading } = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Progetto eliminato"); },
    onError: (e) => toast.error(e.message),
  });

  const createBulkMutation = trpc.projects.create.useMutation();
  const [importing, setImporting] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const grouped = {
    active: projects?.filter(p => p.status === "active") ?? [],
    planning: projects?.filter(p => p.status === "planning") ?? [],
    on_hold: projects?.filter(p => p.status === "on_hold") ?? [],
    completed: projects?.filter(p => p.status === "completed") ?? [],
    cancelled: projects?.filter(p => p.status === "cancelled") ?? [],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progetti</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {projects?.length ?? 0} {projects?.length === 1 ? "progetto" : "progetti"} totali
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const csv = "nome,descrizione,stato,colore,data_inizio,data_fine\nProgetto Alpha,Descrizione del progetto,active,#6366f1,2026-01-01,2026-12-31\n";
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "template_progetti.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" />
            Template CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={importing}
            onClick={() => {
              if (importing) return;
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".csv";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                setImporting(true);
                Papa.parse(file, {
                  header: true,
                  skipEmptyLines: true,
                  complete: async (results) => {
                    const rows = results.data as Record<string, string>[];
                    if (rows.length === 0) {
                      toast.error("Il file CSV è vuoto");
                      setImporting(false);
                      return;
                    }
                    const requiredHeaders = ["nome"];
                    const headers = Object.keys(rows[0] || {});
                    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
                    if (missingHeaders.length > 0) {
                      toast.error(`Intestazioni mancanti: ${missingHeaders.join(", ")}. Scarica il template per il formato corretto.`);
                      setImporting(false);
                      return;
                    }
                    let created = 0;
                    let errors = 0;
                    const errorDetails: string[] = [];
                    const validStatuses = ["planning", "active", "on_hold", "completed", "cancelled"];
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    for (let i = 0; i < rows.length; i++) {
                      const row = rows[i];
                      const name = row.nome?.trim();
                      if (!name) {
                        errors++;
                        errorDetails.push(`Riga ${i + 2}: nome mancante`);
                        continue;
                      }
                      const startDate = row.data_inizio?.trim() || null;
                      const endDate = row.data_fine?.trim() || null;
                      if (startDate && !dateRegex.test(startDate)) {
                        errors++;
                        errorDetails.push(`Riga ${i + 2}: data_inizio formato non valido (usare YYYY-MM-DD)`);
                        continue;
                      }
                      if (endDate && !dateRegex.test(endDate)) {
                        errors++;
                        errorDetails.push(`Riga ${i + 2}: data_fine formato non valido (usare YYYY-MM-DD)`);
                        continue;
                      }
                      const status = validStatuses.includes(row.stato?.trim()) ? row.stato.trim() as any : "planning";
                      try {
                        await createBulkMutation.mutateAsync({
                          name,
                          description: row.descrizione?.trim() || null,
                          status,
                          color: row.colore?.trim() || "#6366f1",
                          startDate,
                          endDate,
                        });
                        created++;
                      } catch (err: any) {
                        errors++;
                        errorDetails.push(`Riga ${i + 2}: ${err?.message || "errore sconosciuto"}`);
                      }
                    }
                    utils.projects.list.invalidate();
                    if (created > 0) toast.success(`Importati ${created} progetti`);
                    if (errors > 0) toast.error(`${errors} righe con errori: ${errorDetails.slice(0, 3).join("; ")}${errorDetails.length > 3 ? "..." : ""}`);
                    setImporting(false);
                  },
                  error: (err) => {
                    toast.error(`Errore parsing CSV: ${err.message}`);
                    setImporting(false);
                  },
                });
              };
              input.click();
            }}
          >
            <Upload className="h-4 w-4" />
            {importing ? "Importazione..." : "Importa CSV"}
          </Button>
          <Button
            onClick={() => { setEditProject(undefined); setDialogOpen(true); }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuovo progetto
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : projects?.length === 0 ? (
        <Card className="card-elegant">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Nessun progetto ancora. Crea il primo!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(["active", "planning", "on_hold", "completed", "cancelled"] as const).map(status => {
            const items = grouped[status];
            if (items.length === 0) return null;
            return (
              <div key={status}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {PROJECT_STATUS_LABELS[status]} ({items.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map(project => (
                    <Card key={project.id} className="card-elegant hover:shadow-md transition-elegant">
                      <CardContent className="p-5">
                        <div className="flex items-start gap-3">
                          <div
                            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${project.color ?? "#6366f1"}20` }}
                          >
                            <div
                              className="h-4 w-4 rounded-full"
                              style={{ backgroundColor: project.color ?? "#6366f1" }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{project.name}</p>
                            {project.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {project.description}
                              </p>
                            )}
                          </div>
                        </div>
                        {(project.startDate || project.endDate) && (
                          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {project.startDate ? format(new Date(project.startDate), "d MMM yyyy", { locale: it }) : "—"}
                              {" → "}
                              {project.endDate ? format(new Date(project.endDate), "d MMM yyyy", { locale: it }) : "—"}
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2 mt-4 pt-3 border-t border-border/60">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => { setEditProject(project as any); setDialogOpen(true); }}
                          >
                            <Pencil className="h-3 w-3" />
                            Modifica
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(project.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Elimina
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProjectDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        project={editProject}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina progetto</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione eliminerà il progetto e tutte le assegnazioni associate. Non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteId) { deleteMutation.mutate({ id: deleteId }); setDeleteId(null); } }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
