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
            parsedDataDiv.textContent = JSON.stringify(scontrinoData, null, 2);

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
            descrizione: "Acquisto da scontrino"
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
                // Cerca tutti i possibili importi e prende l'ultimo (spesso il totale) o il più grande
                const possibiliImporti = [...text.matchAll(importoRegexSemplice)];
                if (possibiliImporti.length > 0) {
                    // Prende l'ultimo trovato, che è spesso il totale
                    newItem.importo = possibiliImporti[possibiliImporti.length - 1][1].replace(',', '.');
                    newItem.type = "Spesa";
                }
            }
        }
        
        // Regex per la data (GG/MM/AAAA o GG-MM-AAAA o GG.MM.AAAA)
        const dataMatch = text.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);
        if (dataMatch) {
            let dataString = dataMatch[1].replace(/[\-.]/g, '/');
            let parts = dataString.split('/');
            if (parts.length === 3) {
                let day = parts[0].padStart(2, '0');
                let month = parts[1].padStart(2, '0');
                let year = parts[2];
                if (year.length === 2) year = "20" + year; // Assumiamo anni 20xx
                newItem.data = `${day}/${month}/${year}`;
            }
        }

        // Esempio per categoria (molto dipendente dal contenuto dello scontrino)
        if (text.match(/SUPERMERCATO|ALIMENTARI|CONAD|ESSELUNGA/i)) {
            newItem.categoria = "Spesa Alimentare";
        } else if (text.match(/RISTORANTE|PIZZERIA|BAR|CAFFÈ/i)) {
            newItem.categoria = "Pasti Fuori";
        } else if (text.match(/FARMACIA|MEDICINALI/i)) {
            newItem.categoria = "Salute";
        }

        // Descrizione: prime righe o nome negozio se identificabile
        const primeRighe = text.split('\n').slice(0, 3).join(' ').trim(); // Prende le prime 3 righe
        newItem.descrizione = primeRighe.substring(0, 100) + (primeRighe.length > 100 ? "..." : "");
        if (newItem.descrizione.length < 10 && text.length > 0) { // Fallback se le prime righe sono vuote
             newItem.descrizione = text.substring(0,100) + "...";
        }


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