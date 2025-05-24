// Definisci la funzione logger globalmente
function globalTesseractLogger(m) {
    console.log('[Tesseract Global Log]', m); // Logga sempre il messaggio grezzo per debug
    if (m && m.status) { // Controlla che m e m.status esistano
        if (m.status === 'loading language model' || m.status === 'initializing tesseract' || m.status === 'initialized tesseract' || m.status === 'recognizing text') {
            const progressPercentage = m.progress !== undefined ? (m.progress * 100).toFixed(2) + '%' : 'N/A';
            console.log(`[Tesseract Worker Status] ${m.status}, Progress: ${progressPercentage}`);
        }
        if (m.status === 'error') {
            console.error('[Tesseract Worker Error]', m.data || m); // Logga m.data se disponibile, altrimenti l'oggetto m intero
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const caricaScontrinoBtn = document.getElementById('caricaScontrinoBtn');
    const scontrinoInput = document.getElementById('scontrinoInput');
    const statusDiv = document.getElementById('status');
    const rawTextDiv = document.getElementById('rawText');
    const parsedDataDiv = document.getElementById('parsedData');

    function parseScontrinoText(text) {
        console.log("[Parsing] Testo ricevuto per il parsing (prima di split):", text);
        // CORRECTED REGEX for line splitting to handle actual newline characters
        const lines = text.split(/\r\n?|\n/);
        console.log(`[Parsing] Numero di righe trovate dopo lo split: ${lines.length}`);
        if (lines.length <= 1 && text.length > 80) { 
            console.warn("[Parsing] Attenzione: Lo split delle righe ha prodotto poche righe per un testo lungo. Numero di righe: " + lines.length);
        }
        
        let importo = "0.00";
        let dataScontrino = new Date().getFullYear() + '-01-01'; // Placeholder
        
        // NUOVA LOGICA RICHIESTA DALL'UTENTE
        let nomeNegozio = "spesa"; // MODIFICATO DEFAULT
        let tipoSpesa = "Altro";   // Placeholder per il tipo di spesa (es. "Spese Casa")
        let categoriaContabile = "Uscite"; // Default per scontrini di spesa
        let tipoDocumento = "Scontrino"; // Default per il tipo di documento fiscale

        // --- 1. ESTRAZIONE TIPO DOCUMENTO (Fattura, Scontrino Fiscale, ecc.) ---
        const tipoDocKeywordsDefinition = {
            "Fattura": ["FATTURA"],
            "Ricevuta Non Fiscale": ["RICEVUTA NON FISCALE", "RICEVUTA N.F."],
            "Ricevuta Fiscale": ["RICEVUTA FISCALE", "RIC. FISC."],
            "Scontrino Fiscale": ["SCONTRINO FISCALE", "SCONTR. FISCALE", "DOC. COMMERCIALE", "DOCUMENTO COMMERCIALE"],
            "Scontrino": ["SCONTRINO N.", "SCONTRINO NUMERO", "SCONTRINO"]
        };
        let tipoDocTrovato = false;
        const tipoDocSearchOrder = ["Fattura", "Ricevuta Non Fiscale", "Ricevuta Fiscale", "Scontrino Fiscale", "Scontrino"];

        for (const key of tipoDocSearchOrder) {
            if (tipoDocTrovato) break;
            for (const line of lines) {
                const upperLine = line.toUpperCase();
                if (tipoDocKeywordsDefinition[key].some(kw => upperLine.includes(kw))) {
                    if (key === "Scontrino" && tipoDocumento === "Scontrino Fiscale") { 
                        continue;
                    }
                    tipoDocumento = key;
                    tipoDocTrovato = true;
                    console.log(`[Parsing TipoDoc] Trovato: ${tipoDocumento} sulla riga: "${line}"`);
                    break;
                }
            }
        }
        if (!tipoDocTrovato) {
            console.log(`[Parsing TipoDoc] Nessuna keyword trovata, usando default: ${tipoDocumento}`);
        }

        // --- 2. ESTRAZIONE DESCRIZIONE (NOME NEGOZIO/FORNITORE) ---
        const nomiNegoziKeywords = [
            // Marchi noti di supermercati (priorità più alta)
            "EUROSPIN", "LIDL", "CONAD", "COOP", "ESSELUNGA", "ALDI", "MD SPA", "CARREFOUR", "IPER",
            // Altri tipi di negozi/servizi
            "SUPERMERCATO", "MARKET", "PANIFICIO", "PASTICCERIA", "MACELLERIA", "FARMACIA", "PARAFARMACIA",
            "RISTORANTE", "PIZZERIA", "TRATTORIA", "OSTERIA", "BAR ", "CAFFE'",
            "Q8", "ENI", "AGIP", "SHELL", "TOTAL", "ERG", "IP ", "TAMOIL", "DISTRIBUTORE",
            "MEDIAWORLD", "UNIEURO", "EURONICS", "TRONY", "EXPERT",
            "LEROY MERLIN", "IKEA", "BRICOMAN", "BRICO ",
            "DECATHLON", "ZARA", "H&M", "OVIESSE", "UPIM", "BENETTON"
        ];
        
        // Aggiungiamo una ricerca specifica per EUROSPIN che è spesso presente negli scontrini
        let euroSpinFound = false;
        for (const line of lines) {
            if (line.toUpperCase().includes("EUROSPIN") || line.toUpperCase().includes("EURO SPIN")) {
                nomeNegozio = "EUROSPIN";
                nomeNegozioTrovato = true;
                euroSpinFound = true;
                console.log(`[Parsing NomeNegozio] Trovato EUROSPIN con ricerca specifica`);
                break;
            }
        }
        
        // Procediamo con la normale ricerca di keyword solo se non abbiamo già trovato EUROSPIN
        if (!euroSpinFound) {
            let negozioDaKeyword = null;

            // Prima passata: solo keywords
            for (let i = 0; i < Math.min(lines.length, 15); i++) {
                let line = lines[i].trim();
                if (line.length < 3 || line.length > 70) continue;
                const upperLine = line.toUpperCase();

                for (const nome of nomiNegoziKeywords) {
                    if (upperLine.includes(nome)) {
                        negozioDaKeyword = nome.trim();  // usa solo la keyword corretta
                        nomeNegozioTrovato = true;
                        console.log(`[Parsing NomeNegozio] Trovato con keyword "${nome}": "${negozioDaKeyword}"`);
                        break;
                    }
                }
                if (nomeNegozioTrovato) break;
            }

            if (nomeNegozioTrovato) {
                nomeNegozio = sanitizeStoreName(negozioDaKeyword);
            } else {
                // Seconda passata: euristica (se nessuna keyword trovata)
                // Applica l'euristica a partire dalla seconda riga (i=1) per evitare rumore comune all'inizio.
                for (let i = 1; i < Math.min(lines.length, 15); i++) { // MODIFICA: parte da i = 1
                    let line = lines[i].trim();
                    if (line.length < 3 || line.length > 70) continue;
                    const upperLine = line.toUpperCase();

                    // MODIFICA: Richiede almeno 1 parola e almeno 3 caratteri alfabetici
                    if (line.split(/\\s+/).length >= 1 && line.split(/\\s+/).length <= 5) { 
                        const alphaCharsInLine = (upperLine.match(/[A-ZÀ-ÿ]/g) || []).length;
                        if (alphaCharsInLine >= 3) {
                            if (!paroleDaEvitarePerNomeNegozio.some(keyword => upperLine.includes(keyword.toUpperCase()))) {
                                if (upperLine.match(/[A-ZÀ-ÿ]/) && !upperLine.match(/^\\d+\\s*$/)) { 
                                    const regexPartitaIvaApprox = /(P\\.?\\s*IVA|IT\\s*\\d{11})/i;
                                    const regexIndirizzoApprox = /(VIA|VIALE|PIAZZA|CORSO|NUMERO CIVICO|NC)/i;
                                    if (!regexPartitaIvaApprox.test(upperLine) && !regexIndirizzoApprox.test(upperLine)) {
                                        nomeNegozio = line;
                                        nomeNegozioTrovato = true; 
                                        console.log(`[Parsing NomeNegozio] Trovato (euristica, da riga ${i}): "${nomeNegozio}"`);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!nomeNegozioTrovato) { 
            console.log(`[Parsing NomeNegozio] Nessun nome negozio adatto trovato, usando default: "${nomeNegozio}" (default attuale: 'spesa')`);
        }


        // --- 3. ESTRAZIONE TIPO SPESA (basato su nome negozio e altre keyword) ---
        // Questa logica è simile alla vecchia "categoria"
        const tipoSpesaKeywords = {
            "MATERIALI": ["FERRAMENTA", "RICAMBIO", "ATTREZZO", "MATERIALE", "VERNICE", "LEGNO", "METALLO", "PLASTICA", "PEZZI", "RICAMBI", "ACCESSORI AUTO", "COMPONENTI"],
            "CAPO": ["ABBIGLIAMENTO", "SCARPE", "VESTITI", "MODA", "BOUTIQUE", "CALZATURE", "INTIMO", "ACCESSORI", "ZARA", "H&M", "OVIESSE", "UPIM", "BENETTON", "DECATHLON", "CALZATURE", "INDUMENTI", "UNIFORME"],
            "AUTO": ["CARBURANTE", "BENZINA", "DIESEL", "GPL", "METANO", "STAZIONE SERVIZIO", "DISTRIBUTORE", "Q8", "ENI", "AGIP", "SHELL", "TOTAL", "ERG", "IP ", "TAMOIL", "FUEL", "OFFICINA", "MECCANICO", "GOMME", "PNEUMATICI", "AUTOSTRADA", "PARCHEGGIO", "PEDAGGIO", "TELEPASS"],
            "TASSE": ["TASSE", "BOLLO", "F24", "AGENZIA ENTRATE", "INPS", "CAMERA COMMERCIO", "FISCO", "IMPOSTA", "IVA", "IRPEF", "IMU", "TARI", "TRIBUTO"],
            "COMMERCIALISTA": ["COMMERCIALISTA", "CONSULENZA", "CONSULENTE", "PARCELLA", "FATTURA COMMERCIALISTA", "DOTTORE COMMERCIALISTA"],
            "SPESE CASA": ["ALIMENTARI", "EUROSPIN", "ALDI", "LIDL", "CONAD", "COOP", "ESSELUNGA", "MD SPA", "CARREFOUR", "IPER", "SUPERMERCATO", "MARKET", "PANE", "PANIFICIO", "PASTICCERIA", "MACELLERIA", "SALUMERIA", "FRUTTA", "VERDURA", "GASTRONOMIA", "CIBO", "DROGHERIA", "FARMACIA", "PARAFARMACIA", "MEDICINALI", "SANITARI", "CURA PERSONA", "IGIENE", "CASA", "CASALINGHI"],
            "MAGAZZINO": ["MAGAZZINO", "DEPOSITO", "STOCCAGGIO", "SCAFFALE", "SCATOLA", "IMBALLO", "FORNITURA", "CONTENITORE", "UTENSILI", "STORAGE"],
            "EXTRA": ["RISTORANTE", "PIZZERIA", "TRATTORIA", "OSTERIA", "BAR", "CAFFE", "PUB", "TAVOLA CALDA", "MENU", "COPERTO", "PRANZO", "CENA", "COLAZIONE", "APERITIVO", "FOOD", "FASTFOOD", "CINEMA", "TEATRO", "MUSEO", "LIBRI", "LIBRERIA", "GIORNALI", "RIVISTE", "CONCERTO", "EVENTI", "SPORT", "PALESTRA", "PISCINA", "ARREDO", "OGGETTISTICA", "LEROY MERLIN", "IKEA", "BRICOMAN", "INFORMATICA", "ELETTRONICA", "MEDIAWORLD", "UNIEURO", "EURONICS", "SMARTPHONE", "TELEFONIA", "BIGLIETTO", "TRENO", "AUTOBUS", "AEREO", "VOLO", "VIAGGIO", "HOTEL", "ALBERGO", "ASSICURAZIONE", "SERVIZI", "BOLLETTA", "UTENZE"]
        };

        let scoresTipoSpesa = {};
        for (const tsCat in tipoSpesaKeywords) { scoresTipoSpesa[tsCat] = 0; }

        const nomeNegozioUpper = nomeNegozio.toUpperCase();

        // Punteggio forte basato sul nome del negozio trovato
        if (nomeNegozioTrovato && nomeNegozio !== "N/D") {
            for (const tsCat in tipoSpesaKeywords) {
                for (const keyword of tipoSpesaKeywords[tsCat]) {
                    if (nomeNegozioUpper.includes(keyword)) {
                        scoresTipoSpesa[tsCat] += 5;
                        console.log(`[Parsing TipoSpesa DEBUG] Bonus forte per '${keyword}' in nomeNegozio '${nomeNegozio}' per tipoSpesa '${tsCat}'`);
                    }
                }
            }
        }

        // Punteggio basato su tutte le righe solo se non abbiamo trovato il nome negozio
        if (!nomeNegozioTrovato) {
            for (const line of lines) {
                const upperLine = line.toUpperCase();
                for (const tsCat in tipoSpesaKeywords) {
                    for (const keyword of tipoSpesaKeywords[tsCat]) {
                        if (upperLine.includes(keyword.toUpperCase())) {
                            scoresTipoSpesa[tsCat]++;
                        }
                    }
                }
            }
        }

        let maxScoreTipoSpesa = 0;
        let bestTipoSpesa = "EXTRA"; // Default allineato con le nuove categorie

        for (const tsCat in scoresTipoSpesa) {
            if (scoresTipoSpesa[tsCat] > maxScoreTipoSpesa) {
                maxScoreTipoSpesa = scoresTipoSpesa[tsCat];
                bestTipoSpesa = tsCat;
            }
        }
        
        // Assicuriamoci che EUROSPIN sia sempre mappato a SPESE CASA
        if (nomeNegozio === "EUROSPIN" || nomeNegozioUpper.includes("EUROSPIN")) {
            bestTipoSpesa = "SPESE CASA";
            console.log("[Parsing TipoSpesa] Forzato a SPESE CASA per EUROSPIN");
        }
        
        if (maxScoreTipoSpesa > 0) {
            tipoSpesa = bestTipoSpesa;
        }
        
        console.log(`[Parsing TipoSpesa DEBUG] Punteggi finali:`, scoresTipoSpesa);
        console.log(`[Parsing TipoSpesa] Tipo spesa estratto: ${tipoSpesa} (Punteggio: ${maxScoreTipoSpesa})`);


        // --- 4. ESTRAZIONE IMPORTO (logica precedente, adattata per nome variabile) ---
        const totalKeywordsStrong = ['TOTALE COMPLESSIVO', 'IMPORTO PAGATO'];
        const totalKeywordsMedium = ['TOTALE EURO', 'TOTALE EUR', 'TOTALE €'];
        const totalKeywordsGeneral = ['TOTALE', 'IMPORTO', 'EURO', 'EUR', 'TOT', 'NETTO'];

        const importoRegex = /(\\d{1,3}(?:[.,]\\d{3})*(?:\\s*[,.]\\s*\\d{2}))(?:\\s?(?:EUR|€))?$/; 
        const importoRegexSimple = /(\d+\s*[,.]\s*\d{2})/; 
        // const specificTotalPattern = /t\s+(\d+\s*[,.]\s*\d{2})\s+e/i; // VECCHIO
        const specificTotalPattern = /[^a-zA-Z0-9\n]*t\s*(\d+[\s,.]+\d{2})\s*e/i; // NUOVO: più robusto a caratteri iniziali e spaziature interne

        let potentialTotals = [];

        // Fase 1: Ricerca keyword forti e pattern specifico (es. "t XX,YY e")
        console.log("[Parsing Fase 1] Avvio ricerca prioritaria.");
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            // console.log(`[Parsing Fase 1 DEBUG] Processing line ${i}: \"${line}\" (Length: ${line.length})`); // Log di debug generale per ogni riga processata
            if (!line) continue;
            const upperLine = line.toUpperCase();

            // DEBUGGING MIRATO per il pattern specifico e la riga problematica
            if (line.includes("25, 80") || (line.toLowerCase().includes("t") && line.toLowerCase().includes("e"))) { 
                console.log(`[Parsing Fase 1 DEBUG] Linea ${i} sospetta: "${line}" (Lunghezza: ${line.length})`);
                // Log dei codici carattere per ispezione più approfondita
                let charCodes = '';
                for(let k=0; k < line.length; k++) {
                    charCodes += line.charCodeAt(k) + ' ';
                }
                console.log(`[Parsing Fase 1 DEBUG] Codici Carattere linea ${i}: ${charCodes.trim()}`);
                const specificMatchPatternDebug = line.match(specificTotalPattern); // Usa il NUOVO pattern
                console.log(`[Parsing Fase 1 DEBUG] Risultato match specificTotalPattern (NUOVO) per linea ${i}:`, specificMatchPatternDebug);
            }

            const specificMatchPattern = line.match(specificTotalPattern); // Usa il NUOVO pattern
            if (specificMatchPattern && specificMatchPattern[1]) {
                let val = specificMatchPattern[1];
                // Pulizia per trasformare formati come "25, 80" o "25 . 80" o "25  80" in "25.80"
                val = val.replace(/,/g, '.');      // Sostituisce tutte le virgole con punti
                val = val.replace(/\s/g, '');       // Rimuove tutti gli spazi bianchi
                val = val.replace(/\.{2,}/g, '.'); // Sostituisce due o più punti consecutivi con uno solo
                // Assicura che ci sia al massimo un punto decimale, prendendo l'ultimo come riferimento
                const lastDotIndex = val.lastIndexOf('.');
                if (lastDotIndex !== -1) {
                    const integerPart = val.substring(0, lastDotIndex).replace(/\./g, ''); // Rimuovi tutti i punti dalla parte intera
                    const decimalPart = val.substring(lastDotIndex + 1);
                    val = `${integerPart}.${decimalPart}`;
                }

                console.log(`[Parsing Fase 1a] Importo trovato con pattern "t XX,YY e": ${val} (originale catturato: "${specificMatchPattern[1]}") sulla riga: "${line}"`);
                potentialTotals.push({ value: val, lineIndex: i, strength: 10, source: "Pattern 't XX,YY e'" });
            }

            for (const keyword of totalKeywordsStrong) {
                if (upperLine.includes(keyword)) {
                    // Cerca nelle 2 righe sopra, sulla stessa riga, e nelle 2 righe sotto (rispetto alla keyword)
                    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
                        const targetLine = lines[j].trim();
                        let match = targetLine.match(importoRegex) || targetLine.match(importoRegexSimple);
                        if (match && match[1]) {
                            const val = match[1].replace(/\\s/g, '').replace(',', '.');
                            console.log(`[Parsing Fase 1b] Importo "${val}" trovato vicino a keyword forte "${keyword}" sulla riga (idx ${j}): "${targetLine}" (keyword a idx ${i})`);
                            potentialTotals.push({ value: val, lineIndex: j, strength: 9, keyword: keyword, source: "Keyword Forte + Regex" });
                        }
                        const specificNearbyMatch = targetLine.match(specificTotalPattern);
                         if (specificNearbyMatch && specificNearbyMatch[1]) {
                            const val = specificNearbyMatch[1].replace(/\\s/g, '').replace(',', '.');
                            console.log(`[Parsing Fase 1c] Importo (pattern "t XX,YY e") "${val}" trovato vicino a keyword forte "${keyword}" sulla riga (idx ${j}): "${targetLine}"`);
                            potentialTotals.push({ value: val, lineIndex: j, strength: 10, keyword: keyword, source: "Keyword Forte + Pattern 't XX,YY e'" });
                        }
                    }
                }
            }
        }

        if (potentialTotals.length > 0) {
            potentialTotals.sort((a, b) => {
                if (b.strength !== a.strength) return b.strength - a.strength; // Priorità a strength maggiore
                return b.lineIndex - a.lineIndex; // Poi alla riga più in basso (indice maggiore)
            });
            const bestCandidate = potentialTotals.find(p => parseFloat(p.value) > 0); // Prendi il primo valido
            if (bestCandidate) {
                importo = bestCandidate.value;
                console.log(`[Parsing Fase 1] Scelto importo: ${importo} (da riga ${bestCandidate.lineIndex}, strength ${bestCandidate.strength}, source: ${bestCandidate.source})`);
            }
        }

        // Fase 2: Fallback - Ricerca keyword medie e generali (se non trovato un importo forte)
        if (parseFloat(importo) === 0) {
            console.log("[Parsing Fase 2] Avvio ricerca con keyword medie e generali.");
            let generalPotentialTotals = [];
            const searchDepth = Math.min(lines.length, 20); // Aumentata un po' la profondità
            for (let i = lines.length - 1; i >= Math.max(0, lines.length - searchDepth); i--) {
                const line = lines[i].trim();
                if (!line) continue;
                const upperLine = line.toUpperCase();

                const allKeywords = [...totalKeywordsMedium, ...totalKeywordsGeneral];
                for (const keyword of allKeywords) {
                    if (upperLine.includes(keyword)) {
                        let match = line.match(importoRegex) || line.match(importoRegexSimple);
                        if (match && match[1]) {
                            const val = match[1].replace(/\\s/g, '').replace(',', '.');
                            console.log(`[Parsing Fase 2a] Importo "${val}" trovato con keyword "${keyword}" sulla riga: "${line}"`);
                            generalPotentialTotals.push({ value: val, lineIndex: i, keyword: keyword });
                        }
                        if (i + 1 < lines.length) {
                            const nextLine = lines[i+1].trim();
                            match = nextLine.match(importoRegex) || nextLine.match(importoRegexSimple);
                            if (match && match[1]) {
                                 const val = match[1].replace(/\\s/g, '').replace(',', '.');
                                 console.log(`[Parsing Fase 2b] Importo "${val}" trovato sulla riga successiva a keyword "${keyword}": "${nextLine}"`);
                                 generalPotentialTotals.push({ value: val, lineIndex: i + 1, keyword: keyword });
                            }
                        }
                    }
                }
            }
            if (generalPotentialTotals.length > 0) {
                generalPotentialTotals.sort((a,b) => b.lineIndex - a.lineIndex); 
                const chosen = generalPotentialTotals.find(pt => parseFloat(pt.value) > 0);
                if (chosen) {
                    importo = chosen.value;
                    console.log(`[Parsing Fase 2] Scelto importo: ${importo} (da riga ${chosen.lineIndex} con keyword ${chosen.keyword})`);
                }
            }
        }

        // Fase 3: Fallback estremo - euristica per importo isolato nelle ultime righe
        if (parseFloat(importo) === 0) {
            console.log("[Parsing Importo Fase 3] Avvio euristica per importo isolato.");
            const lastLinesSearchDepth = Math.min(lines.length, 7);
            for (let i = lines.length - 1; i >= Math.max(0, lines.length - lastLinesSearchDepth); i--) {
                const line = lines[i].trim();
                if (!line) continue;
                const match = line.match(importoRegexSimple); 
                if (match && match[1]) {
                    const textPart = line.replace(match[1], '').replace(/[^a-zA-Z]/g, ''); 
                    if (textPart.length < 5 || line.toUpperCase().includes("RESTO")) { // Considera anche "RESTO"
                        const val = match[1].replace(/\\s/g, '').replace(',', '.');
                        if (parseFloat(val) > 0) { 
                            importo = val;
                            console.log(`[Parsing Fase 3] Importo trovato (euristico): ${importo} dalla riga: "${line}"`);
                            break; 
                        }
                    }
                }
            }
        }
        
        // --- 5. ESTRAZIONE DATA (logica precedente, adattata per nome variabile) ---
        const dateRegex = /(\\d{2}[\\/.-]\\d{2}[\\/.-]\\d{2,4})/;
        for (const line of lines) {
            const match = line.match(dateRegex);
            if (match && match[1]) {
                // Semplice validazione per vedere se assomiglia a una data plausibile
                // Questo non valida se la data è reale (es. 30/02/2025)
                const parts = match[1].split(/[\\/.-]/);
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10);
                    // Year può essere a 2 o 4 cifre
                    if (day > 0 && day <= 31 && month > 0 && month <= 12) {
                        dataScontrino = match[1];
                        console.log(`[Parsing] Data trovata: ${dataScontrino} dalla riga: "${line}"`);
                        break;
                    }
                }
            }
        }


        // Log the combined description for debugging or other purposes if needed
        // console.log(`[Parsing] Descrizione combinata (per log): ${descrizione} (Importo: ${importo}, Data: ${dataScontrino})`);

        const scontrinoData = {
            tipoDocumento: tipoDocumento, // Es. "Scontrino Fiscale"
            data: dataScontrino,
            importo: importo,
            categoria: categoriaContabile, // Es. "Uscite"
            tipoSpesa: tipoSpesa,          // Es. "Spese Casa", "Carburante"
            descrizione: nomeNegozio       // Es. "ALDI", "LIDL"
        };
        console.log("[Parsing] Dati estratti finali:", scontrinoData);
        return scontrinoData;
    }

    // Funzione per aggiungere una riga alla tabella dei risultati
    function addRowToTable(data) {
        const tableBody = document.getElementById('recordedDataBody');
         if (!tableBody) {
            console.error("[UI Update] Elemento tableBody 'recordedDataBody' non trovato.");
            return;
         }
         const newRow = tableBody.insertRow();

         // Ensure data fields exist, providing fallbacks if necessary
         const dataScontrino = data.data || 'N/A';
         const categoriaContabile = data.categoria || 'N/A';
         const tipoSpesa = data.tipoSpesa || 'N/A';
         const importo = data.importo || '0.00';
         const nomeNegozio = data.descrizione || 'N/A';

         // Order of columns in the HTML table: Data, Categoria, Tipo, Importo (€), Descrizione, Elimina
         const cellsData = [
             dataScontrino,
             categoriaContabile,
             tipoSpesa,
             importo,
             nomeNegozio
         ];

         cellsData.forEach(text => {
             const cell = newRow.insertCell();
             cell.textContent = text;
         });

         // Bottone Elimina
         const deleteCell = newRow.insertCell();
         const deleteButton = document.createElement('button');
         deleteButton.textContent = 'Elimina';
         deleteButton.className = 'button is-danger is-small';
         deleteButton.onclick = function() {
            // Rimuovi la riga dalla tabella
            const row = this.parentNode.parentNode;
            row.parentNode.removeChild(row);
            
            // Opzionale: Rimuovi i dati dall'array currentData se lo stai usando per popolare la tabella
            // Trova l'indice dell'oggetto dati corrispondente e rimuovilo
            // Questo presuppone che tu abbia un modo per identificare univocamente i dati della riga
            // o che l'ordine in currentData corrisponda all'ordine nella tabella.
            // Esempio:
            // const rowIndex = Array.from(tableBody.rows).indexOf(row);
            // if (rowIndex > -1 && currentDataArray[rowIndex]) { // Assumendo che currentData sia un array
            //     currentDataArray.splice(rowIndex, 1);
            //     console.log('[UI Update] Dati rimossi da currentDataArray.');
            // }
            // Aggiorna la visualizzazione dei dati grezzi e parsati se necessario
            // rawTextDiv.textContent = '';
            // parsedDataDiv.innerHTML = ''; // o un messaggio di default
            console.log('[UI Update] Riga eliminata dalla tabella.');
        };
        deleteCell.appendChild(deleteButton);        console.log('[UI Update] Nuova riga aggiunta alla tabella per i dati del scontrino.');
        // Aggiorna il display "Dati Estratti" se esistente (invece di chiamare una funzione separata)
        if (parsedDataDiv) {
            parsedDataDiv.innerHTML = formatScontrinoDataForDisplay(data);
        }
    }
    
    // Formatta i dati dello scontrino per la visualizzazione nel pannello "Dati Estratti"
    function formatScontrinoDataForDisplay(data) {
        if (!data) return '<p>Nessun dato estratto</p>';
          return `
            <div class="parsed-data-container">
                <div class="parsed-data-row"><strong>Tipo Documento:</strong> ${data.tipoDocumento || 'N/D'}</div>
                <div class="parsed-data-row"><strong>Data:</strong> ${data.data || 'N/D'}</div>
                <div class="parsed-data-row"><strong>Importo:</strong> ${data.importo || '0.00'} €</div>
                <div class="parsed-data-row"><strong>Categoria:</strong> ${data.categoria || 'N/D'}</div>
                <div class="parsed-data-row"><strong>Tipo Spesa:</strong> ${data.tipoSpesa || 'N/D'}</div>
                <div class="parsed-data-row"><strong>Descrizione:</strong> ${data.descrizione || 'N/D'}</div>
            </div>
        `;
    }
    
    // Funzioni di supporto mancanti
    function sanitizeStoreName(name) {
        // Rimuove caratteri speciali e spazi in eccesso
        if (!name) return "N/D";
        return name.trim().replace(/[^\w\sàèìòùÀÈÌÒÙ]/g, ' ').replace(/\s+/g, ' ');
    }

    // Event handler per il pulsante di caricamento
    caricaScontrinoBtn.addEventListener('click', () => {
        scontrinoInput.click();
    });

    // Event handler per l'input del file
    scontrinoInput.addEventListener('change', async (e) => {
        if (e.target.files.length === 0) {
            console.log('[Input] Nessun file selezionato.');
            return;
        }

        const file = e.target.files[0];        if (!file.type.match('image.*')) {
            statusDiv.textContent = 'Per favore, seleziona un\'immagine valida.';
            console.error('[Input] File non valido: ', file.type);
            return;
        }

        // Aggiorna lo stato
        statusDiv.textContent = 'Elaborazione in corso...';
        rawTextDiv.textContent = 'Riconoscimento testo in corso...';
        parsedDataDiv.innerHTML = '<p>In attesa dei risultati...</p>';
        
        try {
            // Inizializza Tesseract.js con percorsi espliciti per i file locali.
            // È fondamentale che tutti i file di Tesseract.js (tesseract.min.js, worker.min.js, 
            // tesseract-core.wasm.js e ita.traineddata) provengano dalla STESSA versione.
            const worker = await Tesseract.createWorker({
                logger: m => console.log('[Tesseract]', m)
            });

            // Carica il modello italiano
            await worker.loadLanguage('ita');
            // await worker.initialize('ita'); // Rimosso: `recognize` dovrebbe inizializzare se necessario.

            // Imposta i parametri di tesseract per ottenere risultati migliori
            await worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:€$£°+-=()[]{}/\\\'\" ÀÈÌÒÙàèìòù',
                preserve_interword_spaces: '1',
                user_defined_dpi: '300',
                tessedit_pageseg_mode: '4', // PSM_SINGLE_BLOCK (per scontrini)
            });

            console.log('[OCR] Avvio riconoscimento testo...');
            statusDiv.textContent = 'Riconoscimento testo in corso...';

            // Esegui OCR
            // Rimuovi il logger da qui se lo hai messo in createWorker
            const result = await worker.recognize(file, 'ita' /*, { logger: globalTesseractLogger } */);
            console.log('[OCR] Riconoscimento completato con confidenza:', result.data.confidence);
            
            // Visualizza il testo riconosciuto
            rawTextDiv.textContent = result.data.text;
            statusDiv.textContent = 'Elaborazione completata!';
            
            // Estrai e visualizza i dati
            const parsedData = parseScontrinoText(result.data.text);
            
            // Aggiungi alla tabella
            addRowToTable(parsedData);
            
            // Rilascia il worker per liberare memoria
            await worker.terminate();
            
            console.log('[OCR] Elaborazione completata con successo.');
            
        } catch (error) {
            console.error('[OCR] Errore durante l\'elaborazione:', error);
            statusDiv.textContent = 'Errore durante l\'elaborazione: ' + error.message;
            rawTextDiv.textContent = 'Si è verificato un errore.';
            parsedDataDiv.innerHTML = '<p>Errore durante l\'estrazione dei dati.</p>';
        }
    });

    // Event listener per il bottone di pulizia della lista (se esiste)
    const clearListButton = document.getElementById('clearListButton');
    if (clearListButton) {
        clearListButton.addEventListener('click', () => {
            const tableBody = document.getElementById('recordedDataBody');
            if (tableBody) {
                tableBody.innerHTML = '';
                console.log('[UI Update] Tabella dati pulita.');
            }
            
            // Resetta anche i div di visualizzazione
            if (rawTextDiv) rawTextDiv.textContent = '...';
            if (parsedDataDiv) parsedDataDiv.innerHTML = '...';
            if (statusDiv) statusDiv.textContent = 'Pronto per iniziare...';
        });
    }
});