# Documentazione architetturale

## 1. Vista d'insieme

Applicazione web classica a tre livelli: SPA React servita al browser,
API REST stateless su Express, database relazionale PostgreSQL. Nessun
servizio esterno di terze parti (nessun SaaS di autenticazione, nessuna coda
di messaggi, nessuna cache distribuita): la superficie da mantenere è
volutamente minima.

```mermaid
flowchart LR
    subgraph Browser
        SPA["React SPA<br/>(wouter router, Tailwind)"]
    end

    subgraph "Azure App Service (Linux, Node.js)"
        API["Express API<br/>+ file statici della SPA"]
    end

    subgraph "Azure Database for PostgreSQL<br/>Flexible Server"
        DB[(PostgreSQL)]
    end

    SPA -- "fetch /api/* <br/>cookie httpOnly JWT" --> API
    API -- "Drizzle ORM<br/>TLS (sslmode=require)" --> DB

    GH["GitHub Actions<br/>(CI/CD)"] -. "npm run build<br/>+ deploy pacchetto" .-> API
    GH -. "drizzle-kit migrate" .-> DB
```

In produzione, `npm run build` compila la SPA (Vite) in file statici e
impacchetta il server (esbuild) in un unico bundle Node; **lo stesso
processo Express** serve sia le API (`/api/*`) sia i file statici della SPA
(fallback su `index.html` per il routing lato client) — un solo servizio da
distribuire, nessun reverse proxy dedicato al frontend.

## 2. Layer applicativi

```mermaid
flowchart TB
    L1["Presentazione — client/src/pages, components<br/>React, Tailwind, wouter"]
    L2["Stato/integrazione client — client/src/lib<br/>api.ts (fetch wrapper + ApiError), auth.tsx (contesto React), theme.tsx"]
    L3["Trasporto — HTTP/JSON su cookie httpOnly<br/>(nessun token in localStorage)"]
    L4["Instradamento + middleware — server/app.ts<br/>express.json, cookieParser, attachUser, requireAuth, requireTab/requireTabWrite"]
    L5["Logica di dominio — server/routes/*.ts<br/>validazione (zod), regole di business, audit log"]
    L6["Accesso ai dati — server/db.ts, server/schema.ts<br/>Drizzle ORM (query builder tipizzato)"]
    L7[("Persistenza — PostgreSQL")]

    L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7
```

Ogni layer ha una responsabilità unica e non salta livelli: i componenti
React non parlano mai direttamente al database, i router Express non
generano mai HTML, l'accesso ai dati passa sempre da Drizzle (mai SQL grezzo
sparso nei router, salvo il singolo `TRUNCATE` usato solo nell'harness dei
test — vedi [03-tecnica.md](03-tecnica.md#5-testing)).

## 3. Catena middleware (Express)

Ogni richiesta verso `/api/*` (eccetto `/api/auth/*`, pubblico) attraversa
questa catena, definita in `server/app.ts`:

```mermaid
flowchart LR
    R[Richiesta HTTP] --> M1["express.json()"]
    M1 --> M2["cookieParser()"]
    M2 --> M3["attachUser<br/>(decodifica JWT, ri-verifica<br/>active + permissions da DB<br/>ad OGNI richiesta)"]
    M3 --> M4{"requireAuth<br/>req.user presente?"}
    M4 -->|No| E401["401 Non autenticato"]
    M4 -->|Sì| M5{"requireTab / requireTabWrite<br/>permesso sulla sezione?"}
    M5 -->|No| E403["403 Non hai i permessi..."]
    M5 -->|Sì| RT["Router della risorsa<br/>(validazione zod + logica)"]
    RT --> RES["Risposta JSON"]
```

Il dettaglio di quali sezioni sono richieste per ciascuna risorsa è in
[04-sicurezza.md](04-sicurezza.md#matrice-endpoint--permesso-richiesto).

## 4. Modello dati (diagramma entità-relazione)

```mermaid
erDiagram
    USERS {
        int id PK
        varchar email UK
        text password_hash
        varchar name
        boolean active
        jsonb permissions "null = accesso completo"
        timestamp created_at
    }

    PEOPLE {
        int id PK
        varchar name
        varchar email
        varchar role
        varchar avatar_color
        real capacity_hours_per_week
        int manager_id FK "self-reference"
        boolean is_approver
        timestamp created_at
        timestamp updated_at
    }

    PROJECTS {
        int id PK
        varchar commessa_id UK
        varchar name UK
        varchar client
        enum status "planned/active/on_hold/completed"
        enum delivery_type "TK/T&M/TaaS/AMS"
        varchar color
        int pm_id FK
        date start_date
        date end_date
    }

    ASSIGNMENTS {
        int id PK
        int person_id FK
        int project_id FK
        real percentage
        date start_date
        date end_date
        enum period_type "day/week/month/year"
    }

    ABSENCES {
        int id PK
        int person_id FK
        enum type "ferie/malattia/permesso/formazione/altro"
        enum status "in_attesa/approvata/rifiutata"
        date start_date
        date end_date
        text notes
    }

    PERSON_CAPACITY_PERIODS {
        int id PK
        int person_id FK
        date start_date
        date end_date "null = a tempo indeterminato"
        real hours_per_week
    }

    HOLIDAYS {
        int id PK
        date date UK
        varchar name
    }

    SETTINGS {
        varchar key PK
        text value
    }

    ACTIVITY_LOG {
        int id PK
        int user_id "denormalizzato, non FK"
        varchar user_name "denormalizzato, non FK"
        enum action "created/updated/deleted"
        varchar entity_type
        int entity_id "denormalizzato, non FK"
        varchar entity_name
        timestamp created_at
    }

    PEOPLE ||--o{ PEOPLE : "manager_id"
    PEOPLE ||--o{ PROJECTS : "pm_id"
    PEOPLE ||--o{ ASSIGNMENTS : "person_id"
    PROJECTS ||--o{ ASSIGNMENTS : "project_id"
    PEOPLE ||--o{ ABSENCES : "person_id"
    PEOPLE ||--o{ PERSON_CAPACITY_PERIODS : "person_id"
```

Note di progettazione del modello dati:

- **`USERS` non ha alcuna relazione con `PEOPLE`** (vedi
  [01-funzionale.md §2](01-funzionale.md#2-due-concetti-di-persona-da-non-confondere)):
  sono due domini distinti (accesso vs. risorsa pianificabile).
- **`ACTIVITY_LOG` è volutamente denormalizzato**: `user_id`, `user_name`,
  `entity_id` sono colonne semplici, non chiavi esterne, così il log resta
  leggibile e integro anche se l'utente che ha compiuto l'azione o l'entità
  modificata vengono in seguito eliminati.
- **`PERMISSIONS` è un array JSON nullable** (non una tabella di join
  utente↔permesso): `null` significa "accesso completo" (comportamento di
  default per compatibilità con gli utenti esistenti prima dell'introduzione
  del modello a permessi); un array esplicito elenca le sezioni concesse.
  Questa scelta evita una tabella aggiuntiva per un caso d'uso semplice
  (poche decine di chiavi possibili, note staticamente in `shared/types.ts`).
- **Eliminazioni a cascata**: eliminare una persona elimina a cascata le sue
  assegnazioni, assenze e periodi di capacità (`onDelete: "cascade"`);
  eliminare il responsabile di un'altra persona o il PM di un progetto
  imposta invece `manager_id`/`pm_id` a `null` (`onDelete: "set null"`) —
  non si perdono righe collegate solo perché un riferimento gerarchico
  viene rimosso.

## 5. Modello di dominio (diagramma delle classi)

Vista orientata agli oggetti delle stesse entità, con i metodi/le regole di
dominio più rilevanti (non necessariamente implementati come metodi di
classe nel codice — qui la logica è funzionale, dentro ai router — ma
concettualmente di competenza di ciascuna entità):

```mermaid
classDiagram
    class User {
        +int id
        +string email
        +string name
        +boolean active
        +string[] permissions
        +hasAccess(tab) boolean
    }

    class Person {
        +int id
        +string name
        +string role
        +number capacityHoursPerWeek
        +int managerId
        +boolean isApprover
        +resolveCapacity(date) number
    }

    class Project {
        +int id
        +string commessaId
        +string name
        +ProjectStatus status
        +DeliveryType deliveryType
        +int pmId
    }

    class Assignment {
        +int id
        +int personId
        +int projectId
        +number percentage
        +Date startDate
        +Date endDate
        +overwrite(newRange) Assignment[]
        +splitAt(date, unit, percentage) Assignment[]
    }

    class Absence {
        +int id
        +int personId
        +AbsenceType type
        +AbsenceStatus status
        +Date startDate
        +Date endDate
        +approve()
        +reject()
    }

    class CapacityPeriod {
        +int id
        +int personId
        +Date startDate
        +Date endDate
        +number hoursPerWeek
    }

    class ActivityLogEntry {
        +int userId
        +string action
        +string entityType
        +string entityName
        +Date createdAt
    }

    Person "1" --> "0..*" Assignment : ha
    Project "1" --> "0..*" Assignment : riceve
    Person "1" --> "0..*" Absence : richiede
    Person "1" --> "0..*" CapacityPeriod : ha override di
    Person "0..1" --> "0..*" Person : è responsabile di
    Person "0..1" --> "0..*" Project : è PM di
```

> `permissions`, `managerId`, `pmId` ed `endDate` (in `CapacityPeriod`) sono
> nullable — omesso dal diagramma per leggibilità, dettagliato nell'[ER
> diagram](#4-modello-dati-diagramma-entità-relazione) sopra.

## 6. Diagrammi di sequenza

### 6.1 Login e verifica continua della sessione

```mermaid
sequenceDiagram
    actor U as Utente
    participant SPA as React SPA
    participant API as Express (/api/auth)
    participant DB as PostgreSQL

    U->>SPA: inserisce email + password
    SPA->>API: POST /api/auth/login
    API->>DB: SELECT user WHERE email
    DB-->>API: riga utente (password_hash)
    API->>API: bcrypt.compare(password, hash)
    alt credenziali valide
        API->>API: jwt.sign({userId, email, name})
        API-->>SPA: 200 + Set-Cookie httpOnly (7 giorni)
    else credenziali non valide
        API-->>SPA: 401 Credenziali non valide
    end

    Note over SPA,API: Ad ogni richiesta successiva...
    SPA->>API: GET /api/people (cookie incluso)
    API->>API: verifica firma JWT
    API->>DB: SELECT active, permissions WHERE id = userId
    DB-->>API: active=true, permissions=[...]
    API->>API: requireAuth → requireTabWrite("people")
    API-->>SPA: 200 dati
```

La ri-verifica di `active`/`permissions` **ad ogni richiesta** (non solo al
login) è la scelta architetturale chiave dell'autenticazione: disattivare un
utente o restringergli i permessi ha effetto immediato, senza dover
invalidare o attendere la scadenza del token.

### 6.2 Richiesta bloccata da permesso mancante

```mermaid
sequenceDiagram
    actor U as Utente ristretto
    participant SPA as React SPA
    participant API as Express

    U->>SPA: naviga su /people
    SPA->>API: POST /api/people (crea persona)
    API->>API: requireAuth → OK (autenticato)
    API->>API: requireTabWrite("people") → permessi non includono "people"
    API-->>SPA: 403 {error: "Non hai i permessi..."}
    SPA-->>U: mostra errore / la SPA nasconde già<br/>la sezione in navigazione
```

### 6.3 Sovrascrittura di uno staffing esistente

```mermaid
sequenceDiagram
    actor PM as Pianificatore
    participant SPA as React SPA
    participant API as Express (/api/assignments)
    participant DB as PostgreSQL

    PM->>SPA: crea nuova assegnazione con "sovrascrivi"
    SPA->>API: POST /api/assignments/overwrite
    API->>DB: SELECT assegnazioni esistenti (stessa persona+progetto)
    DB-->>API: righe esistenti
    loop per ogni riga che si sovrappone
        API->>API: calcola tipo di sovrapposizione
        API->>DB: UPDATE (tronca) / INSERT (divide) / DELETE (copertura totale)
    end
    API->>DB: INSERT nuova assegnazione
    API->>DB: INSERT activity_log (created, "assegnazione")
    API-->>SPA: 201 nuova assegnazione
```

## 7. Diagramma di deployment

```mermaid
flowchart TB
    subgraph Dev["Sviluppo locale"]
        DevMachine["npm run dev:server (:3000)<br/>npm run dev:client (:5173, proxy /api)"]
    end

    subgraph GitHub
        Repo["Repository Git<br/>Dario883/WorkForce-Manager"]
        TestJob["Job 'test'<br/>typecheck + unit + integration + e2e<br/>(Postgres effimero via service container)"]
        DeployJob["Job 'build-and-deploy'<br/>(needs: test)"]
    end

    subgraph Azure["Azure (region: West Europe / fallback regionale)"]
        Plan["App Service Plan<br/>Linux, SKU B1"]
        WebApp["Azure App Service<br/>Node.js, porta assegnata da Azure"]
        PG["Azure Database for PostgreSQL<br/>Flexible Server, Burstable Standard_B1ms"]
    end

    DevMachine -- git push --> Repo
    Repo -- "push su main" --> TestJob
    TestJob -- "solo se tutti i test passano" --> DeployJob
    DeployJob -- "npm run build + deploy" --> WebApp
    Plan -. ospita .-> WebApp
    WebApp <-- "TLS, sslmode=require" --> PG
```

Il job `test` della pipeline usa un **Postgres effimero** (container di
servizio di GitHub Actions), non il database di produzione: build e deploy
procedono solo se l'intera suite passa contro quel database usa-e-getta.
Dettagli in [03-tecnica.md §CI/CD](03-tecnica.md#6-cicd).

## 8. Decisioni architetturali chiave

| Decisione | Alternativa scartata | Motivazione |
|---|---|---|
| REST + fetch | tRPC | Meno boilerplate, nessun accoppiamento di tipi a runtime, più facile da debuggare con strumenti standard |
| PostgreSQL + Drizzle | MySQL / ORM più pesante (Prisma) | Vincoli relazionali solidi (enum nativi, cascade); Drizzle genera SQL leggibile e migrazioni versionate senza runtime engine separato |
| JWT in cookie httpOnly | Sessioni server-side (store in memoria/Redis) | Nessuno stato server da gestire/scalare; il cookie httpOnly non è leggibile da JavaScript lato client (mitiga XSS token-theft) |
| Permessi come array JSON nullable su `users` | Tabella `user_permissions` con join | Il dominio dei permessi è piccolo e statico (8 sezioni + 4 sotto-sezioni); una colonna evita una join in ogni richiesta autenticata |
| Un solo processo Express serve API + statici | Frontend e backend su host separati | Un solo servizio da distribuire e monitorare su un piano App Service economico |
| `wouter` invece di `react-router` | react-router | 1/10 del peso, stesse funzionalità necessarie (routing client-side semplice) |

Per il confronto completo con la versione originale del progetto (pre-riscrittura), vedi la tabella in fondo al [README](../README.md#differenze-rispetto-alloriginale).
