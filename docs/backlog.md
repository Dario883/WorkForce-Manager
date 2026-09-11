# Backlog prodotto — Workforce Manager

Backlog funzionale derivato dalle richieste del 2026-09-04. Le priorità
indicano l'ordine suggerito per la consegna:

- **P0**: controllo operativo o regola di integrità da implementare prima
  delle altre evoluzioni;
- **P1**: funzionalità importante per l'uso quotidiano;
- **P2**: miglioramento utile, ma non bloccante.

## Riepilogo

| ID | Area | Titolo | Priorità | Dipendenze |
|---|---|---|---|---|
| WFM-001 | Calendario | Bloccare il censimento su festività | P0 | Festività, assegnazioni |
| WFM-002 | Calendario | Convertire la percentuale in ore con tooltip | P1 | Capacità persona |
| WFM-003 | Persone | Eliminazione multipla delle risorse | P1 | API delete persone, conferma bulk |
| WFM-004 | Calendario | Ricerca e selezione multipla delle persone | P1 | Snapshot staffing |
| WFM-005 | Dashboard | Media di produttività per progetto | P1 | Definizione metrica, assegnazioni |
| WFM-006 | Ferie / Calendario | Sincronizzare assenze e bloccare i giorni approvati | P0 | Workflow assenze, calendario |
| WFM-007 | Staffing | Filtro per settimana, mese e anno | P1 | Intervallo temporale |
| WFM-008 | Dashboard / Impostazioni | Inclusione configurabile dei contractor nella produttività mensile | P1 | Impostazioni / Calcolo KPI |
| WFM-009 | Calendario | Visualizzazione tipo persona nel Calendario | P1 | Snapshot staffing, UI Calendario |
| WFM-010 | Calendario / Assegnazioni | Visualizzazione codice commessa nella selezione assegnazione | P1 | Progetti, commessaId, UI Calendario / Modal |

## Item dettagliati

### WFM-001 — Bloccare il censimento su festività

**Area:** Calendario · **Priorità:** P0 · **Tipo:** regola di business

Quando una cella del calendario corrisponde a una festività aziendale o
nazionale configurata, l'inserimento o la modifica di staffing deve essere
bloccato. In alternativa, se il business richiede di mantenere l'azione
possibile, deve essere mostrato un alert esplicito prima del salvataggio.
La scelta raccomandata è il blocco server-side, con feedback preventivo lato
UI.

**Criteri di accettazione**

- una cella di un giorno festivo è riconoscibile visivamente e non è editabile;
- un tentativo diretto verso l'API su una festività viene rifiutato con errore
  esplicito;
- il messaggio indica la festività che causa il blocco;
- i giorni non festivi continuano a supportare inserimento, split e modifica;
- la regola è coperta da test unitari e di integrazione.

### WFM-002 — Mostrare le ore equivalenti alla percentuale

**Area:** Calendario · **Priorità:** P1 · **Tipo:** UX

Passando sulla percentuale giornaliera, mostrare un tooltip con la conversione
in ore in base alla capacità della persona. Esempio con capacità settimanale
di 40 ore: `50% = 4h` e `25% = 2h`, assumendo 8 ore lavorative giornaliere.
La regola di conversione deve essere esplicita e non deve usare una capacità
fissa quando la persona ha un override di capacità.

**Criteri di accettazione**

- il tooltip mostra percentuale, ore equivalenti e data/periodo della cella;
- con capacità giornaliera di 8 ore, 50% mostra 4h e 25% mostra 2h;
- per una persona part-time o con override viene usata la capacità effettiva;
- il tooltip è disponibile in vista settimana, mese e anno senza cambiare il
  valore memorizzato.

**Nota da confermare:** se l'azienda considera sempre 5 giorni lavorativi,
la capacità giornaliera deve essere `ore settimanali / 5`; altrimenti va
confermata la ripartizione su 7 giorni attualmente usata dai KPI.

### WFM-003 — Eliminazione multipla delle persone

**Area:** Persone · **Priorità:** P1 · **Tipo:** bulk action

Consentire la selezione di più righe nella lista Persone e l'eliminazione in
blocco, per esempio per svuotare rapidamente una lista di risorse importata
per errore.

**Criteri di accettazione**

- la tabella dispone di checkbox per riga e seleziona/deseleziona tutte le
  righe filtrate;
- l'azione mostra il numero di persone e l'impatto sulle assegnazioni,
  assenze e periodi di capacità collegati;
- la conferma è obbligatoria e l'operazione è annullabile prima dell'invio;
- il server esegue l'operazione in modo atomico, applicando le regole di
  autorizzazione e cascata già previste;
- al termine la selezione viene azzerata e la lista viene ricaricata;
- il log attività registra ogni eliminazione o un evento bulk con l'elenco
  degli ID coinvolti.

### WFM-004 — Filtro multiselezione persone nel Calendario

**Area:** Calendario · **Priorità:** P1 · **Tipo:** UX

Aggiungere un filtro ricercabile a selezione multipla per scegliere una o più
risorse da visualizzare. La selezione appartiene al filtro sopra la tabella e
non alle singole righe del Calendario.

**Criteri di accettazione**

- la ricerca filtra per nome e, se disponibile, ruolo;
- il menu del filtro consente selezione singola, multipla, selezione dei
  risultati ricercati e ripristino di tutte le persone;
- la tabella non mostra checkbox sulle righe e contiene esclusivamente le
  risorse scelte nel filtro;
- il filtro resta applicato cambiando settimana, mese o anno;
- cambiare modalità Staffing/Ferie-Assenze non perde la selezione;
- se nessuna persona corrisponde viene mostrato uno stato vuoto esplicito;
- il filtro è solo di presentazione e non modifica i dati del calendario.

### WFM-005 — Media di produttività per progetto

**Area:** Dashboard · **Priorità:** P1 · **Tipo:** reporting

Affiancare alla media del periodo una vista della media di produttività per
progetto. Prima dell'implementazione va definito se “produttività” coincide
con percentuale allocata, ore allocate su capacità, oppure con una metrica
consuntiva futura. In assenza di consuntivi, la proposta iniziale è mostrare
la **media di allocazione del progetto nel periodo** e chiamarla chiaramente
“Media allocazione”.

**Criteri di accettazione**

- la Dashboard mostra una riga o un grafico per ogni progetto presente nel
  periodo selezionato;
- per ogni progetto sono visibili media percentuale, ore equivalenti e periodo
  di riferimento;
- progetti senza assegnazioni nel periodo non vengono confusi con progetti a
  media zero e sono indicati separatamente;
- il click apre il drilldown del progetto con persone e assegnazioni incluse;
- il calcolo rispetta capacità variabile, date dell'assegnazione e filtri
  settimana/mese/anno;
- la metrica e la formula sono descritte nella UI o nella documentazione.

### WFM-006 — Sincronizzare assenze e bloccare i giorni approvati

**Area:** Ferie/Assenze · Calendario · **Priorità:** P0 · **Tipo:** regola di
business

Quando viene inserita un'assenza, il Calendario deve mostrare la voce
**Assenza** sulla persona e sulle date interessate. Quando l'assenza è
approvata, il censimento staffing della giornata deve essere bloccato. Le
assenze in attesa possono essere visualizzate con stato distinto; quelle
rifiutate non devono bloccare e non devono essere conteggiate come assenza
effettiva.

**Criteri di accettazione**

- una nuova assenza compare nel Calendario senza inserimenti manuali;
- la visualizzazione distingue almeno tipo e stato dell'assenza;
- un'assenza approvata impedisce inserimento, modifica e split dello staffing
  sulle date sovrapposte;
- il server rifiuta anche richieste API manipolate sulle date bloccate;
- un'assenza rifiutata non blocca lo staffing;
- modifica, approvazione, rifiuto o cancellazione aggiornano il Calendario;
- sono coperti i casi di intervallo parziale, sovrapposizione e cambio stato.

**Decisione da confermare:** il blocco deve valere solo per il giorno intero
oppure anche per assenze espresse in ore? Per le assenze orarie serve
aggiungere durata e unità di misura al modello dati, se non già disponibili.

### WFM-007 — Filtro staffing per settimana, mese e anno

**Area:** Staffing · **Priorità:** P1 · **Tipo:** filtro temporale

Sostituire o affiancare il filtro “attive in questa data” con un selettore di
periodo: settimana, mese o anno. Il filtro deve mostrare le assegnazioni che
intersecano l'intervallo selezionato, senza richiedere che siano contenute
interamente nel periodo.

**Criteri di accettazione**

- sono disponibili le modalità settimana, mese e anno;
- l'utente può navigare al periodo precedente/successivo e tornare al periodo
  corrente;
- un'assegnazione è inclusa se interseca almeno un giorno dell'intervallo;
- i filtri persona, progetto, ricerca e ordinamento restano combinabili;
- il riepilogo indica periodo e numero di assegnazioni risultanti;
- il comportamento è coerente tra vista Lista e vista Per persona.

### WFM-008 — Inclusione configurabile dei contractor nella produttività mensile

**Area:** Dashboard / Impostazioni · **Priorità:** P1 · **Tipo:** reporting / configurazione

Consentire all'utente/amministratore di scegliere se le risorse esterne
(`type = 'consulente'` / contractor) devono concorrere al calcolo della
produttività e della media di allocazione mensile nella Dashboard (e relativi
KPI del team: media allocazione, FTE allocati, risorse sotto/sovra-utilizzate).

**Criteri di accettazione**

- presenza di un'opzione di configurazione (in Impostazioni > Soglie o toggle rapido in Dashboard) per includere/escludere i contractor dal calcolo della produttività/allocazione;
- quando l'opzione esclude i contractor, la media del team, le ore libere, gli FTE e gli elenchi sotto/sovra-allocazione considerano solo i dipendenti/stage;
- la vista di riepilogo dei progetti continua a mostrare l'allocazione effettiva complessiva sul progetto o evidenzia la quota contractor/dipendenti;
- lo stato dell'impostazione viene persistito ed è coerente al cambio mese/settimana/anno;
- calcoli e formule sono coperti da test unitari.

### WFM-009 — Visualizzazione tipo persona nel Calendario

**Area:** Calendario · **Priorità:** P1 · **Tipo:** UX

Nel Calendario, mostrare esplicitamente per ogni risorsa il campo **Tipo**
definito nell'anagrafica Persone (`Dipendente`, `Consulente`, `Stage`),
tramite etichetta/badge dedicato o testo affiancato al nome, integrato da
un tooltip esplicativo (es: *Eustachio Sardone (Dipendente)*, *Claudio Anelli (Consulente)*).

**Criteri di accettazione**

- il tipo persona (`dipendente`, `consulente`, `stage`) è incluso nel payload dello snapshot staffing (`/staffing/snapshot`) e fruibile nel Calendario;
- nella colonna "Persona" è visibile la tipologia risorsa accanto al nome (es. badge/etichetta o testo formattato);
- al passaggio del mouse sul nome della persona è disponibile un tooltip esplicito con formato `Nome Cognome (Tipo)` e ruolo;
- la visualizzazione è attiva sia in modalità Staffing sia in Ferie/Assenze;
- il filtro di ricerca persone nel Calendario permette la ricerca anche per tipo risorsa.

### WFM-010 — Visualizzazione codice commessa nella selezione assegnazione

**Area:** Calendario / Assegnazioni · **Priorità:** P1 · **Tipo:** UX

Quando si assegna o si modifica un progetto nel Calendario (sia dal menu a
tendina della riga espansa, sia dal modale di assegnazione rapida /
AssignmentModal), mostrare chiaramente sia il **nome del progetto** sia il
relativo **codice commessa** (`commessaId`). Esempio: *Migrazione Cloud (migrazione-cloud-2026-09-04)*.

**Criteri di accettazione**

- nel dropdown di selezione del progetto delle righe assegnazione del Calendario, le opzioni mostrano formato esplicito `[Nome Progetto] (Commessa: [commessaId])`;
- nel selettore progetto del modale `AssignmentModal`, ogni opzione include sia il nome del progetto sia l'identificativo commessa;
- nel tooltip informativo delle celle del calendario, accanto al nome progetto è presente anche il codice commessa per disambiguare assegnazioni su progetti simili/omonimi;
- la selezione continua a salvare correttamente il `projectId` corrispondente senza regressioni.

## Ordine suggerito di rilascio

1. **P0 — Integrità del calendario:** WFM-001 e WFM-006, includendo i
   controlli server-side e i test sulle sovrapposizioni.
2. **P1 — Operatività quotidiana:** WFM-003, WFM-004 e WFM-007.
3. **P1 — Reporting:** WFM-005, dopo la decisione sulla definizione di
   “produttività”.
4. **P1 — Supporto decisionale:** WFM-002, dopo la conferma della formula
   ore/settimana → ore/giorno.

## Stato implementazione — 2026-09-11

Gli item richiesti sono stati implementati nel codice corrente:

- **WFM-001:** blocco server-side e disabilitazione UI sulle festività;
- **WFM-002:** tooltip percentuale/ore nel Calendario, con capacità su 5 giorni
  lavorativi;
- **WFM-003:** selezione e cancellazione multipla delle Persone;
- **WFM-004:** filtro ricercabile multiselezione delle persone nel Calendario,
  senza checkbox sulle righe;
- **WFM-005:** media allocazione e ore equivalenti per progetto in Dashboard;
- **WFM-006:** visualizzazione assenze, durata oraria opzionale e blocco
  server-side delle assegnazioni su assenze approvate;
- **WFM-007:** filtro Staffing per tutto/settimana/mese/anno;
- **WFM-008:** inclusione/esclusione configurabile dei contractor dalla produttività mensile in Dashboard e Impostazioni;
- **WFM-009:** visualizzazione del tipo persona (badge e tooltip `Nome (Tipo) - Ruolo`) nel Calendario e filtro persone arricchito;
- **WFM-010:** visualizzazione del codice commessa (`commessaId`) nella selezione progetto per le assegnazioni nel Calendario e nel modale di assegnazione.

Le decisioni aperte sono state risolte così: festività e assenze approvate
bloccano l'inserimento; “produttività” è rappresentata dalla media di
allocazione fino a quando non esiste un dato consuntivo; l'inclusione dei
contractor nella produttività mensile è configurabile sia a livello globale
che tramite switch rapido in Dashboard; la capacità giornaliera usa la
settimana lavorativa di 5 giorni; un'assenza oraria è ammessa su una singola
giornata e, come regola prudenziale, una volta approvata blocca l'intera
giornata di staffing.

## Decisioni aperte

| Decisione | Opzioni | Responsabile |
|---|---|---|
| Festività | blocco rigido / alert con conferma | Product owner |
| Produttività | allocazione / ore allocate / consuntivo | Product owner + PM |
| Capacità giornaliera | ore settimanali / 5 giorni o / 7 giorni | Product owner |
| Assenze orarie | supportare ore nel modello / solo giornate | Product owner |