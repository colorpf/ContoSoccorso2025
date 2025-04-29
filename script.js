document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const statusP = document.getElementById('status');
    const rawTextDiv = document.getElementById('rawText');
    const parsedDataDiv = document.getElementById('parsedData');
    const recordedDataTableBody = document.getElementById('recordedDataBody');

    // URL DELLO SCRIPT APPS SCRIPT ORIGINALE (che legge form data)
    const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbxnEXCRQMN7UXSEelQcZAk8aQ-LtJuWXuphE8SZk2XYTdokM5WDNjAXKNzwbSwRWFE/exec";

    // 1. Ottenere l'anno corrente o un anno di test
    // Assicurati che questa riga sia COMMENTATA (inizi con //)
    // const currentYear = 2026;
    // Assicurati che questa riga sia ATTIVA (NON inizi con //)
    const currentYear = new Date().getFullYear();

    // 2. Definire la chiave di archiviazione basata sull'anno
    const storageKey = `contoSoccorsoData_${currentYear}`;

    // Funzione per caricare i dati all'avvio
    function loadData() {
        const storedData = localStorage.getItem(storageKey);
        let data = [];
        if (storedData) {
            try {
                data = JSON.parse(storedData);
            } catch (e) {
                console.error("Errore nel parsing dei dati salvati:", e);
                // Opzionale: informare l'utente o resettare i dati per l'anno corrente
                // localStorage.removeItem(storageKey);
            }
        }
        // Popola la tabella con i dati caricati
        recordedDataTableBody.innerHTML = ''; // Pulisce la tabella prima di ripopolarla
        data.forEach(item => addRowToTable(item));
        console.log(`Dati caricati per l'anno ${currentYear} da ${storageKey}`);
        return data; // Restituisce i dati caricati
    }

    // Funzione per salvare i dati
    function saveData(dataArray) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(dataArray));
            console.log(`Dati salvati per l'anno ${currentYear} in ${storageKey}`);
        } catch (e) {
            console.error("Errore nel salvataggio dei dati:", e);
            // Potrebbe essere che localStorage sia pieno
            statusP.textContent = "Errore: Impossibile salvare i dati. Spazio esaurito?";
        }
    }

    // Funzione per aggiungere una riga alla tabella (ordine: Data, Categoria, Tipo, Importo, Descrizione, Elimina)
    function addRowToTable(item, rowIndex = 0) {
        const row = recordedDataTableBody.insertRow(rowIndex);

        if (item.type === 'NICHOLAS_ENTRY') {
            // Nicholas: Data, Categoria (fissa), Tipo, Importo (ore), Descrizione (cantiere + note)
            row.insertCell().textContent = item.data || '';
            row.insertCell().textContent = 'Lavoro Nicholas';
            row.insertCell().textContent = item.type || '';
            row.insertCell().textContent = item.ore ? `${item.ore} ore` : '';
            let descrizione = item.cantiere || '';
            if (item.note) descrizione += (descrizione ? ' - ' : '') + item.note;
            row.insertCell().textContent = descrizione;
        } else {
            // Spesa/Entrata: Data, Categoria, Tipo, Importo, Descrizione
            row.insertCell().textContent = item.data || '';
            row.insertCell().textContent = item.categoria || '';
            row.insertCell().textContent = item.type || '';
            row.insertCell().textContent = item.importo || '';
            row.insertCell().textContent = item.descrizione || '';
        }

        // Colonna Elimina (comune a tutti)
        const deleteCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Elimina';
        deleteBtn.className = 'delete-row';
        deleteBtn.addEventListener('click', () => {
            if (confirm('Vuoi davvero eliminare questa riga?')) {
                if (confirm('Conferma definitiva: eliminare questa riga?')) {
                    const realIndex = Array.from(recordedDataTableBody.rows).indexOf(row);
                    if (realIndex > -1) {
                        currentData.splice(currentData.length - 1 - realIndex, 1);
                        saveData(currentData);
                        recordedDataTableBody.deleteRow(realIndex);
                        statusP.textContent = 'Riga eliminata.';
                    }
                }
            }
        });
        deleteCell.appendChild(deleteBtn);
    }

    // Carica i dati esistenti quando la pagina è pronta
    let currentData = loadData();

    // --- Logica per la registrazione vocale ---

    // Verifica supporto API Web Speech
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'it-IT'; // Imposta la lingua italiana
        recognition.interimResults = false; // Vogliamo solo i risultati finali
        recognition.maxAlternatives = 1; // Vogliamo solo l'alternativa più probabile

        // Cosa fare quando il riconoscimento inizia
        recognition.onstart = () => {
            statusP.textContent = 'In ascolto... Parla ora!';
            startButton.disabled = true; // Disabilita il pulsante durante l'ascolto
        };

        // Cosa fare quando viene riconosciuto qualcosa
        recognition.onresult = (event) => {
            const speechResult = event.results[event.results.length - 1][0].transcript.trim();
            rawTextDiv.textContent = `Testo riconosciuto: ${speechResult}`;

            const newItem = parseSpeechResult(speechResult); // Chiama la funzione di parsing

            parsedDataDiv.textContent = JSON.stringify(newItem, null, 2);

            if (newItem && newItem.type !== "Non definito") { // Aggiungi solo se il parsing ha prodotto un tipo valido
                 // --- MODIFICA: Aggiungi SEMPRE alla tabella locale e localStorage --- 
                 currentData.push(newItem);
                 saveData(currentData); // Salva in localStorage
                 addRowToTable(newItem); // Aggiungi alla tabella HTML
                 // --- FINE MODIFICA ---

                 // Invia i dati allo script Apps Script
                 inviaDatiAlFoglio(newItem); // Passa l'oggetto newItem direttamente

                 statusP.textContent = 'Registrazione completata.';
            } else {
                 statusP.textContent = 'Non sono riuscito a interpretare il comando o tipo non riconosciuto.';
                 parsedDataDiv.textContent = '{}';
            }
        };

        // Cosa fare in caso di errore
        recognition.onerror = (event) => {
            console.error('Errore Speech Recognition:', event.error);
            let errorMessage = 'Errore durante la registrazione: ';
            if (event.error === 'no-speech') {
                errorMessage += 'Nessun discorso rilevato.';
            } else if (event.error === 'audio-capture') {
                errorMessage += 'Problema con il microfono.';
            } else if (event.error === 'not-allowed') {
                errorMessage = '⚠️ PERMESSO MICROFONO NEGATO ⚠️\n';
                errorMessage += 'Per permettere la registrazione vocale devi:\n';
                errorMessage += '1. Usare un sito HTTPS (GitHub Pages) oppure\n';
                errorMessage += '2. Vai su chrome://settings/content/microphone e aggiungi questo indirizzo tra i siti consentiti.\n';
                errorMessage += '3. In alternativa, prova con Edge, che è più permissivo per siti locali.';
                startButton.disabled = true;
            } else {
                errorMessage += event.error;
            }
            statusP.textContent = errorMessage;
        };

        // Cosa fare quando il riconoscimento finisce
        recognition.onend = () => {
            // Riabilita il pulsante solo se non c'è stato un errore grave come 'not-allowed'
            if (statusP.textContent !== 'Permesso di usare il microfono negato.') {
                 statusP.textContent = 'Pronto per una nuova registrazione.';
                 startButton.disabled = false;
            }
        };

        // Event listener per il pulsante
        startButton.addEventListener('click', () => {
            try {
                recognition.start();
            } catch (e) {
                // Potrebbe essere già in esecuzione
                console.warn("Recognition already started?", e);
            }
        });

        statusP.textContent = `Pronto. Operativo per l'anno ${currentYear}.`;

    } else {
        // API non supportata
        statusP.textContent = 'Il tuo browser non supporta la Web Speech API. Prova con Chrome o Edge.';
        startButton.disabled = true;
    }

    // --- Funzione di Parsing aggiornata ---
    // Funzione per convertire numeri in lettere in cifre
    function wordsToNumbers(text) {
        const map = {
            'zero': '0', 'uno': '1', 'una': '1', 'due': '2', 'tre': '3', 'quattro': '4',
            'cinque': '5', 'sei': '6', 'sette': '7', 'otto': '8', 'nove': '9', 'dieci': '10'
        };
        return text.replace(/\b(zero|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/gi,
            match => map[match.toLowerCase()]);
    }

    function parseSpeechResult(text) {
        // Prima di tutto, normalizza i numeri in lettere in cifre
        text = wordsToNumbers(text);
        const lowerText = text.toLowerCase();

        // --- NUOVO: Se il comando inizia con numero + 'ora/ore', trattalo come Nicholas ---
        if (/^(\d+)\s*(ora|ore)\b/.test(lowerText)) {
            // Prependi 'nicholas ' per riutilizzare la logica esistente
            return parseSpeechResult('nicholas ' + text);
        }

        // --- Check per NICHOLAS_ENTRY (Più Specifico) ---
        // Deve iniziare con una parola chiave Nicholas E contenere 'ora'/'ore'
        const nicholasKeywordsRegex = /^(nicholas|nicola|nico|nicolas)(\s|$)/;
        const hasOreKeyword = /\b(ora|ore)\b/.test(lowerText); // Cerca 'ora' o 'ore' come parola intera

        if (nicholasKeywordsRegex.test(lowerText) && hasOreKeyword) {
            console.log("Rilevato comando Nicholas (contiene 'ore').");
            let nicholasItem = {
                type: "NICHOLAS_ENTRY",
                data: new Date().toLocaleDateString('it-IT'),
                ore: "0",
                cantiere: "",
                note: ""
            };

            // Estrai Ore (già presente)
            const oreMatch = lowerText.match(/(\d+)\s*(ora|ore)\b/);
            if (oreMatch) {
                nicholasItem.ore = oreMatch[1];
                console.log("Ore estratte:", nicholasItem.ore);
            } else {
                // Prova a cercare solo un numero (REGEX CORRETTA: con UNA sola \\)
                const numMatch = lowerText.match(/\b(\d+)\b/);
                if (numMatch) {
                    nicholasItem.ore = numMatch[1];
                    console.log("Ore estratte (solo numero):", nicholasItem.ore);
                } else {
                     console.warn("Numero di ore non trovato nel comando Nicholas.");
                }
            }

            // Estrai Cantiere (già presente)
            const cantiereRegex = /\b(cantiere|cantieri)\b\s+(.+?)(?=\s+\b(note|nota)\b|$)/i;
            const cantiereMatch = lowerText.match(cantiereRegex);
            let cantiereFoundExplicitly = false;
            if (cantiereMatch) {
                nicholasItem.cantiere = cantiereMatch[2].trim(); // Usa gruppo 2
                cantiereFoundExplicitly = true;
                console.log("Cantiere estratto (esplicito):", nicholasItem.cantiere);
            }

            // Estrai Note (già presente)
            const noteRegex = /\b(note|nota)\b\s+(.+)/i;
            const noteMatch = lowerText.match(noteRegex);
            if (noteMatch) {
                nicholasItem.note = noteMatch[2].trim(); // Usa gruppo 2
                console.log("Note estratte:", nicholasItem.note);
            }

            // Fallback Cantiere (SOLO se non trovato esplicitamente)
            if (!cantiereFoundExplicitly) {
                 console.log("Parola 'cantiere/cantieri' non trovata o testo non corrispondente, uso fallback.");
                 // Rimuovi comando iniziale (USA LA REGEX CORRETTA)
                 let remainingText = lowerText.replace(nicholasKeywordsRegex, '').trim();
                 // Rimuovi ore
                 if (oreMatch) {
                     remainingText = remainingText.replace(oreMatch[0], '').trim();
                 } else if (nicholasItem.ore !== "0") {
                     remainingText = remainingText.replace(new RegExp(`\b${nicholasItem.ore}\b`), '').trim();
                 }
                 // Rimuovi note (con sinonimi, case-insensitive)
                 if (noteMatch) {
                     // Usa la regex per rimuovere la parte delle note
                     remainingText = remainingText.replace(noteRegex, '').trim();
                 }
                 nicholasItem.cantiere = remainingText;
                 console.log("Cantiere (fallback):", nicholasItem.cantiere);
            }

            console.log("Dati Nicholas estratti:", nicholasItem);
            return nicholasItem;
        }
        // --- FINE Check per comando Nicholas ---


        // --- Logica Spesa/Entrata ---
        // Se non è un comando Nicholas specifico (con 'ore'), procede qui
        console.log("Comando non Nicholas specifico (senza 'ore') o diverso, procedo con Spesa/Entrata.");
        let newItem = {
            type: "Non definito", // <-- correzione: era tipo
            data: new Date().toLocaleDateString('it-IT'),
            importo: "0.00",
            categoria: "",
            descrizione: text
        };

        let matchedTypeKeyword = null;
        let matchedCategoryKeyword = null;
        let matchedImportoString = null;

        const paroleSpesa = [
            "spesa", "spese", "spes", "pagato", "acquisto", "acquisti", "pagamento", "pagamenti",
            "uscita", "uscite", "peso", "pesa", "auto", "materiale", "materiali", "tasse", "commercialista", "magazzino", "casa", "capo"
        ];
        const paroleEntrata = [
            "entrata", "entrate", "incasso", "ricevuto", "ricevuti", "guadagno", "guadagni", "ricavo", "ricavi", "incassato", "incassata", "incassate", "incassati"
        ];

        // --- LOGICA SPECIALE PER ACCONTO ---
        if (/\bacconto\b/i.test(lowerText)) {
            // Se c'è anche una parola di spesa, è spesa
            for (const parola of paroleSpesa) {
                if (lowerText.includes(parola)) {
                    newItem.type = "Spesa";
                    matchedTypeKeyword = "acconto";
                    break;
                }
            }
            // Se non è già stato classificato come Spesa, cerca parole di entrata
            if (newItem.type === "Non definito") {
                for (const parola of paroleEntrata) {
                    if (lowerText.includes(parola)) {
                        newItem.type = "Entrata";
                        matchedTypeKeyword = "acconto";
                        break;
                    }
                }
            }
            // Se non trova altro, di default SPESA
            if (newItem.type === "Non definito") {
                newItem.type = "Spesa";
                matchedTypeKeyword = "acconto";
            }
        } else {
            // --- LOGICA STANDARD ---
            // Prima Entrate
            for (const parola of paroleEntrata) {
                 const regex = new RegExp(`\\b${parola}\\b`, 'i');
                 if (lowerText.match(regex)) {
                    newItem.type = "Entrata";
                    matchedTypeKeyword = parola;
                    break;
                }
            }
            // Poi Spese (se non già Entrata)
            if (newItem.type === "Non definito") {
                for (const parola of paroleSpesa) {
                     const regex = new RegExp(`\\b${parola}\\b`, 'i');
                     if (lowerText.match(regex)) {
                        newItem.type = "Spesa";
                        matchedTypeKeyword = parola;
                        break;
                    }
                }
            }
        }

        // --- Categorie principali ---
        const categorieMap = {
            "Materiali": ["materiali", "materiale", "materia", "mat", "material", "mater", "colorificio", "ferramenta"],
            "Capo": ["capo", "boss"], // Sostituito Nicolas con Capo
            "Auto": ["auto", "macchina", "veicolo", "car", "automezzo", "gasolio", "diesel", "benzina", "meccanico"],
            "Tasse": ["tasse", "tassa", "imposte", "imposta", "tributi", "tributo", "f24"],
            "Commercialista": ["commercialista", "commerciale", "contabile", "ragioniere", "fiscozen"],
            "Spese Casa": ["spese casa", "casa", "affitto", "utenze", "bollette", "domestico", "domestica", "pulizia", "pulizie"],
            "Magazzino": ["magazzino", "magazino", "deposito", "scorta", "scorte"],
            "Extra": ["extra", "varie", "vario", "altro", "diverso", "gatto"]
        };
        outerLoop:
        for (const [categoriaStandard, varianti] of Object.entries(categorieMap)) {
            for (const variante of varianti) {
                const regex = new RegExp(`\\b${variante}\\b`, 'i');
                if (lowerText.match(regex)) { // Usa lowerText
                    newItem.categoria = categoriaStandard;
                    matchedCategoryKeyword = variante;
                    break outerLoop;
                }
            }
        }

        // --- Importo ---
        let importo = "0.00";
        const importoRegex = /(\d+([.,]\d{1,2})?)\s*(euro|€)?|(euro|€)\s*(\d+([.,]\d{1,2})?)/i;
        const matchImporto = lowerText.match(importoRegex); // Usa lowerText
        if (matchImporto) {
            const numStr = matchImporto[1] || matchImporto[5];
            if (numStr) {
                 importo = numStr.replace(',', '.');
                 matchedImportoString = matchImporto[0];
            }
        }
        newItem.importo = importo;

        // --- Descrizione raffinata ---
        let refinedDescription = text; // Inizia con l'originale per mantenere maiuscole/minuscole

        if (matchedTypeKeyword && matchedTypeKeyword !== "acconto") {
            const regex = new RegExp(`\\b${matchedTypeKeyword}\\b`, 'gi');
            refinedDescription = refinedDescription.replace(regex, '');
        }
        if (matchedCategoryKeyword) {
            const regex = new RegExp(`\\b${matchedCategoryKeyword}\\b`, 'gi');
            refinedDescription = refinedDescription.replace(regex, '');
        }
        if (matchedImportoString) {
            const escapedImportoString = matchedImportoString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedImportoString, 'gi');
            refinedDescription = refinedDescription.replace(regex, '');
        }
        if (/\bpeso\b/i.test(refinedDescription)) {
             console.log("Rilevato 'peso' nel testo. Rimuovo (controllo di sicurezza).");
             refinedDescription = refinedDescription.replace(/\bpeso\b/gi, '');
        }
         if (/\bpesa\b/i.test(refinedDescription)) {
             console.log("Rilevato 'pesa' nel testo. Rimuovo (controllo di sicurezza).");
             refinedDescription = refinedDescription.replace(/\bpesa\b/gi, '');
        }

        refinedDescription = refinedDescription.replace(/\s+/g, ' ').trim();
        newItem.descrizione = refinedDescription || text.replace(/\s+/g, ' ').trim();

        // --- Deduzione Tipo ---
        if (newItem.type === "Non definito" && newItem.importo !== "0.00") { // <-- correzione: era tipo
             let isEntrata = false;
             for (const parola of paroleEntrata) {
                 if (lowerText.includes(parola)) { // Usa lowerText
                     isEntrata = true;
                     break;
                 }
             }
             if (!isEntrata) {
                 newItem.type = "Spesa"; // <-- correzione: era tipo
                 console.log("Tipo dedotto come 'Spesa' per mancanza di parole chiave entrata.");
             }
        }

        console.log("Dati Spesa/Entrata estratti:", newItem);
        return newItem;
    }

    function inviaDatiAlFoglio(data) {
        console.log("Invio dati al foglio:", data);
        const formData = new URLSearchParams();

        // Aggiungi parametri in base al tipo
        formData.append('type', data.type); // Sempre presente

        if (data.type === 'NICHOLAS_ENTRY') {
            formData.append('ore', data.ore || '0');
            formData.append('cantiere', data.cantiere || '');
            formData.append('note', data.note || '');
        } else { // SPESA o ENTRATA (o altro futuro)
            formData.append('importo', data.importo || '0.00');
            formData.append('categoria', data.categoria || '');
            formData.append('descrizione', data.descrizione || '');
        }

        fetch(APPSCRIPT_URL, {
            method: "POST",
            body: formData,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        })
        .then(response => {
            console.log("Risposta ricevuta:", response); // Log pulito
            if (!response.ok) {
                return response.text().then(text => {
                     throw new Error(`Server response: ${response.status} ${response.statusText}. Body: ${text}`);
                });
            }
            return response.json();
        })
        .then(result => {
            console.log("Dati elaborati:", result); // Log pulito
            if (result.status === "success") {
                // Messaggio più generico o specifico in base al risultato?
                statusP.textContent = `✅ ${result.message || 'Dati inviati con successo!'}`;
            } else {
                statusP.textContent = `❌ Errore dal foglio: ${result.message}`;
            }
        })
        .catch(error => {
            console.error("Errore completo:", error);
            statusP.textContent = "❌ Errore di rete: " + error.message;
        });
    }

    // Gestione pulsante Svuota Lista
    const clearListButton = document.getElementById('clearListButton');
    clearListButton.addEventListener('click', () => {
        if (confirm('Sei sicuro di voler svuotare tutta la lista?')) {
            if (confirm('Conferma definitiva: questa azione è irreversibile. Procedere?')) {
                localStorage.removeItem(storageKey);
                currentData = [];
                recordedDataTableBody.innerHTML = '';
                statusP.textContent = 'Lista svuotata.';
            }
        }
    });

}); // Fine DOMContentLoaded