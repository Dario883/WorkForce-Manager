import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings2, AlertTriangle, TrendingUp, Save } from "lucide-react";
import { AllocationBar } from "@/components/AllocationBar";

export default function Settings() {
  const { data: settings, isLoading } = trpc.settings.all.useQuery();
  const utils = trpc.useUtils();

  const setSettingMutation = trpc.settings.set.useMutation({
    onSuccess: () => {
      utils.settings.all.invalidate();
      toast.success("Impostazioni salvate");
    },
    onError: (e) => toast.error(e.message),
  });

  const [threshold, setThreshold] = useState(80);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings?.underutilization_threshold) {
      setThreshold(parseFloat(settings.underutilization_threshold));
      setDirty(false);
    }
  }, [settings]);

  const handleSave = () => {
    setSettingMutation.mutate({ key: "underutilization_threshold", value: String(threshold) });
    setDirty(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configura i parametri dell'applicazione
        </p>
      </div>

      {/* Threshold card */}
      <Card className="card-elegant">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Soglia sotto-utilizzo</CardTitle>
              <CardDescription className="text-sm">
                Percentuale al di sotto della quale una risorsa è considerata sotto-utilizzata
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Soglia attuale</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={10}
                      max={99}
                      value={threshold}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v >= 10 && v <= 99) {
                          setThreshold(v);
                          setDirty(true);
                        }
                      }}
                      className="w-20 text-center font-semibold"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                <Slider
                  value={[threshold]}
                  min={10}
                  max={99}
                  step={5}
                  onValueChange={([v]) => { setThreshold(v); setDirty(true); }}
                  className="w-full"
                />

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>10%</span>
                  <span>50%</span>
                  <span>99%</span>
                </div>
              </div>

              {/* Preview */}
              <div className="space-y-3 p-4 bg-muted/30 rounded-xl">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anteprima</p>
                <div className="space-y-2">
                  {[
                    { label: "Sotto-utilizzato", value: threshold - 20, desc: `< ${threshold}%` },
                    { label: "Allocato correttamente", value: threshold + 5, desc: `≥ ${threshold}%` },
                    { label: "Sovra-allocato", value: 115, desc: "> 100%" },
                  ].map(({ label, value, desc }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-36 shrink-0">
                        <p className="text-xs font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      <AllocationBar percent={Math.max(5, value)} threshold={threshold} showLabel className="flex-1" />
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={!dirty || setSettingMutation.isPending}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {setSettingMutation.isPending ? "Salvataggio..." : "Salva impostazioni"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="card-elegant">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Settings2 className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">Come funziona</CardTitle>
              <CardDescription>Logica di calcolo delle allocazioni</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Sotto-utilizzo</p>
              <p>Una persona è sotto-utilizzata quando la sua allocazione totale è inferiore alla soglia configurata. Visibile nella Dashboard e nella vista Annuale.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <TrendingUp className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Sovra-allocazione</p>
              <p>Una persona è sovra-allocata quando la somma delle percentuali di allocazione supera il 100%. Viene segnalata in rosso in tutti i calendari.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <Settings2 className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Calcolo ore</p>
              <p>Le ore schedulate sono calcolate come: (capacità settimanale × allocazione%) / 100. Per i giorni, si considera una settimana lavorativa di 5 giorni.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
