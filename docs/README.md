# Documentazione — WorkForce Manager

Questa cartella raccoglie la documentazione funzionale, architetturale, tecnica
e di sicurezza del progetto. È pensata per restare accanto al codice e per
essere aggiornata insieme ad esso (non è un documento "una tantum").

| Documento | Contenuto |
|---|---|
| [01-funzionale.md](01-funzionale.md) | Cos'è il sistema, chi lo usa, i moduli funzionali, i processi di business (con diagrammi di flusso e di stato) |
| [02-architettura.md](02-architettura.md) | Vista d'insieme, layer applicativi, diagrammi UML (classi, sequenza), modello dati (ER), diagramma di deployment |
| [03-tecnica.md](03-tecnica.md) | Stack tecnologico, struttura del repository, riferimento API, strategia di test, pipeline CI/CD |
| [04-sicurezza.md](04-sicurezza.md) | Autenticazione, modello di autorizzazione, gestione sessioni, audit trail, gestione segreti, rischi noti |

Disponibile anche come documento unico Word:
[`WorkForce-Manager-Documentazione.docx`](WorkForce-Manager-Documentazione.docx)
(stessi contenuti dei quattro file, con indice e diagrammi incorporati come
immagini — rigenerato dagli stessi sorgenti Markdown, non mantenuto a mano).

## Come leggerla

- Se devi capire **cosa fa** il prodotto e **perché**: parti dal documento funzionale.
- Se devi capire **come è costruito**: architettura → tecnica.
- Se devi valutare o modificare **permessi, autenticazione, dati sensibili**: sicurezza.

I diagrammi sono in [Mermaid](https://mermaid.js.org/) e si renderizzano
automaticamente nella pagina GitHub di questo repository e nella maggior parte
degli editor Markdown (incluso VS Code con l'estensione Markdown Preview Mermaid Support).

## Stato del progetto (riferimento rapido)

- **Repository**: `Dario883/WorkForce-Manager` (fork di deploy)
- **Ambiente di produzione**: Azure App Service + Azure Database for PostgreSQL Flexible Server
- **CI/CD**: GitHub Actions — job `test` (typecheck + unit + integration + e2e) blocca il job `build-and-deploy`
- **Ultimo aggiornamento di questa documentazione**: 2026-08-24
