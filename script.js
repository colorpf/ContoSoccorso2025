document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const statusDiv = document.getElementById('status');
    const rawTextDiv = document.getElementById('rawText');
    const parsedDataDiv = document.getElementById('parsedData');
    const recordedDataTableBody = document.getElementById('recordedDataBody');
    const clearListButton = document.getElementById('clearListButton');
    // const driveButton = document.getElementById('driveButton'); // Assicurati che esista se lo usi

    // Nuovi elementi per caricamento scontrino
    const caricaScontrinoBtn = document.getElementById('caricaScontrinoBtn');
    const scontrinoInput = document.getElementById('scontrinoInput');

    // Setup scontrinoInput for image capture (camera and file)
    if (scontrinoInput) {
        scontrinoInput.accept = 'image/*'; // Ripristinato: specifica che vogliamo file immagine
        // scontrinoInput.capture = 'environment'; // Mantenuto commentato: non forzare la fotocamera
                                                // On desktop, or if no camera, it will still open a file picker.
    }

    const currentYear = new Date().getFullYear();
    const storageKey = `recordedData_${currentYear}`;
    let currentData = loadData(); // Carica i dati esistenti
    
    currentData.forEach(item => addRowToTable(item)); // Popola la tabella con i dati caricati

    // Funzione per caricare i dati da localStorage
    function loadData() {
        const data = localStorage.getItem(storageKey);
        return data ? JSON.parse(data) : [];
    }

    // Funzione per salvare i dati
    function saveData(dataArray) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(dataArray));
            console.log(`Dati salvati per l'anno ${currentYear} in ${storageKey}`);
        } catch (e) {
            console.error("Errore nel salvataggio dei dati:", e);
            statusDiv.textContent = "Errore: Impossibile salvare i dati. Spazio esaurito?";
        }
    }

    // Gestione caricamento scontrino
    if (caricaScontrinoBtn && scontrinoInput) {
        caricaScontrinoBtn.addEventListener('click', () => {
            scontrinoInput.click(); 
        });

        scontrinoInput.addEventListener('change', async (event) => { // Aggiunto async
            const file = event.target.files[0];
            if (file) {
                statusDiv.textContent = `File selezionato: ${file.name}. Elaborazione OCR in corso...`;
                rawTextDiv.textContent = `File: ${file.name}`;
                parsedDataDiv.textContent = "Attendere prego...";
                
                await processImageWithTesseract(file); 
                
                console.log("File selezionato per OCR:", file);
            }
            scontrinoInput.value = ''; 
        });
    }

    async function processImageWithTesseract(imageFile) {
        if (!window.Tesseract) { // Controlla window.Tesseract
            statusDiv.textContent = "Errore: Tesseract.js non è caricato.";
            console.error("Tesseract.js non è disponibile.");
            return;
        }

        statusDiv.textContent = 'Avvio OCR... (potrebbe richiedere un po\' di tempo)';
        parsedDataDiv.textContent = 'Elaborazione immagine...';

        try {
            const worker = await Tesseract.createWorker('ita', 1, {
                langPath: './tessdata', // <--- MODIFICA QUI: Aggiungi questa riga
                logger: m => {
                    console.log(m);
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        statusDiv.textContent = `Riconoscimento testo: ${progress}%`;
                        parsedDataDiv.textContent = `Progresso OCR: ${progress}%`;
                    } else if (m.status === 'loading language model') {
                        statusDiv.textContent = 'Caricamento modello lingua italiana...';
                    } else {
                        statusDiv.textContent = `Stato OCR: ${m.status}`;
                    }
                }
            });

            const { data: { text } } = await worker.recognize(imageFile);
            await worker.terminate();

            rawTextDiv.textContent = `Testo estratto dallo scontrino:\n---------------------------\n${text}`;
            statusDiv.textContent = 'Testo estratto! Prova di interpretazione...';
            
            const scontrinoData = parseScontrinoText(text);
            // parsedDataDiv.textContent = JSON.stringify(scontrinoData, null, 2); // Vecchia visualizzazione JSON
            if (scontrinoData) {
                const displayItems = [
                    `Tipo: ${scontrinoData.type}`,
                    `Data: ${scontrinoData.data}`,
                    `Importo: ${scontrinoData.importo}`,
                    `Categoria: ${scontrinoData.categoria}`,
                    `Descrizione: ${scontrinoData.descrizione}`
                ];
                parsedDataDiv.textContent = displayItems.join('\n');
            } else {
                parsedDataDiv.textContent = "Impossibile estrarre dati strutturati dallo scontrino.";
            }

            if (scontrinoData && scontrinoData.type !== "Non definito" && scontrinoData.importo !== "0.00") {
                currentData.push(scontrinoData);
                saveData(currentData);
                addRowToTable(scontrinoData); 
                // Se hai una funzione per inviare al foglio, chiamala qui
                // Esempio: inviaDatiAlFoglio(scontrinoData); 
                statusDiv.textContent = 'Dati dallo scontrino aggiunti e pronti per invio/salvati.';
            } else {
                statusDiv.textContent = 'Testo estratto, ma non sono stati riconosciuti dati validi per la registrazione automatica.';
            }

        } catch (error) {
            console.error("Errore durante l'OCR con Tesseract.js:", error);
            statusDiv.textContent = "Errore durante l'OCR: " + error.message;
            parsedDataDiv.textContent = "Errore OCR.";
        }
    }

    function parseScontrinoText(text) {
        console.log("Testo da analizzare (scontrino):\n", text);
        let newItem = {
            type: "Non definito",
            data: new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            importo: "0.00",
            categoria: "Scontrino",
            descrizione: "Scontrino"
        };

        let potentialAmounts = [];
        const parseValueToFloat = (valStr) => {
            if (!valStr) return 0;
            let cleanedValStr = valStr.replace(/\s/g, '');
            cleanedValStr = cleanedValStr.replace(/\.(?=\d{3}(?:,|$))/g, '');
            const normalized = cleanedValStr.replace(',', '.');
            return parseFloat(normalized) || 0;
        };

        const lines = text.split('\n');
        
        const totalKeywordsConfig = [
            { regex: /TOTALE\\s+COMPLESSIVO/i, priority: 0 },
            { regex: /TOTALE\\s+EURO/i, priority: 0 },
            { regex: /TOTALE\\s+EUR/i, priority: 0 },
            { regex: /TOTALE\\s+SCONTRINO/i, priority: 0 },
            { regex: /TOTALE\\s+DA\\s+PAGARE/i, priority: 0 },
            { regex: /NETTO\\s+A\\s+PAGARE/i, priority: 0 },
            { regex: /TOTALE\\s+FATTURA/i, priority: 0 },

            { regex: /IMPORTO\\s+DA\\s+PAGARE/i, priority: 1 },   // Mantenuto - "da pagare" è utile

            { regex: /TOTALE/i, priority: 2 },

            // { regex: /PAGAMENTO\\s+CONTANTE/i, priority: 3 },    // Rimosso come richiesto
            { regex: /IMPORTO/i, priority: 3 },                 // Mantenuto - 'IMPORTO' generico con priorità bassa
            // { regex: /PAGATO/i, priority: 3 }                   // Rimosso come richiesto
        ];

        const amountRegex = /(\\d{1,3}(?:[.,]\\d{3})*[.,]\\s?\\d{1,2})/g;
        const excludeKeywords = /IVA|ALIQUOTA|IMPOSTA|TAX|SCONTO|RESTO|RESTN|CREDITO|SUBTOTALE|RIEPILOGO\\s+ALIQUOTE|BUONO|TRONCARE|NON\\s+RISCOSSO|NON\\s+PAGATO|CODICE|ARTICOLO|TEL\\.|P\\.IVA|C\\.F\\.|SCONTRINO\\s+N\\.|DOC\\.|OPERAZIONE\\s+N\\./i;

        // Estrazione descrizione
        {
            console.log("[Descrizione] Inizio estrazione descrizione.");
            const merchantNameCandidatePattern = /[A-ZÀ-Ÿ\\d.'&-]{2,}(\\s+[A-ZÀ-Ÿ\\d.'&-]{2,})+/ig; // Non ancorato, globale
            const searchLinesForMerchant = Math.min(lines.length, 10); // Aumentato a 10 righe
            let merchantFound = false;

            for (let i = 0; i < searchLinesForMerchant; i++) {
                const lineToSearch = lines[i].trim();
                if (!lineToSearch) continue;

                merchantNameCandidatePattern.lastIndex = 0; // Reset per regex globale
                let match;
                let bestMatchInLine = "";

                while ((match = merchantNameCandidatePattern.exec(lineToSearch)) !== null) {
                    const currentMatchText = match[0];
                    // Preferisci corrispondenze più lunghe, evita quelle puramente numeriche o troppo corte
                    if (currentMatchText.length > bestMatchInLine.length && 
                        currentMatchText.length >= 5 && 
                        !/^\\d[\\d\\s.,]*$/.test(currentMatchText) &&
                        !/P\\.IVA|C\\.F\\.|VIA|CAP|TEL/i.test(currentMatchText)) { // Evita termini comuni di indirizzi/contatti
                        bestMatchInLine = currentMatchText;
                    }
                }

                if (bestMatchInLine) {
                    newItem.descrizione = bestMatchInLine;
                    // Logica di pulizia per prefissi OCR errati (es. "ae NOME")
                    const parts = newItem.descrizione.split(/\\s+/); // Corretto: /\s+/ invece di /\\s+/
                    if (parts.length > 1 &&
                        parts[0].length <= 2 &&
                        parts[0].match(/^[a-zà-ÿ]+$/) && // prima parola tutta minuscola
                        parts[1].match(/^[A-ZÀ-Ÿ0-9]/)) { // seconda parola inizia con maiuscola/numero
                        newItem.descrizione = parts.slice(1).join(" ");
                        console.log(`[Descrizione] Nome pulito: "${newItem.descrizione}"`);
                    }
                    console.log(`[Descrizione] Trovato nome: "${newItem.descrizione}" sulla riga ${i}: "${lineToSearch}"`);
                    merchantFound = true;
                    break; 
                }
            }
            if (!merchantFound) {
                console.log(`[Descrizione] Nessun nome valido trovato nelle prime ${searchLinesForMerchant} righe. Default: "${newItem.descrizione}"`);
            }
        }

        // 1. Raccolta importi guidata da parole chiave
        for (let i = 0; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (!trimmedLine) continue;

            for (const kwConfig of totalKeywordsConfig) {
                if (kwConfig.regex.test(trimmedLine)) {
                    // Parola chiave trovata sulla riga corrente (trimmedLine)
                    if (!excludeKeywords.test(trimmedLine)) {
                        amountRegex.lastIndex = 0;
                        let match;
                        while ((match = amountRegex.exec(trimmedLine)) !== null) {
                            potentialAmounts.push({
                                value: match[1],
                                priority: kwConfig.priority,
                                lineContext: trimmedLine,
                                debugSource: `Keyword sulla stessa riga: ${kwConfig.regex.toString()} (prio ${kwConfig.priority})`
                            });
                        }
                    } else {
                        console.log(`Riga "${trimmedLine}" contiene keyword ${kwConfig.regex.toString()} ma anche una excludeKeyword. Importi ignorati da questa riga per questa keyword.`);
                    }

                    // Cerca importi nelle 5 righe successive, con logica di priorità affinata
                    for (let j = 1; j <= 5 && (i + j) < lines.length; j++) {
                        const nextLine = lines[i + j].trim();
                        if (!nextLine) continue;

                        if (!excludeKeywords.test(nextLine)) {
                            amountRegex.lastIndex = 0;
                            let matchAmount;
                            while ((matchAmount = amountRegex.exec(nextLine)) !== null) {
                                let amountInNextLine = matchAmount[1];
                                // Default: eredita priorità dalla keyword che ha attivato la ricerca
                                let assignedPriority = kwConfig.priority; 
                                let sourceInfo = `Importo su riga ${i+j} (vicino a keyword '${kwConfig.regex.toString()}' su riga ${i}, eredita prio ${assignedPriority})`;
                                
                                // Controlla se 'nextLine' stessa contiene una keyword da totalKeywordsConfig
                                for (const nextKwConfig of totalKeywordsConfig) {
                                    if (nextKwConfig.regex.test(nextLine)) {
                                        // Se nextLine ha una sua keyword, usa la priorità di *quella* keyword.
                                        assignedPriority = nextKwConfig.priority; 
                                        sourceInfo = `Importo su riga ${i+j} (match diretto con keyword '${nextKwConfig.regex.toString()}' prio ${assignedPriority})`;
                                        break; 
                                    }
                                }
                                
                                potentialAmounts.push({
                                    value: amountInNextLine,
                                    priority: assignedPriority, // Usa la priorità determinata
                                    lineContext: nextLine,
                                    debugSource: sourceInfo
                                });
                            }
                        } else {
                             console.log(`Riga successiva "${nextLine}" (per keyword ${kwConfig.regex.toString()}) è esclusa.`);
                        }
                    }
                }
            }
        }

        // 2. Raccolta importi di fallback globale (priorità bassa)
        const FALLBACK_PRIORITY = 10;
        for (let i = 0; i < lines.length; i++) {
            const lineContent = lines[i].trim();
            if (!lineContent) continue;

            // Evita di aggiungere come fallback importi già considerati dalle keyword (se la riga contiene una keyword)
            let lineContainsTotalKeyword = false;
            for (const kwConfig of totalKeywordsConfig) {
                if (kwConfig.regex.test(lineContent)) {
                    lineContainsTotalKeyword = true;
                    break;
                }
            }
            if (lineContainsTotalKeyword) continue; // Salta se la riga è già stata processata (o lo sarà) dalle keyword principali

            if (!excludeKeywords.test(lineContent)) {
                amountRegex.lastIndex = 0;
                let match;
                while ((match = amountRegex.exec(lineContent)) !== null) {
                    potentialAmounts.push({
                        value: match[1],
                        priority: FALLBACK_PRIORITY,
                        lineContext: lineContent,
                        debugSource: 'Fallback globale'
                    });
                }
            }
        }
        
        // Rimuovi duplicati (stesso valore, priorità, contesto) prima dell'ordinamento
        potentialAmounts = potentialAmounts.filter((amount, index, self) =>
            index === self.findIndex((t) => (
                t.value === amount.value && 
                t.priority === amount.priority && 
                t.lineContext === amount.lineContext
            ))
        );

        // 3. Ordinamento e selezione finale
        console.log("Importi potenziali PRIMA dell'ordinamento (dopo deduplica):", JSON.stringify(potentialAmounts, null, 2));

        if (potentialAmounts.length > 0) {
            potentialAmounts.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                return parseValueToFloat(b.value) - parseValueToFloat(a.value);
            });

            console.log("Importi potenziali DOPO l'ordinamento:", JSON.stringify(potentialAmounts, null, 2));
            newItem.importo = potentialAmounts[0].value;
            console.log(`Importo finale selezionato: ${newItem.importo} (Priorità: ${potentialAmounts[0].priority}, Valore: ${parseValueToFloat(potentialAmounts[0].value)}, Contesto: "${potentialAmounts[0].lineContext}", Sorgente: ${potentialAmounts[0].debugSource})`);
        } else {
            console.log("Nessun importo valido trovato dopo tutti i passaggi.");
        }

        // bottom-lines fallback se nessun importo guidato
        if (potentialAmounts.length === 0) {
            console.log("Guided extraction failed; using bottom-lines fallback.");
            const bottomCount = Math.min(10, lines.length);
            const bottomLines = lines.slice(-bottomCount);
            let bottomAmounts = [];
            for (const bottomLine of bottomLines) {
                const trimmedLine = bottomLine.trim();
                if (!trimmedLine || excludeKeywords.test(trimmedLine)) continue;
                amountRegex.lastIndex = 0;
                let m;
                while ((m = amountRegex.exec(trimmedLine)) !== null) {
                    bottomAmounts.push(m[1]);
                }
            }
            if (bottomAmounts.length > 0) {
                const maxAmount = bottomAmounts.reduce((max, curr) =>
                    parseValueToFloat(curr) > parseValueToFloat(max) ? curr : max
                );
                newItem.importo = maxAmount;
                console.log(`Bottom-lines fallback selected: ${newItem.importo}`);
                return newItem;
            }
        }

        return newItem;
    }

    function addRowToTable(dataItem) {
        const row = document.createElement('tr');

        const tipoCell = document.createElement('td');
        tipoCell.textContent = dataItem.type;
        row.appendChild(tipoCell);

        const dataCell = document.createElement('td');
        dataCell.textContent = dataItem.data;
        row.appendChild(dataCell);

        const importoCell = document.createElement('td');
        importoCell.textContent = dataItem.importo;
        row.appendChild(importoCell);

        const categoriaCell = document.createElement('td');
        categoriaCell.textContent = dataItem.categoria;
        row.appendChild(categoriaCell);

        const descrizioneCell = document.createElement('td');
        descrizioneCell.textContent = dataItem.descrizione;
        row.appendChild(descrizioneCell);

        recordedDataTableBody.appendChild(row);
    }

    clearListButton.addEventListener('click', () => {
        if (confirm('Sei sicuro di voler cancellare tutti i dati registrati?')) {
            localStorage.removeItem(storageKey);
            recordedDataTableBody.innerHTML = '';
            currentData = [];
            statusDiv.textContent = 'Tutti i dati sono stati rimossi.';
        }
    });
});