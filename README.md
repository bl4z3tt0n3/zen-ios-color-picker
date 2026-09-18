# iOS Color Picker for Zen

Mod sperimentale per Zen Browser che sostituisce visivamente il selettore colore del tema con un picker ispirato a quello di iPhone/iPad.

## Funzioni

- Griglia da 120 colori
- Spettro continuo con selettore trascinabile
- Cursori RGB con valori numerici
- Inserimento HEX sRGB
- Opacità 0–100%
- Campioni/preferiti persistenti
- `Applica colore`: sostituisce il tema corrente con un singolo colore esatto
- `Aggiungi al gradiente`: aggiunge il colore al gradiente Zen, fino a 3 colori
- Pulsante per mostrare/nascondere i controlli Zen originali

## Limite noto

La pipetta di iOS che campiona un pixel da qualunque punto dello schermo non è implementata. Il pulsante è presente solo come riferimento visivo ed è disabilitato, perché Zen/Firefox non espone in modo affidabile una API equivalente alle normali mod dell'interfaccia.

## Installazione consigliata: Sine

Questa mod usa JavaScript; le Zen Mods ufficiali sono CSS-only. Sine supporta mod con `theme.json`, CSS e script `*.uc.js`.

1. Installa Sine per Zen Browser.
2. Metti questi file in un repository GitHub pubblico (la root del repository deve contenere `theme.json`).
3. In Zen apri **Settings > Sine Mods**.
4. Abilita l'installazione di JavaScript da fonti non ufficiali, se Sine lo richiede.
5. Nel campo per aggiungere una mod da repository GitHub incolla l'URL del repository.
6. Installa la mod e riavvia Zen oppure usa **about:support > Clear startup cache** se richiesto.

## File

- `theme.json` - metadati Sine
- `ios-color-picker.uc.js` - logica del picker e integrazione con il Theme Picker di Zen
- `style.css` - interfaccia iOS-like

## Compatibilità

Sviluppata contro il Theme Picker presente nel sorgente Zen di settembre 2026. Zen è in evoluzione: se cambiano gli ID interni `PanelUI-zen-gradient-generator-*`, potrebbe essere necessario aggiornare i selettori.

