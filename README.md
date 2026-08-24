# WorkForce Manager (Lite)

Riscrittura leggera e manutenibile del progetto originale "WorkForce Manager", senza dipendenze da servizi proprietari (Manus). Stack minimale, standard, pensato per essere ospitato ovunque.

## Stack

- **Frontend**: React 18 + Vite + Tailwind CSS + wouter (routing leggero, ~1.5kB)
- **Backend**: Express + TypeScript
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: JWT in cookie httpOnly (nessun servizio esterno, nessuna sessione server-side da gestire)

Nessun tRPC, nessun runtime proprietario, nessun SDK di terze parti: solo REST + fetch. Circa 1/3 delle dipendenze dell'originale.

## Documentazione

Documentazione funzionale, architetturale, tecnica e di sicurezza completa: [`docs/`](docs/README.md).

## Funzionalità

- **Dashboard**: KPI su persone, progetti attivi, sotto/sovra-allocazione con vista executive-board a heatmap a barre per confronto immediato del carico di lavoro del team
- **Persone**: CRUD completo + import/export CSV
- **Progetti**: CRUD completo + import/export CSV
- **Staffing**: assegnazione persona ↔ progetto con percentuale e periodo
- **Calendario**: vista settimanale/mensile con heatmap allocazioni ed editing inline (click su una cella per modificare la % di un giorno specifico — l'assegnazione viene divisa automaticamente)
- **Dettaglio persona**: storico assegnazioni in timeline
- **Impostazioni**: soglie di sotto/sovra-allocazione configurabili

## Setup locale

### 1. Prerequisiti
- Node.js 20+
- PostgreSQL 14+ (locale o remoto)

### 2. Installazione

```bash
npm install
cp .env.example .env
```

Modifica `.env` con la tua stringa di connessione PostgreSQL e un `JWT_SECRET` casuale.

### 3. Database

```bash
npm run db:generate   # genera le migrazioni SQL dallo schema
npm run db:migrate    # le applica al database
npm run db:seed       # crea l'utente admin iniziale (SEED_ADMIN_EMAIL/PASSWORD in .env)
```

### 4. Sviluppo

```bash
npm run dev:server    # backend su :3000
npm run dev:client    # frontend su :5173 (proxy verso :3000)
```

Apri `http://localhost:5173` e accedi con le credenziali seed.

### 5. Test

```bash
npm test              # unit + integration (Vitest)
npm run test:e2e      # end-to-end (Playwright)
```

I test unitari (`tests/unit/`) non toccano un database. I test di integrazione
(`tests/integration/`) e i test e2e (`e2e/`) usano un database Postgres
**dedicato e usa-e-getta** (vengono svuotati con `TRUNCATE` prima di ogni
test) — non vanno mai puntati al `DATABASE_URL` che usi per lo sviluppo.
Configura un database separato e aggiungi al tuo `.env`:

```
TEST_DATABASE_URL=postgresql://.../workforce_manager_test
```

Se `TEST_DATABASE_URL` non è impostata, i test di integrazione vengono
saltati automaticamente (`npm test` esegue comunque quelli unitari); i test
e2e invece falliscono subito con un errore esplicito, perché hanno bisogno
di un database per poter effettuare il login. In CI (`.github/workflows/deploy.yml`)
viene usato un container Postgres effimero, quindi non serve alcuna
configurazione: il job `test` gira automaticamente prima del deploy.

### 6. Build di produzione

```bash
npm run build
npm start             # serve tutto da :3000 (backend + frontend statico)
```

## Deploy

Qualsiasi hosting che supporti Node.js + PostgreSQL va bene: Railway, Render, Fly.io, un VPS con PM2, ecc. Non serve nessuna piattaforma specifica: bastano `npm run build` e `npm start`, più le variabili d'ambiente di `.env.example`.

## Struttura del progetto

```
server/
  schema.ts          → schema Drizzle (users, people, projects, assignments, settings)
  db.ts               → connessione PostgreSQL
  auth.ts             → hashing password, JWT, middleware
  routes/             → un file per risorsa (auth, people, projects, assignments, staffing, settings)
  index.ts            → entry point Express
  seed.ts             → crea l'utente admin iniziale

client/src/
  pages/              → una pagina per vista (Dashboard, People, Projects, Staffing, Calendar, PersonDetail, Settings)
  components/         → componenti UI riusabili (Card, Button, Modal, Layout, ecc.)
  lib/                → client API fetch-based, auth context

shared/
  types.ts            → tipi TypeScript condivisi tra client e server
```

## Differenze rispetto all'originale

| Originale | Questa versione | Perché |
|---|---|---|
| tRPC | Express REST + fetch | Meno boilerplate, più facile da debuggare, nessun lock-in |
| MySQL | PostgreSQL | Più solido per dati relazionali con vincoli; a scelta puoi tornare a MySQL cambiando solo `server/db.ts` |
| Auth OAuth via Manus | JWT cookie + bcrypt | Nessuna dipendenza da servizi esterni |
| react-router | wouter | Stessa funzionalità, 1/10 del peso |
| shadcn/ui + Radix (decine di componenti) | Componenti Tailwind minimali fatti su misura | Meno superficie da mantenere; puoi comunque aggiungere shadcn in futuro se serve |

La logica di business (modello dati, calcolo allocazioni, split delle assegnazioni per editing inline) è la stessa dell'originale.
