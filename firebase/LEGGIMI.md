# Regole Firebase per "Il Mio Amico"

`database.rules.json` contiene **solo** la sezione `mioAmico`. Il database `goelectric-e9299` contiene anche altre app: **non sostituire tutte le regole**, aggiungi questo blocco a quelle esistenti.

## Come applicarle

1. Firebase Console → Realtime Database → **Regole**.
2. Dentro `"rules": { ... }` incolla il blocco `"mioAmico": { ... }` (sostituendo quello vecchio, se c'è), lasciando com'è il resto.
3. **Importante:** se più in alto (alla radice) c'è `".read": true` o `".write": true`, quelle regole valgono su tutto e annullano le restrizioni qui sotto. In quel caso spostale nei nodi delle altre app.
4. Clicca **Pubblica**. Puoi provarle prima con il **Simulatore di regole**.

## Cosa fanno

| Nodo | Lettura | Scrittura |
|---|---|---|
| `stats` | tutti | solo +1 alla volta su contatori con nome valido |
| `presence` | tutti | solo ID pubblici `h_…`, ora del server, giorno 0-20 |
| `players/<codice>` | solo chi conosce il codice (non si può elencare) | solo campi previsti, dimensioni massime |
| `notes` | tutti | solo testo pulito (max 40 caratteri), al massimo 1 ogni minuto per ospite |
| `fallen` | tutti | solo nome pulito, ora del server |
| `broadcast` | tutti | nessuno (lo scrivi tu dalla console) |
| tutto il resto | nessuno | nessuno |

## Pulizia una tantum

Le vecchie versioni del gioco salvavano `presence`, `notes` e `fallen` usando il **codice ospite vero** come chiave, quindi chiunque poteva leggerlo. Dopo aver pubblicato le regole, elimina dalla console i figli di questi tre nodi che iniziano con `a_` (quelli nuovi iniziano con `h_`).
