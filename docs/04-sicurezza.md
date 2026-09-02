# Documentazione di sicurezza

## 1. Autenticazione

- **Meccanismo**: JWT (HS256, `jsonwebtoken`) contenente `{ userId, email,
  name }`, firmato con `JWT_SECRET` (variabile d'ambiente), trasportato in
  un cookie **httpOnly** (`wfm_session`) — mai esposto a JavaScript lato
  client, mitigando il furto del token via XSS.
- **Cookie**: `httpOnly: true`, `sameSite: "lax"`, `secure: true` in
  produzione (richiede HTTPS, garantito dal terminamento TLS di Azure App
  Service), durata **7 giorni**.
- **Password**: hashing con `bcryptjs`, cost factor 10 (default). Nessuna
  password in chiaro viene mai loggata o restituita dalle API (le query di
  lettura utenti proiettano esplicitamente solo le colonne necessarie,
  escludendo `password_hash`).
- **Verifica continua, non solo al login**: `attachUser` (middleware
  eseguito su ogni richiesta) **ri-legge da database** lo stato `active` e
  `permissions` dell'utente ad ogni singola richiesta, invece di fidarsi
  solo del contenuto del JWT. Conseguenza pratica: disattivare un utente o
  restringergli i permessi ha effetto **immediato**, senza dover attendere
  la scadenza del token (7 giorni) né implementare una blacklist di token
  revocati.

## 2. Autorizzazione: modello a permessi

Il permesso di un utente è una singola colonna `permissions` (JSON
nullable) su `users`:

- **`null`** → accesso completo (valore di default per ogni utente nuovo o
  esistente prima dell'introduzione del modello) — comportamento
  "safe by default, restrizione opt-in".
- **Array di stringhe** → elenco esplicito delle sezioni concesse, tra:
  `dashboard`, `people`, `projects`, `per-pm`, `staffing`, `calendar`,
  `absences`, `settings`, più le quattro sotto-sezioni di Impostazioni
  (`settings:thresholds`, `settings:holidays`, `settings:users`,
  `settings:activity`), significative solo insieme a `settings`.

Definiti in un unico punto (`shared/types.ts` → `APP_TABS`,
`SETTINGS_SUB_TABS`), condivisi da client (validazione UI, navigazione) e
server (validazione zod, middleware) — non esiste un secondo elenco da
tenere sincronizzato a mano.

### Due middleware, semantiche diverse

| Middleware | Effetto | Quando si usa |
|---|---|---|
| `requireTab(tab)` | Blocca **tutte** le richieste (incluse le GET) se il permesso manca | Risorse consumate esclusivamente da una sezione (es. `/users`, `/activity`) |
| `requireTabWrite(tab)` | Lascia passare le **GET** sempre; blocca solo le mutazioni (POST/PUT/DELETE) senza il permesso | Risorse i cui dati in lettura sono condivisi tra più sezioni (es. `/people` letto anche da Dashboard e dalla ricerca globale) |

Questa distinzione è la ragione per cui, ad esempio, un utente con accesso
solo a "Dashboard" può comunque vedere i nomi delle persone nella lista
"Allocazione per persona" (lettura condivisa) ma non può creare o modificare
una persona (scrittura gated).

### Matrice endpoint → permesso richiesto

Definita in `server/app.ts` (unico punto in cui i router vengono montati e
protetti):

| Router montato su | Middleware applicato | Effetto |
|---|---|---|
| `/api/auth` | nessuno | pubblico (login/logout) |
| `/api/people` | `requireAuth`, `requireTabWrite("people")` | lettura libera, scrittura richiede `people` |
| `/api/projects` | `requireAuth`, `requireTabWrite("projects")` | lettura libera, scrittura richiede `projects` |
| `/api/assignments` | `requireAuth`, `requireTabWrite("staffing")` | lettura libera, scrittura richiede `staffing` |
| `/api/staffing` | `requireAuth` | nessun permesso dedicato (solo autenticazione) |
| `/api/settings` | `requireAuth`, `requireTabWrite("settings")`, `requireTabWrite("settings:thresholds")` | lettura libera, scrittura richiede entrambi |
| `/api/holidays` | `requireAuth`, `requireTabWrite("settings")`, `requireTabWrite("settings:holidays")` | lettura libera, scrittura richiede entrambi |
| `/api/users` | `requireAuth`, `requireTab("settings")`, `requireTab("settings:users")` | **tutto** (incluse le GET) richiede entrambi |
| `/api/absences` | `requireAuth`, `requireTabWrite("absences")` | lettura libera, scrittura richiede `absences` |
| `/api/activity` | `requireAuth`, `requireTab("settings")`, `requireTab("settings:activity")` | **tutto** richiede entrambi |
| `/api/admin` | `requireAuth`, più un controllo **inline** nell'handler (`req.user?.permissions !== null`) | l'unico router protetto non da `requireTab`/`requireTabWrite` ma da un controllo ad-hoc: richiede che l'utente sia admin (`permissions === null`, accesso completo), non un permesso specifico su una sezione. `POST /admin/reset-data` tronca tutte le tabelle dati applicative (vedi [01-funzionale.md §4.5](01-funzionale.md#45-reset-amministrativo-dei-dati)) |

### Protezioni anti-blocco (self-lockout)

Un utente non può, tramite l'endpoint `PUT /users/:id` **su se stesso**:
- disattivare il proprio account (`active: false` → 400);
- rimuovere `settings` o `settings:users` dai propri permessi (→ 400,
  impedirebbe di gestire ulteriormente gli utenti);

né, tramite `DELETE /users/:id`, **eliminare il proprio account** (→ 400).
Queste regole vivono lato server (`server/routes/users.ts`), non solo
nell'interfaccia — non sono aggirabili chiamando l'API direttamente.

### Difesa in profondità lato client

Oltre al blocco server-side (l'unico che conta ai fini della sicurezza), la
SPA replica il controllo permessi in due punti, per una migliore esperienza
utente:
1. **Navigazione** (`Layout.tsx`): le voci di menu per cui l'utente non ha
   il permesso non vengono renderizzate.
2. **Guardia di rotta** (`App.tsx` → componente `Protected`): la navigazione
   diretta a un URL non autorizzato mostra una pagina "Non hai accesso a
   questa sezione" invece del contenuto, anche se l'utente digita l'URL a
   mano o naviga dalla history del browser.

## 3. Audit trail

Ogni creazione/modifica/eliminazione di persone, progetti, assegnazioni,
assenze e utenti scrive una riga in `activity_log` (chi, cosa, quando,
azione). Consultabile in Impostazioni → Registro attività (a sua volta
protetto dal permesso `settings:activity`), filtrabile per utente, tipo di
entità e intervallo di date. La tabella è denormalizzata (vedi
[02-architettura.md §4](02-architettura.md#4-modello-dati-diagramma-entità-relazione))
per restare consultabile anche dopo l'eliminazione dell'attore o
dell'entità coinvolta.

## 4. Gestione dei segreti

| Segreto | Dove vive | Note |
|---|---|---|
| `DATABASE_URL` | `.env` locale (gitignored) / variabile d'ambiente Azure App Service | Include `sslmode=require` verso Azure Postgres |
| `JWT_SECRET` | `.env` locale / variabile d'ambiente Azure App Service | Fallback di sviluppo (`dev-only-secret-change-me`) **solo** se non impostato — da non usare mai in produzione |
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Secret del repository GitHub | Usato solo dal job `build-and-deploy` per il deploy |
| `TEST_DATABASE_URL` | `.env` locale (solo sviluppo) / `env` del job `test` in CI | Punta **sempre** a un database dedicato e usa-e-getta, mai a quello di produzione (vedi [03-tecnica.md §5](03-tecnica.md#5-testing)) |

`.env` è escluso dal controllo versione (`.gitignore`); `.env.example`
documenta le chiavi attese senza valori reali.

## 5. Superficie di attacco e mitigazioni

| Rischio | Mitigazione presente |
|---|---|
| XSS → furto del token di sessione | Cookie `httpOnly` (illeggibile da JavaScript) |
| CSRF | Cookie `sameSite: "lax"` (non inviato in richieste cross-site di tipo "simple") |
| SQL injection | Tutte le query passano da Drizzle ORM con parametri bindati; nessuna concatenazione di stringhe SQL nei router applicativi |
| Password deboli/compromesse | Hashing bcrypt (mai testo in chiaro); nessuna policy di complessità password lato server oltre alla lunghezza minima (8 caratteri, via zod) |
| Escalation di privilegi tramite l'API permessi | Validazione zod con `z.enum` sulle sole chiavi di permesso valide; guardie anti-self-lockout lato server |
| Path traversal / accesso a risorse altrui | Ogni endpoint filtra sempre per `id` numerico validato; non esistono percorsi che espongano file arbitrari lato server oltre ai file statici della build SPA |

## 6. Rischi noti e possibili evoluzioni

Elencati con onestà per chi valuterà il sistema o pianificherà un
hardening ulteriore:

- **Nessun rate-limiting sul login**: `POST /api/auth/login` non ha
  protezione contro tentativi ripetuti (brute-force). Mitigazione
  suggerita: rate-limiting per IP/email (es. `express-rate-limit`) o
  lockout temporaneo dopo N tentativi falliti.
- **Nessuna autenticazione a due fattori (2FA)**.
- **Nessuna rotazione di `JWT_SECRET`**: un secret compromesso invalida
  tutte le sessioni solo se ruotato manualmente (e richiede un redeploy).
- **`USERS` e `PEOPLE` non sono collegate** (vedi
  [01-funzionale.md §2](01-funzionale.md#2-due-concetti-di-persona-da-non-confondere)):
  oggi solo chi amministra/pianifica ha un account; se in futuro ogni
  "persona" dovesse avere un proprio login (self-service ferie, visibilità
  limitata ai propri dati), servirebbe introdurre quel collegamento e un
  modello di autorizzazione "a riga" (non solo "a sezione").
- **Nessuna notifica automatica** su approvazione/rifiuto assenze o
  variazioni di allocazione — un utente scopre l'esito solo accedendo
  all'applicazione.
- **Dipendenza di produzione con vulnerabilità nota (`drizzle-orm`)**:
  `npm audit --omit=dev` (verificato il 2026-09-02) segnala una vulnerabilità
  **high** in `drizzle-orm@0.31.4` (SQL injection via identificatori SQL
  non correttamente escaped, [GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9)),
  risolta in `drizzle-orm@0.45.2`. È rilevante perché Drizzle è proprio la
  mitigazione indicata in questa stessa tabella per il rischio SQL injection
  (§5) — va rivalutato l'aggiornamento (0.31.x → 0.45.x è un salto di major
  minor con possibili breaking change, non ancora pianificato). Oltre a
  questa, `npm audit` segnala ulteriori vulnerabilità moderate/alte ma solo
  in devDependencies (build/test tooling), non presenti nel bundle servito
  agli utenti; da rivalutare periodicamente con `npm audit`.
- **Log applicativi**: gli errori non gestiti finiscono su `console.error`
  (stdout/stderr del processo Node) — non c'è oggi un sistema centralizzato
  di log/alerting (es. Application Insights) collegato all'App Service.
