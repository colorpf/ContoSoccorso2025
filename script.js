document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const statusP = document.getElementById('status');
    const rawTextDiv = document.getElementById('rawText');
    const parsedDataDiv = document.getElementById('parsedData');
    const recordedDataTableBody = document.getElementById('recordedDataBody');

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
        row.insertCell().textContent = item.data || '';
        row.insertCell().textContent = item.categoria || '';
        row.insertCell().textContent = item.tipo || '';
        row.insertCell().textContent = item.importo || '';
        row.insertCell().textContent = item.descrizione || '';
        // Colonna Elimina
        const deleteCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Elimina';
        deleteBtn.className = 'delete-row';
        deleteBtn.addEventListener('click', () => {
            if (confirm('Vuoi davvero eliminare questa riga?')) {
                if (confirm('Conferma definitiva: eliminare questa riga?')) {
                    // Trova l'indice reale della riga da eliminare
                    const realIndex = Array.from(recordedDataTableBody.rows).indexOf(row);
                    if (realIndex > -1) {
                        currentData.splice(currentData.length - 1 - realIndex, 1); // Poiché inseriamo in cima
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

            // --- Elaborazione del testo (DA IMPLEMENTARE MEGLIO) ---
            // Per ora, usiamo il testo come descrizione e mettiamo valori placeholder
            const newItem = parseSpeechResult(speechResult); // Chiama la funzione di parsing

            parsedDataDiv.textContent = JSON.stringify(newItem, null, 2);

            // Aggiungi, salva e aggiorna la tabella
            if (newItem) { // Aggiungi solo se il parsing ha prodotto qualcosa
                 currentData.push(newItem);
                 saveData(currentData);
                 addRowToTable(newItem);
                 // Dopo aver aggiunto la riga alla tabella e salvato in localStorage
                 inviaDatiAlFoglio({
                     type: newItem.tipo.toUpperCase(),
                     importo: Number(newItem.importo),
                     categoria: newItem.categoria ? newItem.categoria.toLowerCase() : "",
                     descrizione: newItem.descrizione
                 });
                 statusP.textContent = 'Registrazione completata.';
            } else {
                 statusP.textContent = 'Non sono riuscito a interpretare il comando.';
                 parsedDataDiv.textContent = '{}'; // Pulisce l'area JSON
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
    function parseSpeechResult(text) {
        console.log("Parsing testo:", text);
        let newItem = {
            tipo: "Non definito",
            data: new Date().toLocaleDateString('it-IT'),
            importo: "0.00",
            categoria: "",
            descrizione: text
        };

        // Tipo (più tollerante)
        const paroleSpesa = ["spesa", "spese", "spes", "pesa", "pagato", "acquisto", "pagamento", "pagata", "pagate", "pagati"];
        const paroleEntrata = ["entrata", "entrate", "incasso", "ricevuto", "ricevuta", "ricevute", "ricevuti", "incassato", "incassata", "incassate", "incassati"];
        for (const parola of paroleSpesa) {
            if (text.toLowerCase().includes(parola)) {
                newItem.tipo = "Spesa";
                break;
            }
        }
        for (const parola of paroleEntrata) {
            if (text.toLowerCase().includes(parola)) {
                newItem.tipo = "Entrata";
                break;
            }
        }

        // Categorie principali (tolleranti, con varianti comuni)
        const categorieMap = {
            "Materiali": ["materiali", "materiale", "materia", "mat", "material", "mater"],
            "Nicolas": ["nicolas", "nicola", "nicholas", "nikolas", "nikola"],
            "Auto": ["auto", "macchina", "veicolo", "car", "automezzo"],
            "Tasse": ["tasse", "tassa", "imposte", "imposta", "tributi", "tributo"],
            "Commercialista": ["commercialista", "commerciale", "contabile", "ragioniere"],
            "Spese Casa": ["spese casa", "casa", "affitto", "utenze", "bollette", "domestico", "domestica"],
            "Magazzino": ["magazzino", "magazino", "deposito", "scorta", "scorte"],
            "Extra": ["extra", "varie", "vario", "altro", "diverso"]
        };
        for (const [categoriaStandard, varianti] of Object.entries(categorieMap)) {
            for (const variante of varianti) {
                if (text.toLowerCase().includes(variante)) {
                    newItem.categoria = categoriaStandard;
                    break;
                }
            }
            if (newItem.categoria) break;
        }

        // Importo (come prima)
        let importo = "0.00";
        const numeriTrovati = text.match(/\d+([.,]\d{1,2})?/g);
        if (numeriTrovati) {
            for (const numStr of numeriTrovati) {
                const patternNumCurrency = new RegExp(numStr.replace('.', '\\.') + "\\s*(euro|€)", 'i');
                const patternCurrencyNum = new RegExp("(euro|€)\\s*" + numStr.replace('.', '\\.'), 'i');
                if (text.match(patternNumCurrency) || text.match(patternCurrencyNum)) {
                    importo = numStr.replace(',', '.');
                    break;
                }
            }
        }
        newItem.importo = importo;

        // Descrizione raffinata
        let refinedDescription = text.toLowerCase();
        // Usa [].concat(...Object.values(categorieMap)) per compatibilità universale
        const keywordsToRemove = [
            "spesa", "pagato", "acquisto", "entrata", "ricevuto", "incasso", "euro", "€",
            ...[].concat(...Object.values(categorieMap))
        ];
        keywordsToRemove.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            refinedDescription = refinedDescription.replace(regex, '');
        });
        // Rimuovi anche simboli euro isolati
        refinedDescription = refinedDescription.replace(/€/g, '');
        if (newItem.importo !== "0.00") {
            const importoPattern = newItem.importo.replace('.', '[.,]');
            const importoRegex = new RegExp(importoPattern);
            refinedDescription = refinedDescription.replace(importoRegex, '');
        }
        refinedDescription = refinedDescription.replace(/\s+/g, ' ').trim();
        newItem.descrizione = refinedDescription || text;

        return newItem;
    }

    const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzNcH2SsKuDoxm7wmHbm5mThmdYmRjFaK2rwjmShXi1xZREy0vifTKmD8PscBcC5Q/exec";

    function inviaDatiAlFoglio(data) {
        console.log("Invio dati al foglio (MODALITÀ FORM DATA PER TEST):", data);

        // Converti l'oggetto dati in parametri URL encoded
        const formData = new URLSearchParams();
        formData.append('type', data.type);
        formData.append('importo', data.importo);
        formData.append('categoria', data.categoria || ''); // Assicurati che non sia null/undefined
        formData.append('descrizione', data.descrizione || ''); // Assicurati che non sia null/undefined

        fetch(APPSCRIPT_URL, {
            method: "POST",
            // mode: 'no-cors', // RIMUOVI o commenta questa riga
            body: formData, // Invia come URLSearchParams
            headers: {
                // Imposta il Content-Type corretto per i dati form
                "Content-Type": "application/x-www-form-urlencoded"
            }
        })
        .then(response => {
            console.log("Risposta ricevuta (form data):", response);
            if (!response.ok) {
                // Prova a leggere il corpo anche in caso di errore per debug
                return response.text().then(text => {
                     throw new Error(`Server response: ${response.status} ${response.statusText}. Body: ${text}`);
                });
            }
            return response.json(); // Prova a interpretare come JSON (lo script minimale dovrebbe rispondere JSON)
        })
        .then(result => {
            console.log("Dati elaborati (form data):", result);
            if (result.status === "success") {
                statusP.textContent = "✅ Dati inviati (form data) e salvati nel foglio!";
            } else {
                statusP.textContent = "❌ Errore dal foglio (form data): " + result.message;
            }
        })
        .catch(error => {
            console.error("Errore completo (form data):", error);
            statusP.textContent = "❌ Errore di rete (form data): " + error.message;
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