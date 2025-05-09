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

        // Regex migliorate e più specifiche per l'italiano
        const importoRegexEuropea = /(\b(?:TOTALE|IMPORTO|PAGATO)\b\s*(?:EUR|€)?\s*)(\d{1,3}(?:\.\d{3})*,\d{2})\b/i;
        const importoRegexGenerica = /(?:EUR|€)\s*(\d{1,3}(?:\.\d{3})*,\d{2})\b/i;
        const importoRegexSemplice = /(\d+,\d{2})/g; // Cerca qualsiasi numero con due decimali separati da virgola

        let importoMatch = text.match(importoRegexEuropea);
        if (importoMatch) {
            newItem.importo = importoMatch[2].replace(/\./g, '').replace(',', '.'); // Rimuove i punti delle migliaia, converte la virgola
            newItem.type = "Spesa";
        } else {
            importoMatch = text.match(importoRegexGenerica);
            if (importoMatch) {
                newItem.importo = importoMatch[1].replace(/\./g, '').replace(',', '.');
                newItem.type = "Spesa";
            } else {
                const possibiliImporti = [...text.matchAll(importoRegexSemplice)];
                if (possibiliImporti.length > 0) {
                    newItem.importo = possibiliImporti[possibiliImporti.length - 1][1].replace(',', '.');
                    newItem.type = "Spesa";
                }
            }
        }
        
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
        } else if (text.match(/TECNOMAT/i)) {
            newItem.categoria = "Fai da te";
            newItem.descrizione = "TECNOMAT";
            specificStoreFound = true;
        } else if (text.match(/BRICOMAN/i)) {
            newItem.categoria = "Fai da te";
            newItem.descrizione = "BRICOMAN";
            specificStoreFound = true;
        } else if (text.match(/LEROY MERLIN/i)) {
            newItem.categoria = "Fai da te";
            newItem.descrizione = "Leroy Merlin";
            specificStoreFound = true;
        } else if (text.match(/MCDONALD'?S?/i)) { // Handles McDonald and McDonald's
            newItem.categoria = "Pasti Fuori";
            newItem.descrizione = "McDonald's";
            specificStoreFound = true;
        } // Add more specific stores here like: else if (text.match(/NOME_NEGOZIO/i)) { newItem.categoria = "Categoria"; newItem.descrizione = "NOME_NEGOZIO"; specificStoreFound = true; }


        // If no specific store was found, try general categories and set a generic description
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
            } else if (text.match(/BAR/i)) {
                newItem.categoria = "Pasti Fuori";
                newItem.descrizione = "Bar";
            } else if (text.match(/CAFFÈ/i)) { 
                newItem.categoria = "Pasti Fuori";
                newItem.descrizione = "Caffè";
            } else if (text.match(/FARMACIA/i)) {
                newItem.categoria = "Salute";
                newItem.descrizione = "Farmacia";
            } else if (text.match(/MEDICINALI/i) && newItem.categoria === "Scontrino") { // Avoid overriding if Farmacia already matched
                newItem.categoria = "Salute";
                newItem.descrizione = "Prodotti Salute";
            } else if (text.match(/BRICO/i) && newItem.categoria === "Scontrino") { // Avoid overriding if Tecnoma/Bricoman etc. matched
                newItem.categoria = "Fai da te";
                newItem.descrizione = "Brico";
            }
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