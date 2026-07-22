# WorkForce Manager — TODO

## Database & Backend
- [x] Schema DB: tabelle people, projects, assignments, settings
- [x] Migrazione SQL applicata
- [x] Query helpers: people, projects, assignments, staffing aggregations
- [x] tRPC router: people CRUD (list, byId, assignments, create, update, delete)
- [x] tRPC router: projects CRUD (list, create, update, delete)
- [x] tRPC router: assignments CRUD (list, create, update, delete)
- [x] tRPC router: staffing snapshot (weekly/monthly/yearly aggregations)
- [x] tRPC router: settings (get/set chiave-valore)
- [x] Dati demo (8 persone, 6 progetti, 14 assegnazioni)

## Frontend — Layout & Design
- [x] Design system: palette raffinata, font Inter, variabili CSS OKLCH
- [x] DashboardLayout con sidebar navigazione
- [x] Navigazione: Dashboard, Persone, Progetti, Staffing, Calendario (Sett/Mens/Ann), Impostazioni
- [x] Componente AllocationBar condiviso con colori semantici
- [x] Dedupe React in vite.config.ts (fix multiple React instances)

## Frontend — Pagine
- [x] Dashboard risorse (KPI, allocazioni settimana, sotto-utilizzo, sovra-allocazione)
- [x] Pagina Persone (griglia card + form crea/modifica/elimina + colore avatar)
- [x] Pagina Progetti (lista per stato + form crea/modifica/elimina + colore progetto)
- [x] Pagina Staffing (lista assegnazioni + form con persona, progetto, %, periodo)
- [x] Calendario Settimanale (griglia persona × giorno, tooltip dettaglio, colori semantici)
- [x] Calendario Mensile (griglia persona × settimana, barre allocazione, media mese)
- [x] Vista Annuale (heatmap persona × mese, colori graduati, totali anno)
- [x] Dettaglio Persona (ore per progetto, timeline assegnazioni, storico completo)
- [x] Impostazioni (soglia sotto-utilizzo configurabile con slider + anteprima)

## Test
- [x] Test auth.logout (vitest - 1 test passed)
- [x] Checkpoint finale


## Migliorie Interattive (Fase 2)
- [x] Toggle percentuale/ore nei calendari (switch button)
- [x] Tooltip hover: capacità residua per risorsa
- [x] Click cella calendario: modifica % staffing inline
- [x] Evidenziazione rossa per sovra-allocazione (>100%)
- [x] Modifica risorse dal calendario (dialog)
- [x] Modifica progetti dal calendario (dialog)
- [x] Modifica staffing dal calendario (dialog)


## Cancellazione Allocazione (Fase 4)
- [x] Aggiungere pulsante delete su ogni riga allocazione nel calendario settimanale
- [x] Aggiungere pulsante delete su ogni riga allocazione nel calendario mensile
- [x] Aggiungere pulsante delete su ogni riga allocazione nel calendario annuale
- [x] Procedura backend per cancellare assegnazione
- [x] Conferma cancellazione con dialog


## Opzioni Periodo Modifica (Fase 5)
- [x] CalendarWeekly: opzioni Giorno/Settimana nel dialog modifica
- [x] CalendarMonthly: opzioni Settimana/Mese nel dialog modifica
- [x] CalendarYearly: opzioni Mese/Anno nel dialog modifica
- [x] Backend: supporto per tipo 'yearly' nella procedura splitByPeriod
- [x] Logica yearly: calcolo periodo gennaio-dicembre dell'anno selezionato


## Bug Fix & Nuove Funzionalità (Fase 6)
- [x] Fix bug modifica giornaliera: passare data cella specifica al mutation
- [x] Campo capacità ore/settimana nella pagina Persone (form crea/modifica)
- [x] CSV template download per risorse
- [x] CSV template download per progetti
- [x] CSV bulk import per risorse
- [x] CSV bulk import per progetti


## Bug Fix & Nuove Funzionalità (Fase 7)
- [ ] Bug fix: modifica percentuale propagata alla cella successiva nei calendari
- [ ] Feature: popup pianificazione con progetto DDL, date, loading (click risorsa)
- [ ] Feature: tab Staffing - CSV export/import template
- [ ] Feature: filtri ricerca in tab Staffing/Risorse/Progetti
- [ ] Feature: grafici dashboard (Capacity vs Loading, FTE, Progetti per stato)
