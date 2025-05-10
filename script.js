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
            categoria: "Scontrino", // Default category
            descrizione: "Scontrino" // Default description, will be updated
        };

        // --- INIZIO LOGICA IMPORTI MIGLIORATA ---
        let amounts = [];
        
        const parseValueToFloat = (valStr) => {
            if (!valStr) return 0;
            const normalized = valStr.replace(/\.(?=\d{3})/g, '').replace(',', '.');
            return parseFloat(normalized) || 0;
        };

        const lines = text.split('\n');
        for (const line of lines) {
            if (/IVA|IMPOSTA\sDI\sBOLLO|ALIQUOTA|SCONTO|RESTO|CREDITO|SUBTOTALE|RIEPILOGO\s+ALIQUOTE|BUONO|BUONI|TRONCARE|NON\s+RISCOSSO|NON\s+PAGATO/i.test(line)) {
                continue;
            }

            let match;

            // Priorità 1: Parole chiave molto forti per il totale (RIMOSSO \010)
            match = line.match(/(\b(?:TOTALE|IMPORTO\s+PAGATO|NETTO\s+A\s+PAGARE|TOTALE\s+EURO|TOTALE\s+EUR)[\sA-Z]*(?:EUR|€)?\s*)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/i);
            if (match) {
                amounts.push({ value: match[2], priority: 1, lineContext: line });
                continue; 
            }

            // Priorità 2: Parole chiave comuni per pagamenti o importi (RIMOSSO \010)
            match = line.match(/(\b(?:PAGATO|IMPORTO|CORRISPETTIVO|CONTANTE|TOTALE\s+SCONTRINO|PAGAMENTO)[\sA-Z]*(?:EUR|€)?\s*)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/i);
            if (match) {
                amounts.push({ value: match[2], priority: 2, lineContext: line });
                continue;
            }
            
            // Priorità 3: Simbolo € o EUR seguito da un importo
            match = line.match(/((?:EUR|€)\s*)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/i);
            if (match) {
                // Evita di catturare importi che sono chiaramente parte di date o codici se il simbolo € è ambiguo
                if (line.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/) && line.indexOf(match[2]) > line.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/)[0].length + line.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/).index && !line.match(/TOTALE|IMPORTO|PAGATO/i) ) {
                    // Probabilmente un importo dopo una data, es. "€DD-MM-YYYY IMPORTO" -> OK
                    // Ma se è "€NUMERO-CHE-FA-PARTE-DI-UN-CODICE IMPORTO", potrebbe essere rischioso.
                    // Per ora, si accetta se non ci sono parole chiave di pagamento più forti.
                }
                amounts.push({ value: match[2], priority: 3, lineContext: line });
                continue;
            }
        }
        
        // Priorità 4: Fallback - cerca importi generici su righe "pulite" se non trovato nulla prima
        if (amounts.length === 0) {
            let fallbackAmounts = [];
            // Riduciamo le parole chiave di esclusione per il fallback
            const fallbackExclusionRegex = /IVA|ALIQUOTA|SCONTO|RESTO|SUBTOTALE|CREDITO|RIEPILOGO\s+ALIQUOTE|NON\s+RISCOSSO|NON\s+PAGATO|TRONCARE/i;
            
            for (const line of lines.slice().reverse()) { // Itera dalle ultime righe
                 if (fallbackExclusionRegex.test(line)) { // Usa la nuova regex di esclusione
                    continue;
                }
                const lineMatches = [...line.matchAll(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/g)];
                if (lineMatches.length > 0) {
                    fallbackAmounts.push({ value: lineMatches[lineMatches.length -1][1], priority: 4, lineContext: line });
                }
            }
            if (fallbackAmounts.length > 0) {
                fallbackAmounts.sort((a,b) => parseValueToFloat(b.value) - parseValueToFloat(a.value));
                amounts.push(fallbackAmounts[0]); 
            }
        }

        // NUOVA FASE DI FALLBACK (Priorità 5) se ancora nessun importo
        if (amounts.length === 0) {
            console.log("Fallback priorità 4 non ha trovato importi, si tenta priorità 5.");
            let veryFallbackAmounts = [];
            const veryFallbackExclusionRegex = /RESTO|TRONCARE|NON\s+RISCOSSO|NON\s+PAGATO/i; // Pochissime esclusioni
            const lastNLines = 7; // Considera le ultime 7 righe

            for (const line of lines.slice(-lastNLines).reverse()) {
                if (veryFallbackExclusionRegex.test(line)) {
                    continue;
                }
                const lineMatches = [...line.matchAll(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/g)];
                if (lineMatches.length > 0) {
                    // Prendi tutti gli importi validi su questa riga
                    for (const match of lineMatches) {
                        veryFallbackAmounts.push({ value: match[1], priority: 5, lineContext: line });
                    }
                }
            }

            if (veryFallbackAmounts.length > 0) {
                // Tra tutti i candidati di questo fallback estremo, prendi quello con valore numerico più alto
                veryFallbackAmounts.sort((a,b) => parseValueToFloat(b.value) - parseValueToFloat(a.value));
                amounts.push(veryFallbackAmounts[0]);
                console.log("Fallback priorità 5 ha trovato un importo:", veryFallbackAmounts[0]);
            }
        }


        if (amounts.length > 0) {
            amounts.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                return parseValueToFloat(b.value) - parseValueToFloat(a.value);
            });
            
            console.log("Potential amounts found (sorted):", amounts);

            let bestAmountStr = amounts[0].value;
            newItem.importo = bestAmountStr.replace(/\.(?=\d{3})/g, '').replace(',', '.');
            newItem.type = "Spesa";
        } else {
             console.log("No reliable amount found with new logic. Check OCR text.");
        }
        // --- FINE LOGICA IMPORTI MIGLIORATA ---
        
        const dataMatch = text.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);
        if (dataMatch) {
            let dataString = dataMatch[1].replace(/[\-.]/g, '/');
            let parts = dataString.split('/');
            if (parts.length === 3) {
                let day = parts[0].padStart(2, '0');
                let month = parts[1].padStart(2, '0');
                let year = parts[2];
                if (year.length === 2) year = "20" + year; 
                newItem.data = `${day}/${month}/${year}`;
            }
        }

        // --- NEW DESCRIPTION AND CATEGORY LOGIC ---
        let specificStoreFound = false;

        // Prioritize specific store names for description and category
        if (text.match(/CONAD/i)) {
            newItem.categoria = "Spesa Alimentare";
            newItem.descrizione = "CONAD";
            specificStoreFound = true;
        } else if (text.match(/ESSELUNGA/i)) {
            newItem.categoria = "Spesa Alimentare";
            newItem.descrizione = "ESSELUNGA";
            specificStoreFound = true;
        } else if (text.match(/LIDL/i)) {
            newItem.categoria = "Spesa Alimentare";
            newItem.descrizione = "LIDL";
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
        } // Add more specific stores here


        // If no specific store was found, try general categories
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
            } else if (text.match(/\bBAR\b/i) && !text.match(/BARCODE/i)) { // Check for whole word BAR and not in BARCODE
                newItem.categoria = "Pasti Fuori";
                newItem.descrizione = "Bar";
            } else if (text.match(/CAFFÈ|CAFFETTERIA/i)) { 
                newItem.categoria = "Pasti Fuori";
                newItem.descrizione = text.match(/CAFFETTERIA/i) ? "Caffetteria" : "Caffè";
            } else if (text.match(/FARMACIA/i)) {
                newItem.categoria = "Salute";
                newItem.descrizione = "Farmacia";
            } else if (text.match(/MEDICINALI|PRODOTTI SANITARI/i) ) { 
                newItem.categoria = "Salute";
                newItem.descrizione = "Prodotti Salute";
            } 
            // Removed the old generic Brico rule as it's now more specific
        }

        // Fallback: If description is still the default "Scontrino" and category is also "Scontrino",
        // try the original advanced parsing logic to find a more descriptive line.
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
                newItem.descrizione = primeRighe.substring(0, 50) || "Scontrino"; // Default to "Scontrino" if empty
            }
        }
        
        // Final cleanup for description
        newItem.descrizione = newItem.descrizione.replace(/^[^a-zA-Z0-9À-ÿ]+|[^a-zA-Z0-9À-ÿ]+$/g, '').trim();
        if (newItem.descrizione.length === 0) {
            newItem.descrizione = "Scontrino"; // Ensure description is not empty
        }
        // --- END NEW DESCRIPTION AND CATEGORY LOGIC ---

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