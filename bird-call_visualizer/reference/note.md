# Sound Visualization — Bird Songs (Arese)

## Il progetto in una frase
Visualizzazione 3D di canti d'uccello registrati,
ispirata al modello di Lucio Arese mostrato nel video di riferimento.

## Cosa fa il modello originale (sintesi del video)

L'audio viene tradotto in **punti distribuiti nello spazio 3D**, che nel tempo
formano una struttura a strati. Ogni punto porta con sé un set di informazioni:

- **Colore**: banda di frequenza più attiva al momento dell'emissione
  (zona indicativa, non frequenza precisa)
- **Ampiezza**: intensità del segnale in quel momento
- **Emission time**: timestamp di emissione (in secondi)
- **Lifetime**: età relativa del punto (animato, in secondi)
- **Spectral centroid**: "centro di massa" dello spettrogramma (in kHz),
  indica se il suono è complessivamente brillante o scuro

Funzionalità chiave: possibilità di **freezare** il flusso real-time e salvare
**snapshot** statici della struttura 3D, navigabili (zoom).

Grafici secondari mostrati nel video:
- Amplitude vs Frequency nel tempo (bidimensionale)
- Spectral centroid vs Amplitude

L'originale è costruito in **TouchDesigner** (ambiente node-based, non codice).
Lo replicheremo con un altro stack.

## Cosa voglio fare io

- Input: file audio di canti d'uccello (formato: wav o mp3)
- Provenienza dei canti: web (YouTube, siti specializzati)
- Durata tipica per file: da pochi secondi a max 2 minuti
- Numero di file su cui sperimentare: 3 file audio pronti

## Cosa tenere del modello originale e cosa cambiare

Tenere:
- distribuzione dei punti in 3D
- colore = banda di frequenza dominante
- snapshot navigabili

Da decidere / personalizzare:
- Voglio i grafici secondari oltre alla viz 3D? (da valutare)
- Esportazione snapshot: non prioritaria, valuteremo più avanti
- Voglio poter confrontare canti di specie diverse in simultanea

## Stack tecnico
Da decidere insieme a Claude dopo che avrà letto trascrizione e frame.
Candidati realistici: Three.js+Web Audio API (browser) oppure Python con
moderngl + librosa (desktop).

## Risorse
- Video originale: https://www.youtube.com/watch?v=prhQqpAxrm8
- Trascrizione: reference/transcript/reference_LucioArese.txt
- Frame chiave: reference/frames/ (organizzati in 7 sottocartelle per sezione)