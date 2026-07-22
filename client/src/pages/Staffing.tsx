import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { AllocationBadge } from "@/components/AllocationBar";
import type { Assignment } from "@shared/types";

const assignmentFormSchema = z.object({
  personId: z.number().int().positive("Seleziona una persona"),
  projectId: z.number().int().positive("Seleziona un progetto"),
  allocationPercent: z.number().min(1).max(200),
  startDate: z.string().min(1, "Data inizio obbligatoria"),
  endDate: z.string().min(1, "Data fine obbligatoria"),
  notes: z.string().optional(),
});
type AssignmentFormValues = z.infer<typeof assignmentFormSchema>;

function AssignmentDialog({
  open,
  onClose,
  assignment,
}: {
  open: boolean;
  onClose: () => void;
  assignment?: Assignment;
}) {
  const utils = trpc.useUtils();
  const { data: people } = trpc.people.list.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();

  const createMutation = trpc.assignments.create.useMutation({
    onSuccess: () => {
      utils.assignments.list.invalidate();
      utils.staffing.snapshot.invalidate();
      utils.people.assignments.invalidate();
      toast.success("Assegnazione creata");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.assignments.update.useMutation({
    onSuccess: () => {
      utils.assignments.list.invalidate();
      utils.staffing.snapshot.invalidate();
      utils.people.assignments.invalidate();
      toast.success("Assegnazione aggiornata");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      personId: assignment?.personId ?? 0,
      projectId: assignment?.projectId ?? 0,
      allocationPercent: assignment ? parseFloat(String(assignment.allocationPercent)) : 100,
      startDate: assignment?.startDate ? format(new Date(assignment.startDate), "yyyy-MM-dd") : "",
      endDate: assignment?.endDate ? format(new Date(assignment.endDate), "yyyy-MM-dd") : "",
      notes: assignment?.notes ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        personId: assignment?.personId ?? 0,
        projectId: assignment?.projectId ?? 0,
        allocationPercent: assignment ? parseFloat(String(assignment.allocationPercent)) : 100,
        startDate: assignment?.startDate ? format(new Date(assignment.startDate), "yyyy-MM-dd") : "",
        endDate: assignment?.endDate ? format(new Date(assignment.endDate), "yyyy-MM-dd") : "",
        notes: assignment?.notes ?? "",
      });
    }
  }, [open, assignment?.id]);

  const onSubmit = (values: AssignmentFormValues) => {
    if (assignment) {
      updateMutation.mutate({ id: assignment.id, ...values });
    } else {
      createMutation.mutate(values);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assignment ? "Modifica assegnazione" : "Nuova assegnazione"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Persona *</Label>
              <Select
                value={String(form.watch("personId") || "")}
                onValueChange={v => form.setValue("personId", parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent>
                  {people?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.personId && (
                <p className="text-xs text-destructive">{form.formState.errors.personId.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Progetto *</Label>
              <Select
                value={String(form.watch("projectId") || "")}
                onValueChange={v => form.setValue("projectId", parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent>
                  {projects?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color ?? "#6366f1" }} />
                        {p.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.projectId && (
                <p className="text-xs text-destructive">{form.formState.errors.projectId.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Allocazione (%) *</Label>
            <div className="flex items-center gap-3">
              <Input
                {...form.register("allocationPercent", { valueAsNumber: true })}
                type="number"
                min={1}
                max={200}
                step={5}
                className="w-28"
              />
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(form.watch("allocationPercent") ?? 0, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Data inizio *</Label>
              <Input {...form.register("startDate")} type="date" />
              {form.formState.errors.startDate && (
                <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Data fine *</Label>
              <Input {...form.register("endDate")} type="date" />
              {form.formState.errors.endDate && (
                <p className="text-xs text-destructive">{form.formState.errors.endDate.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea {...form.register("notes")} placeholder="Note opzionali..." rows={2} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvataggio..." : assignment ? "Salva modifiche" : "Crea assegnazione"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Staffing() {
  const { data: assignments, isLoading } = trpc.assignments.list.useQuery();
  const { data: people } = trpc.people.list.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.assignments.delete.useMutation({
    onSuccess: () => { utils.assignments.list.invalidate(); toast.success("Assegnazione eliminata"); },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAssignment, setEditAssignment] = useState<Assignment | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const getPerson = (id: number) => people?.find(p => p.id === id);
  const getProject = (id: number) => projects?.find(p => p.id === id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staffing</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {assignments?.length ?? 0} {assignments?.length === 1 ? "assegnazione" : "assegnazioni"} totali
          </p>
        </div>
        <Button
          onClick={() => { setEditAssignment(undefined); setDialogOpen(true); }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nuova assegnazione
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : assignments?.length === 0 ? (
        <Card className="card-elegant">
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">Nessuna assegnazione ancora. Crea la prima!</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-elegant">
          <CardContent className="p-0">
            <div className="divide-y divide-border/60">
              {assignments?.map(assignment => {
                const person = getPerson(assignment.personId);
                const project = getProject(assignment.projectId);
                const initials = person?.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase() ?? "?";
                const percent = parseFloat(String(assignment.allocationPercent));
                return (
                  <div key={assignment.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-elegant">
                    {/* Person avatar */}
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                      style={{ backgroundColor: person?.avatarColor ?? "#6366f1" }}
                    >
                      {initials}
                    </div>

                    {/* Person + Project */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{person?.name ?? "—"}</span>
                        <span className="text-muted-foreground text-xs">su</span>
                        <div className="flex items-center gap-1.5">
                          <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: project?.color ?? "#6366f1" }}
                          />
                          <span className="font-medium text-sm">{project?.name ?? "—"}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(assignment.startDate), "d MMM yyyy", { locale: it })}
                        {" → "}
                        {format(new Date(assignment.endDate), "d MMM yyyy", { locale: it })}
                      </p>
                    </div>

                    {/* Allocation badge */}
                    <AllocationBadge percent={percent} />

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => { setEditAssignment(assignment as any); setDialogOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(assignment.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <AssignmentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        assignment={editAssignment}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina assegnazione</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione eliminerà l'assegnazione. Non è reversibile.
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
