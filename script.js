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
        console.log("Testo da analizzare (scontrino):\n", text); // Corretto \\n in \n
        let newItem = {
            type: "Non definito",
            data: new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            importo: "0.00",
            categoria: "Scontrino", 
            descrizione: "Scontrino" 
        };

        // --- INIZIO LOGICA IMPORTI MIGLIORATA ---
        let amounts = [];

        const parseValueToFloat = (valStr) => {
            if (!valStr) return 0;
            // Corretto \\. in \. e \, in , (anche se replace(',', '.') era già corretto)
            const normalized = valStr.replace(/\.(?=\d{3}(?:,|$))/g, '').replace(',', '.'); 
            return parseFloat(normalized) || 0;
        };

        const lines = text.split('\n'); // Corretto \\n in \n
        const potentialTotalsKeywords = [
            // Corretto \\b in \b e \\s in \s nelle regex
            { keyword: /(?:\bTOTALE\b|\bIMPORTO\s+PAGATO\b|\bNETTO\s+A\s+PAGARE\b|\bTOTALE\s+EURO\b|\bTOTALE\s+EUR\b|CONTANTE\s*EURO)/i, priority: 1 },
            { keyword: /(?:\bPAGATO\b|\bIMPORTO\b|\bCORRISPETTIVO\b|\bCONTANTE\b|\bTOTALE\s+SCONTRINO\b|\bPAGAMENTO\b|TOTALE\sGENERALE)/i, priority: 2 }
        ];
        // Corretto \\d in \d, \. in \. \, in , e \\b in \b
        const amountRegex = /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/g; 
        // Corretto \\b in \b, \\s in \s, \\d in \d
        const vatExclusionRegex = /\b(?:IVA|ALIQUOTA|IMPOSTA|VAT|TAX|%)[-\sA-ZÀ-ÿ0-9]*\b/i; // Modificata leggermente per essere più generale e robusta
        // Corretto \\s in \s, \\. in \.
        const generalExclusionKeywords = /SCONTO|RESTO|CREDITO|SUBTOTALE|RIEPILOGO\s+ALIQUOTE|BUONO|TRONCARE|NON\s+RISCOSSO|NON\s+PAGATO|CODICE|ARTICOLO|TEL\.|\bP\.IVA\b|\bC\.F\b\.|SCONTRINO\s+N\.|\bDOC\b\.|OPERAZIONE\s+N\./i;


        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            let isLikelyVatOrIrrelevant = vatExclusionRegex.test(trimmedLine) || generalExclusionKeywords.test(trimmedLine);
            let hasStrongTotalKeyword = potentialTotalsKeywords.some(ptk => ptk.priority === 1 && ptk.keyword.test(trimmedLine));

            // Se la riga contiene una parola chiave forte per il totale, non la scartare solo per parole chiave generali o IVA.
            if (isLikelyVatOrIrrelevant && !hasStrongTotalKeyword) {
                // Se contiene IVA ma ANCHE una parola chiave forte (es. "TOTALE IVA INCLUSA"), non scartarla qui.
                // La condizione sopra già gestisce questo, ma rendiamo il log più chiaro.
                if (vatExclusionRegex.test(trimmedLine) && !hasStrongTotalKeyword) {
                     console.log(`Skipping line due to VAT/percentage (and no strong total keyword): "${trimmedLine}"`);
                } else if (generalExclusionKeywords.test(trimmedLine) && !hasStrongTotalKeyword) {
                    console.log(`Skipping line due to general exclusion keywords (and no strong total keyword): "${trimmedLine}"`);
                }
                continue;
            }

            let lineAmounts = [];
            let match;
            amountRegex.lastIndex = 0; 
            while ((match = amountRegex.exec(trimmedLine)) !== null) {
                lineAmounts.push(match[1]);
            }

            if (lineAmounts.length > 0) {
                let keywordFoundOnLine = false;
                for (const ptk of potentialTotalsKeywords) {
                    if (ptk.keyword.test(trimmedLine)) {
                        amounts.push({ value: lineAmounts[lineAmounts.length - 1], priority: ptk.priority, lineContext: trimmedLine, reason: `Keyword: ${ptk.keyword.source}` });
                        keywordFoundOnLine = true;
                        break; 
                    }
                }
                if (!keywordFoundOnLine) {
                    // Solo se non è una riga IVA/esclusa O se ha una parola chiave forte (già gestito sopra, ma per sicurezza)
                    if (!isLikelyVatOrIrrelevant || hasStrongTotalKeyword) {
                        for (const la of lineAmounts) {
                            amounts.push({ value: la, priority: 3, lineContext: trimmedLine, reason: "Generic amount on non-excluded/strong keyword line" });
                        }
                    }
                }
            }
        }
        
        if (amounts.length > 0) {
            console.log("Candidati importo trovati prima del filtraggio e ordinamento:", JSON.stringify(amounts.map(a => ({...a, valueFloat: parseValueToFloat(a.value)})), null, 2));
            const highestPriority = Math.min(...amounts.map(a => a.priority));
            amounts = amounts.filter(a => a.priority === highestPriority);
            console.log(`Candidati dopo filtraggio per priorità ${highestPriority}:`, JSON.stringify(amounts.map(a => ({...a, valueFloat: parseValueToFloat(a.value)})), null, 2));
            amounts.sort((a, b) => parseValueToFloat(b.value) - parseValueToFloat(a.value));
            console.log("Candidati dopo ordinamento per valore (decrescente):", JSON.stringify(amounts.map(a => ({...a, valueFloat: parseValueToFloat(a.value)})), null, 2));

            if (amounts.length > 0) {
                let bestAmountStr = amounts[0].value;
                // Ri-applica la normalizzazione per assicurare il formato corretto per newItem.importo
                newItem.importo = bestAmountStr.replace(/\.(?=\d{3}(?:,|$))/g, '').replace(',', '.');
                newItem.type = "Spesa"; 
                console.log(`Importo selezionato: ${newItem.importo} dalla riga: "${amounts[0].lineContext}" con priorità ${amounts[0].priority}`);
            } else {
                 console.log("Nessun importo valido trovato dopo filtraggio e ordinamento.");
            }
        } else {
             console.log("Nessun importo candidato trovato nel testo OCR.");
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