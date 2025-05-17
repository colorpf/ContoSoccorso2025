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

        // --- LOGICA IMPORTO MIGLIORATA (parole chiave + cerca nelle 5 righe successive + fallback su tutte le righe non escluse) ---
        let amounts = [];
        const parseValueToFloat = (valStr) => {
            if (!valStr) return 0;
            const normalized = valStr.replace(/\\.(?=\\d{3}(?:,|$))/g, '').replace(',', '.');
            return parseFloat(normalized) || 0;
        };
        const lines = text.split('\n'); // THIS WILL BE CORRECTED
        
        // Configurazione delle parole chiave con priorità (0 è la più alta)
        const totalKeywordsConfig = [
            { regex: /TOTALE\\s+COMPLESSIVO/i, priority: 0 },
            { regex: /TOTALE\\s+EURO/i, priority: 0 },
            { regex: /TOTALE\\s+EUR/i, priority: 0 },
            { regex: /TOTALE\\s+SCONTRINO/i, priority: 0 },
            { regex: /TOTALE\\s+DA\\s+PAGARE/i, priority: 0 },
            { regex: /NETTO\\s+A\\s+PAGARE/i, priority: 0 },
            { regex: /TOTALE\\s+FATTURA/i, priority: 0 },

            { regex: /PAGAMENTO\\s+ELETTRONICO/i, priority: 1 },
            { regex: /IMPORTO\\s+PAGATO/i, priority: 1 }, // Potrebbe essere il totale o l'importo transato
            { regex: /IMPORTO\\s+DA\\s+PAGARE/i, priority: 1 },

            { regex: /TOTALE/i, priority: 2 }, // "TOTALE" generico

            // Queste sono più rischiose e potrebbero non essere il totale finale
            { regex: /PAGAMENTO\\s+CONTANTE/i, priority: 3 }, // Spesso l'importo dato dal cliente
            { regex: /IMPORTO/i, priority: 3 }, // Molto generico
            { regex: /PAGATO/i, priority: 3 }  // Molto generico
        ];

        const amountRegex = /(\\d{1,3}(?:[.,]\\d{3})*[.,]\\s?\\d{1,2})/g;
        const excludeKeywords = /IVA|ALIQUOTA|IMPOSTA|TAX|SCONTO|RESTO|CREDITO|SUBTOTALE|RIEPILOGO\\s+ALIQUOTE|BUONO|TRONCARE|NON\\s+RISCOSSO|NON\\s+PAGATO|CODICE|ARTICOLO|TEL\\.|P\\.IVA|C\\.F\\.|SCONTRINO\\s+N\\.|DOC\\.|OPERAZIONE\\s+N\\./i; // THIS WILL BE UPDATED

        // Tenta di estrarre descrizione dal logo (prime 3 righe, solo maiuscole e spazi)
        {
            const logoPattern = /^[A-ZÀ-Ÿ\d'&-]{2,}(?:\s+[A-ZÀ-Ÿ\d'&-]{2,})+$/;
            for (let i = 0; i < Math.min(lines.length, 3); i++) {
                const l = lines[i].trim();
                if (logoPattern.test(l)) {
                    newItem.descrizione = l;
                    break;
                }
            }
        }

        // Cerca con priorità definite in totalKeywordsConfig e nelle 5 righe successive
        outer: for (let i = 0; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (!trimmedLine) continue;

            for (const kwConfig of totalKeywordsConfig) {
                if (kwConfig.regex.test(trimmedLine)) {
                    let foundAmountForThisKeywordIteration = false;

                    // 1. Controlla gli importi sulla riga stessa della parola chiave
                    let amountsOnKwLine = [];
                    if (!excludeKeywords.test(trimmedLine)) {
                        amountRegex.lastIndex = 0;
                        let match;
                        while ((match = amountRegex.exec(trimmedLine)) !== null) {
                            amountsOnKwLine.push(match[1]);
                        }

                        if (amountsOnKwLine.length > 0) {
                            amountsOnKwLine.sort((a, b) => parseValueToFloat(b) - parseValueToFloat(a));
                            amounts.push({ value: amountsOnKwLine[0], priority: kwConfig.priority, lineContext: trimmedLine });
                            foundAmountForThisKeywordIteration = true;
                        }
                    } else {
                        console.log(`La riga della parola chiave "${trimmedLine}" contiene una excludeKeyword. Gli importi su questa riga sono ignorati per la parola chiave ${kwConfig.regex}.`);
                    }

                    // 2. Se non abbiamo trovato un importo sulla stessa riga, controlla nelle 5 righe successive
                    if (!foundAmountForThisKeywordIteration) {
                        for (let j = 1; j <= 5 && i + j < lines.length; j++) {
                            const nextLine = lines[i + j].trim();
                            if (!nextLine) continue;

                            if (!excludeKeywords.test(nextLine)) {
                                amountRegex.lastIndex = 0;
                                let match;
                                while ((match = amountRegex.exec(nextLine)) !== null) {
                                    amounts.push({ value: match[1], priority: kwConfig.priority, lineContext: nextLine });
                                }
                            } else {
                                console.log(`La riga "${nextLine}" contiene una excludeKeyword. Gli importi su questa riga sono ignorati.`);
                            }
                        }
                    }

                    // 3. Se ancora non abbiamo trovato un importo, possiamo fare un fallback su tutte le righe non escluse
                    if (amounts.length === 0) {
                        for (let j = 0; j < lines.length; j++) {
                            const anyLine = lines[j].trim();
                            if (!anyLine) continue;

                            if (!excludeKeywords.test(anyLine)) {
                                amountRegex.lastIndex = 0;
                                let match;
                                while ((match = amountRegex.exec(anyLine)) !== null) {
                                    amounts.push({ value: match[1], priority: kwConfig.priority, lineContext: anyLine });
                                }
                            }
                        }
                    }

                    // Ordina gli importi trovati per priorità e valore
                    amounts.sort((a, b) => {
                        if (a.priority !== b.priority) {
                            return a.priority - b.priority;
                        }
                        return parseValueToFloat(b.value) - parseValueToFloat(a.value);
                    });

                    // Prendi il miglior importo trovato
                    if (amounts.length > 0) {
                        newItem.importo = amounts[0].value;
                        console.log(`Importo trovato: ${newItem.importo} (linea: "${amounts[0].lineContext}")`);
                    } else {
                        console.log("Nessun importo trovato dopo la ricerca nelle righe successive.");
                    }

                    // Una volta trovata un'importo valido, possiamo fermarci
                    break outer;
                }
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