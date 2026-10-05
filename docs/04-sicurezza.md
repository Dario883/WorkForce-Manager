# Documentazione di sicurezza

## 1. Autenticazione

- **Meccanismo**: JWT (HS256, `jsonwebtoken`) contenente `{ userId, email,
  name }`, firmato con `JWT_SECRET` (variabile d'ambiente), trasportato in
  un cookie **httpOnly** (`wfm_session`) — mai esposto a JavaScript lato
  client, mitigando il furto del token via XSS.
- **Cookie**: `httpOnly: true`, `sameSite: "lax"`, `secure: true` in
  produzione (richiede HTTPS, forzato dall'App Service), durata **8 ore**.
  Il client esegue inoltre il logout dopo **30 minuti di inattività**.
- **Header HTTP**: Helmet imposta CSP, HSTS, anti-framing, `nosniff` e gli
  altri header predefiniti; l'App Service accetta HTTP solo per reindirizzarlo
  a HTTPS e richiede TLS 1.2 o superiore.
- **Password**: hashing con `bcryptjs`, cost factor 10 (default). Nessuna
  password in chiaro viene restituita dalle API o scritta nei log applicativi
  (le query di lettura utenti proiettano esplicitamente solo le colonne
  necessarie, escludendo `password_hash`; il seed stampa solo l'email).
- **Brute-force**: `POST /api/auth/login` è protetto da `express-rate-limit`:
  massimo 10 tentativi per IP in 15 minuti in produzione. Il limite può essere
  sovrascritto con `LOGIN_RATE_LIMIT_MAX` solo per ambienti di test locali.
  In produzione Express si fida di un solo proxy Azure per determinare l'IP
  client, evitando di usare lo stesso IP per tutti gli utenti.
- **MFA obbligatoria**: ogni account deve registrare TOTP al primo accesso
  prima di ricevere una sessione; le challenge di configurazione durano 10
  minuti e quelle di verifica 5 minuti. Il secret è cifrato con AES-256-GCM
  usando `MFA_ENCRYPTION_KEY`.
- **Verifica continua, non solo al login**: `attachUser` (middleware
  eseguito su ogni richiesta) **ri-legge da database** lo stato `active`,
  `mfaEnabled` e `permissions` dell'utente, invece di fidarsi solo del JWT.
  Disattivare un utente, rimuovergli MFA o restringergli i permessi ha effetto
  immediato.

## 2. Autorizzazione: modello a permessi

Il permesso di un utente è una singola colonna `permissions` (JSON
nullable) su `users`:

- **`null`** → accesso completo, riservato agli amministratori. Gli utenti
  creati dall'app ricevono inizialmente solo `dashboard`; la promozione ad
  amministratore è rifiutata dal server finché l'utente non ha MFA attiva.
- Gli utenti preesistenti con `null` mantengono i privilegi, ma al prossimo
  login devono completare l'enrollment MFA prima di ottenere una sessione.
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
| `DATABASE_URL` | `.env` locale (gitignored) / variabile d'ambiente Azure App Service | Include `sslmode=require`; connessioni filtrate dal firewall PostgreSQL |
| `JWT_SECRET` | `.env` locale / variabile d'ambiente Azure App Service | Obbligatorio in produzione; se assente l'applicazione non si avvia. Il fallback `dev-only-secret-change-me` è consentito solo fuori produzione |
| `MFA_ENCRYPTION_KEY` | `.env` locale / variabile d'ambiente Azure App Service | Obbligatorio in produzione; protegge i secret TOTP cifrati |
| `SEED_ADMIN_PASSWORD` | `.env` locale / variabile d'ambiente Azure App Service | Obbligatorio per il seed; non viene mai stampato nei log |
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Secret del repository GitHub | Usato solo dal job `build-and-deploy` per il deploy |
| `TEST_DATABASE_URL` | `.env` locale (solo sviluppo) / `env` del job `test` in CI | Punta **sempre** a un database dedicato e usa-e-getta, mai a quello di produzione (vedi [03-tecnica.md §5](03-tecnica.md#5-testing)) |

`.env` è escluso dal controllo versione (`.gitignore`); `.env.example`
documenta le chiavi attese senza valori reali.

## 5. Superficie di attacco e mitigazioni

| Rischio | Mitigazione presente |
|---|---|
| XSS → furto del token di sessione | Cookie `httpOnly` (illeggibile da JavaScript) |
| Intercettazione del traffico / clickjacking / MIME sniffing | HTTPS-only, TLS 1.2+, HSTS e header Helmet |
| CSRF | Cookie `sameSite: "lax"` (non inviato in richieste cross-site di tipo "simple") |
| Brute-force sul login | `express-rate-limit`: 10 tentativi per IP ogni 15 minuti in produzione |
| Sessioni lasciate aperte | JWT 8 ore + logout client dopo 30 minuti di inattività |
| Compromissione credenziali utente | MFA TOTP obbligatoria per ogni account prima del rilascio della sessione |
| SQL injection | Tutte le query passano da Drizzle ORM con parametri bindati; nessuna concatenazione di stringhe SQL nei router applicativi |
| Password deboli/compromesse | Hashing bcrypt (mai testo in chiaro); minimo 12 caratteri e rifiuto di password comuni |
| Escalation di privilegi tramite l'API permessi | Validazione zod; nuovi account limitati a `dashboard`; un account senza MFA non può essere promosso ad admin; guardie anti-self-lockout |
| Path traversal / accesso a risorse altrui | Ogni endpoint filtra sempre per `id` numerico validato; non esistono percorsi che espongano file arbitrari lato server oltre ai file statici della build SPA |

## 6. Rischi noti e possibili evoluzioni

Elencati con onestà per chi valuterà il sistema o pianificherà un
hardening ulteriore:

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
- **Dipendenze dev vulnerabili**: al 2026-10-05 `npm audit --omit=dev` non
  segnala vulnerabilità runtime; l'audit completo segnala ancora 10 avvisi
  (6 high, 4 moderate) nel toolchain di sviluppo. Le correzioni suggerite
  per Vite e Tailwind richiedono aggiornamenti major e una migrazione/test
  dedicata. Drizzle ORM è stato aggiornato a `0.45.3`, oltre la versione
  corretta per [GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9).
- **Firewall PostgreSQL**: l'accesso pubblico resta abilitato e la regola
  Azure-wide `0.0.0.0` è attualmente attiva. Un tentativo di sostituirla con
  gli IP di uscita dell'App Service ha interrotto la connettività applicativa
  ed è stato annullato; non restringere il firewall senza predisporre e
  verificare prima una rete privata/VNet o gli IP effettivamente usati.
  Rimane inoltre una regola per un IP di setup da verificare e rimuovere.
- **Backup**: retention PostgreSQL di 7 giorni e backup geo-ridondanti
  disabilitati; verificare esigenze di conservazione e disaster recovery.
- **Segreti e monitoraggio**: i segreti Azure sono ancora app settings, non
  Azure Key Vault; non è configurato Application Insights con alerting.
  Migrare i segreti in Key Vault e attivare monitoraggio dopo aver definito
  accessi, retention e costi.
- **Log applicativi**: gli errori non gestiti finiscono su `console.error`
  (stdout/stderr del processo Node) — non c'è oggi un sistema centralizzato
  di log/alerting (es. Application Insights) collegato all'App Service.
