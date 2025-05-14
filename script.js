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
            const normalized = valStr.replace(/\.(?=\d{3}(?:,|$))/g, '').replace(',', '.');
            return parseFloat(normalized) || 0;
        };
        const lines = text.split('\n');
        const totalKeywords = [
            /TOTALE\s+COMPLESSIVO/i,
            /TOTALE\s+EURO/i,
            /TOTALE\s+EUR/i,
            /TOTALE\s+SCONTRINO/i,
            /TOTALE\s+DA\s+PAGARE/i,
            /TOTALE\s+FATTURA/i,
            /TOTALE/i,
            /IMPORTO\s+PAGATO/i,
            /NETTO\s+A\s+PAGARE/i,
            /PAGAMENTO\s+CONTANTE/i,
            /PAGAMENTO\s+ELETTRONICO/i,
            /IMPORTO\s+DA\s+PAGARE/i,
            /IMPORTO/i,
            /PAGATO/i
        ];
        // Modifica: accetta anche importi con spazio dopo la virgola o il punto (es. 25, 80)
        const amountRegex = /(\d{1,3}(?:[.,]\d{3})*[.,]\s?\d{2})\b/g;
        const excludeKeywords = /IVA|ALIQUOTA|IMPOSTA|TAX|SCONTO|RESTO|CREDITO|SUBTOTALE|RIEPILOGO\s+ALIQUOTE|BUONO|TRONCARE|NON\s+RISCOSSO|NON\s+PAGATO|CODICE|ARTICOLO|TEL\.|P\.IVA|C\.F\.|SCONTRINO\s+N\.|DOC\.|OPERAZIONE\s+N\./i;

        // Cerca con priorità 1 (parole chiave forti) e nelle 5 righe successive
        for (let i = 0; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (!trimmedLine) continue;
            let match;
            let foundKeyword = false;
            for (const kw of totalKeywords) {
                if (kw.test(trimmedLine)) {
                    foundKeyword = true;
                    let lastAmount = null;
                    let allAmounts = [];
                    while ((match = amountRegex.exec(trimmedLine)) !== null) {
                        allAmounts.push(match[1]);
                    }
                    if (allAmounts.length > 0) {
                        lastAmount = allAmounts[allAmounts.length - 1];
                        amounts.push({ value: lastAmount, priority: 1, lineContext: trimmedLine });
                    } else {
                        // Cerca la prima riga successiva (anche se è solo un numero) che contiene almeno un importo (fino a 5 righe dopo)
                        for (let j = 1; j <= 5 && (i + j) < lines.length; j++) {
                            const nextLine = lines[i + j].trim();
                            if (!nextLine) continue;
                            let nextMatch;
                            let nextAmounts = [];
                            while ((nextMatch = amountRegex.exec(nextLine)) !== null) {
                                nextAmounts.push(nextMatch[1]);
                            }
                            if (nextAmounts.length > 0) {
                                amounts.push({ value: nextAmounts[nextAmounts.length - 1], priority: 1, lineContext: nextLine });
                                break;
                            }
                        }
                    }
                    break;
                }
            }
        }
        // Se non hai trovato nulla con priorità 1, cerca fallback su tutte le righe non escluse
        if (amounts.length === 0) {
            let fallbackCandidates = [];
            for (const l of lines) {
                const trimmed = l.trim();
                if (!trimmed || excludeKeywords.test(trimmed)) continue;
                let match;
                let allAmounts = [];
                while ((match = amountRegex.exec(trimmed)) !== null) {
                    allAmounts.push(match[1]);
                }
                if (allAmounts.length > 0) {
                    fallbackCandidates.push(...allAmounts);
                }
            }
            if (fallbackCandidates.length > 0) {
                console.log('Importi trovati su tutte le righe non escluse:', fallbackCandidates);
                fallbackCandidates.sort((a, b) => parseValueToFloat(b) - parseValueToFloat(a));
                amounts.push({ value: fallbackCandidates[0], priority: 2, lineContext: 'fallback tutte le righe' });
            } else {
                console.log('Nessun importo trovato su tutte le righe utili.');
            }
        }
        // Logga tutte le righe che contengono almeno una cifra
        const numericLines = lines.filter(l => /\d/.test(l));
        console.log('Righe con numeri trovate nell\'OCR:', numericLines);

        if (amounts.length > 0) {
            const bestPriority = Math.min(...amounts.map(a => a.priority));
            const candidates = amounts.filter(a => a.priority === bestPriority);
            candidates.sort((a, b) => parseValueToFloat(b.value) - parseValueToFloat(a.value));
            let bestAmountStr = candidates[0].value;
            // Log più chiari per i candidati importo
            console.log('Candidati importo (tutti):', amounts);
            console.log('Candidati importo (priorità migliore):', candidates);
            console.log('Importo selezionato:', bestAmountStr, 'dalla riga:', candidates[0].lineContext);
            newItem.importo = bestAmountStr.replace(/\.(?=\d{3}(?:,|$))/g, '').replace(',', '.');
            newItem.type = "Spesa";
        }
        // --- FINE LOGICA IMPORTO ---

        // --- LOGICA DESCRIZIONE MIGLIORATA ---
        let specificStoreFound = false;
        if (text.match(/LIDL/i)) {
            newItem.categoria = "Spesa Alimentare";
            newItem.descrizione = "LIDL";
            specificStoreFound = true;
        } else if (text.match(/CONAD/i)) {
            newItem.categoria = "Spesa Alimentare";
            newItem.descrizione = "CONAD";
            specificStoreFound = true;
        } else if (text.match(/ESSELUNGA/i)) {
            newItem.categoria = "Spesa Alimentare";
            newItem.descrizione = "ESSELUNGA";
            specificStoreFound = true;
        } else if (text.match(/\bBRICO\b/i) && !text.match(/BRICOMAN|LEROY MERLIN|BRICOCENTER/i)) {
            newItem.categoria = "Fai da te";
            newItem.descrizione = "Brico";
            specificStoreFound = true;
        } else if (text.match(/TECNOMAT|BRICOMAN/i)) {
            newItem.categoria = "Fai da te";
            newItem.descrizione = text.match(/TECNOMAT/i) ? "TECNOMAT" : "BRICOMAN";
            specificStoreFound = true;
        } else if (text.match(/LEROY MERLIN/i)) {
            newItem.categoria = "Fai da te";
            newItem.descrizione = "Leroy Merlin";
            specificStoreFound = true;
        } else if (text.match(/BRICOCENTER/i)) {
            newItem.categoria = "Fai da te";
            newItem.descrizione = "Bricocenter";
            specificStoreFound = true;
        } else if (text.match(/MCDONALD'?S?/i)) {
            newItem.categoria = "Pasti Fuori";
            newItem.descrizione = "McDonald's";
            specificStoreFound = true;
        }
        // ...altre regole...
        if (!specificStoreFound) {
            if (text.match(/SUPERMERCATO|ALIMENTARI/i)) {
                newItem.categoria = "Spesa Alimentare";
                newItem.descrizione = "Supermercato";
            } else if (text.match(/RISTORANTE/i)) {
                newItem.categoria = "Pasti Fuori";
                newItem.descrizione = "Ristorante";
            } else if (text.match(/PIZZERIA/i)) {
                newItem.categoria = "Pasti Fuori";
                newItem.descrizione = "Pizzeria";
            } else if (text.match(/\bBAR\b/i) && !text.match(/BARCODE/i)) {
                newItem.categoria = "Pasti Fuori";
                newItem.descrizione = "Bar";
            } else if (text.match(/CAFFÈ|CAFFETTERIA/i)) {
                newItem.categoria = "Pasti Fuori";
                newItem.descrizione = text.match(/CAFFETTERIA/i) ? "Caffetteria" : "Caffè";
            } else if (text.match(/FARMACIA/i)) {
                newItem.categoria = "Salute";
                newItem.descrizione = "Farmacia";
            } else if (text.match(/MEDICINALI|PRODOTTI SANITARI/i)) {
                newItem.categoria = "Salute";
                newItem.descrizione = "Prodotti Salute";
            }
        }
        // Fallback descrizione: prima riga significativa
        if (newItem.descrizione === "Scontrino" && newItem.categoria === "Scontrino") {
            const textLines = text.split('\n');
            let potentialDescription = "";
            for (let i = 0; i < Math.min(textLines.length, 6); i++) {
                const cleanedLine = textLines[i].replace(/\s+/g, ' ').trim();
                if (cleanedLine.length > 4 && cleanedLine.length < 50 &&
                    (cleanedLine.match(/[a-zA-Z]/g) || []).length >= cleanedLine.length * 0.4 &&
                    !cleanedLine.match(/VIA|PIAZZA|CORSO|P\.IVA|C\.F\.|TEL\.|CAP\s\d{5}/i) &&
                    !cleanedLine.match(/^\d[\d\s\.,\-:\/]*$/) &&
                    !cleanedLine.toLowerCase().includes("scontrino") &&
                    !cleanedLine.toLowerCase().includes("documento n.") &&
                    !cleanedLine.toLowerCase().includes("totale")) {
                    potentialDescription = cleanedLine;
                    break;
                }
            }
            if (potentialDescription) {
                newItem.descrizione = potentialDescription;
            } else {
                const primeRighe = textLines.filter(l => l.trim().length > 3).slice(0, 2).join(' ').trim();
                newItem.descrizione = primeRighe.substring(0, 50) || "Scontrino";
            }
        }
        newItem.descrizione = newItem.descrizione.replace(/^[^a-zA-Z0-9À-ÿ]+|[^a-zA-Z0-9À-ÿ]+$/g, '').trim();
        if (newItem.descrizione.length === 0) {
            newItem.descrizione = "Scontrino";
        }
        // --- FINE LOGICA DESCRIZIONE ---

        console.log("Dati estratti dallo scontrino (processati):", newItem);
        return newItem;
    }

    // Funzione per aggiungere una riga alla tabella (ordine: Data, Categoria, Tipo, Importo, Descrizione, Elimina)
    function addRowToTable(item, rowIndex = 0) {
        if (!recordedDataTableBody) {
            console.error("Elemento recordedDataBody non trovato!");
            return;
        }
        const row = recordedDataTableBody.insertRow(rowIndex); // Inserisce in cima

        const cellDate = row.insertCell();
        const cellCategory = row.insertCell();
        const cellType = row.insertCell();
        const cellAmount = row.insertCell();
        const cellDescription = row.insertCell();
        const cellDelete = row.insertCell();

        cellDate.textContent = item.data;
        cellCategory.textContent = item.categoria;
        cellType.textContent = item.type;
        cellAmount.textContent = parseFloat(item.importo).toFixed(2);
        cellDescription.textContent = item.descrizione;

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Elimina';
        deleteButton.classList.add('navy-btn'); // Usa la classe per lo stile blu
        deleteButton.onclick = function() {
            const indexToRemove = currentData.indexOf(item);
            if (indexToRemove > -1) {
                currentData.splice(indexToRemove, 1);
                saveData(currentData);
                recordedDataTableBody.deleteRow(row.rowIndex -1); // -1 perché l'indice della riga è rispetto al tbody
                 statusDiv.textContent = `Voce "${item.descrizione}" eliminata.`;
            }
        };
        cellDelete.appendChild(deleteButton);
    }
    
    if (clearListButton) {
        clearListButton.addEventListener('click', () => {
            if (confirm("Sei sicuro di voler cancellare tutti i dati registrati per l'anno corrente?")) {
                currentData = [];
                saveData(currentData);
                while (recordedDataTableBody.firstChild) {
                    recordedDataTableBody.removeChild(recordedDataTableBody.firstChild);
                }
                statusDiv.textContent = "Lista dati cancellata.";
            }
        });
    }

    // ... Qui andrebbe il resto del tuo codice, come la gestione del riconoscimento vocale, invio dati, ecc.
    // Assicurati che le funzioni come parseSpeechResult, inviaDatiAlFoglio siano definite se le chiami.
});