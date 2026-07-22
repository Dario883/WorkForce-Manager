import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SubmitHandler } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, ChevronRight, Download, Upload } from "lucide-react";
import Papa from "papaparse";
import type { Person } from "@shared/types";

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#64748b",
];

const personFormSchema = z.object({
  name: z.string().min(1, "Nome obbligatorio"),
  role: z.string().min(1, "Ruolo obbligatorio"),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  weeklyCapacityHours: z.number().min(1).max(168),
  avatarColor: z.string(),
});
type PersonFormValues = z.infer<typeof personFormSchema>;

function PersonDialog({
  open,
  onClose,
  person,
}: {
  open: boolean;
  onClose: () => void;
  person?: Person;
}) {
  const utils = trpc.useUtils();
  const createMutation = trpc.people.create.useMutation({
    onSuccess: () => { utils.people.list.invalidate(); toast.success("Persona creata"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.people.update.useMutation({
    onSuccess: () => { utils.people.list.invalidate(); toast.success("Persona aggiornata"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      name: person?.name ?? "",
      role: person?.role ?? "",
      email: person?.email ?? "",
      weeklyCapacityHours: person ? parseFloat(String(person.weeklyCapacityHours)) : 40,
      avatarColor: person?.avatarColor ?? "#6366f1",
    },
  });

  // Reset form when dialog opens or person changes
  useEffect(() => {
    if (open) {
      form.reset({
        name: person?.name ?? "",
        role: person?.role ?? "",
        email: person?.email ?? "",
        weeklyCapacityHours: person ? parseFloat(String(person.weeklyCapacityHours)) : 40,
        avatarColor: person?.avatarColor ?? "#6366f1",
      });
    }
  }, [open, person?.id]);

  const onSubmit = (values: PersonFormValues) => {
    const payload = {
      name: values.name,
      role: values.role,
      email: values.email || null,
      weeklyCapacityHours: values.weeklyCapacityHours,
      avatarColor: values.avatarColor,
    };
    if (person) {
      updateMutation.mutate({ id: person.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const selectedColor = form.watch("avatarColor");
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{person ? "Modifica persona" : "Nuova persona"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Nome completo *</Label>
            <Input {...form.register("name")} placeholder="Es. Mario Rossi" />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Ruolo *</Label>
            <Input {...form.register("role")} placeholder="Es. Frontend Developer" />
            {form.formState.errors.role && (
              <p className="text-xs text-destructive">{form.formState.errors.role.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input {...form.register("email")} type="email" placeholder="mario@azienda.it" />
          </div>
          <div className="space-y-1.5">
            <Label>Capacità settimanale (ore)</Label>
            <Input
              {...form.register("weeklyCapacityHours", { valueAsNumber: true })}
              type="number"
              min={1}
              max={168}
              placeholder="40"
            />
          </div>
          <div className="space-y-2">
            <Label>Colore avatar</Label>
            <div className="flex gap-2 flex-wrap">
              {AVATAR_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => form.setValue("avatarColor", color)}
                  className="h-7 w-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: color,
                    borderColor: selectedColor === color ? "#1e293b" : "transparent",
                    transform: selectedColor === color ? "scale(1.2)" : "scale(1)",
                  }}
                />
              ))}
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvataggio..." : person ? "Salva modifiche" : "Crea persona"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function People() {
  const [, setLocation] = useLocation();
  const { data: people, isLoading } = trpc.people.list.useQuery();
  const utils = trpc.useUtils();
  const deleteMutation = trpc.people.delete.useMutation({
    onSuccess: () => { utils.people.list.invalidate(); toast.success("Persona eliminata"); },
    onError: (e) => toast.error(e.message),
  });

  const createBulkMutation = trpc.people.create.useMutation();
  const [importing, setImporting] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Persone</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {people?.length ?? 0} {people?.length === 1 ? "persona" : "persone"} nel team
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              const csv = "nome,ruolo,email,ore_settimana,colore_avatar\nMario Rossi,Frontend Developer,mario@azienda.it,40,#6366f1\n";
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "template_risorse.csv";
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
                    // Validate headers
                    const requiredHeaders = ["nome", "ruolo"];
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
                    for (let i = 0; i < rows.length; i++) {
                      const row = rows[i];
                      const name = row.nome?.trim();
                      const role = row.ruolo?.trim();
                      if (!name || !role) {
                        errors++;
                        errorDetails.push(`Riga ${i + 2}: nome o ruolo mancante`);
                        continue;
                      }
                      try {
                        await createBulkMutation.mutateAsync({
                          name,
                          role,
                          email: row.email?.trim() || null,
                          weeklyCapacityHours: parseFloat(row.ore_settimana) || 40,
                          avatarColor: row.colore_avatar?.trim() || "#6366f1",
                        });
                        created++;
                      } catch (err: any) {
                        errors++;
                        errorDetails.push(`Riga ${i + 2}: ${err?.message || "errore sconosciuto"}`);
                      }
                    }
                    utils.people.list.invalidate();
                    if (created > 0) toast.success(`Importate ${created} persone`);
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
            onClick={() => { setEditPerson(undefined); setDialogOpen(true); }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Nuova persona
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : people?.length === 0 ? (
        <Card className="card-elegant">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Nessuna persona ancora. Crea la prima!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {people?.map(person => {
            const initials = person.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
            return (
              <Card
                key={person.id}
                className="card-elegant hover:shadow-md transition-elegant cursor-pointer group"
                onClick={() => setLocation(`/people/${person.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ backgroundColor: person.avatarColor ?? "#6366f1" }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{person.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{person.role}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {parseFloat(String(person.weeklyCapacityHours))}h/settimana
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-elegant shrink-0 mt-1" />
                  </div>
                  <div className="flex gap-2 mt-4 pt-3 border-t border-border/60">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={e => { e.stopPropagation(); setEditPerson(person); setDialogOpen(true); }}
                    >
                      <Pencil className="h-3 w-3" />
                      Modifica
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                      onClick={e => { e.stopPropagation(); setDeleteId(person.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Elimina
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PersonDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        person={editPerson}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina persona</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione eliminerà la persona e tutte le sue assegnazioni. Non è reversibile.
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
