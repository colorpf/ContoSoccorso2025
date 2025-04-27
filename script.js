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
            tipo: "Non definito", // Default
            data: new Date().toLocaleDateString('it-IT'),
            importo: "0.00",
            categoria: "", // Default vuoto
            descrizione: text // Inizia con il testo completo
        };

        // --- Tipo (più tollerante) ---
        // Aggiunto "uscite"
        const paroleSpesa = ["spesa", "spese", "spes", "pesa", "pagato", "acquisto", "pagamento", "pagata", "pagate", "pagati", "uscite", "uscita"];
        const paroleEntrata = ["entrata", "entrate", "incasso", "ricevuto", "ricevuta", "ricevute", "ricevuti", "incassato", "incassata", "incassate", "incassati", "acconto"]; // Aggiunto acconto come possibile entrata

        // Cerca prima le entrate, poi le spese per evitare conflitti (es. "acconto spesa")
        for (const parola of paroleEntrata) {
            if (text.toLowerCase().includes(parola)) {
                newItem.tipo = "Entrata";
                break;
            }
        }
        // Se non è entrata, controlla se è spesa
        if (newItem.tipo === "Non definito") {
            for (const parola of paroleSpesa) {
                if (text.toLowerCase().includes(parola)) {
                    newItem.tipo = "Spesa";
                    break;
                }
            }
        }
        // Se ancora non definito dopo aver cercato spese ed entrate, rimane "Non definito"

        // --- Categorie principali (tolleranti, con varianti comuni) ---
        const categorieMap = {
            // Manteniamo le categorie esistenti
            "Materiali": ["materiali", "materiale", "materia", "mat", "material", "mater", "colorificio", "ferramenta"], // Aggiunto colorificio/ferramenta
            "Nicolas": ["nicolas", "nicola", "nicholas", "nikolas", "nikola"],
            "Auto": ["auto", "macchina", "veicolo", "car", "automezzo", "gasolio", "diesel", "benzina"], // Aggiunto carburanti
            "Tasse": ["tasse", "tassa", "imposte", "imposta", "tributi", "tributo", "f24"],
            "Commercialista": ["commercialista", "commerciale", "contabile", "ragioniere"],
            "Spese Casa": ["spese casa", "casa", "affitto", "utenze", "bollette", "domestico", "domestica"],
            "Magazzino": ["magazzino", "magazino", "deposito", "scorta", "scorte"],
            "Extra": ["extra", "varie", "vario", "altro", "diverso"] // Extra rimane come fallback
        };
        for (const [categoriaStandard, varianti] of Object.entries(categorieMap)) {
            for (const variante of varianti) {
                // Usiamo regex con word boundary (\b) per matchare parole intere dove possibile
                const regex = new RegExp(`\\b${variante}\\b`, 'i'); // Case-insensitive
                if (text.match(regex)) {
                    newItem.categoria = categoriaStandard;
                    break;
                }
            }
            if (newItem.categoria) break; // Trovata categoria, esci dal loop principale
        }

        // --- Importo (come prima) ---
        let importo = "0.00";
        // Regex migliorata per catturare numeri con . o , come separatore decimale e opzionalmente €
        const importoRegex = /(\d+([.,]\d{1,2})?)\s*(euro|€)?|(euro|€)\s*(\d+([.,]\d{1,2})?)/i;
        const matchImporto = text.match(importoRegex);
        if (matchImporto) {
            // Prendi il gruppo che contiene il numero (o il primo o il quinto)
            const numStr = matchImporto[1] || matchImporto[5];
            if (numStr) {
                 importo = numStr.replace(',', '.'); // Normalizza a punto decimale
            }
        }
        newItem.importo = importo;

        // --- Descrizione raffinata ---
        let refinedDescription = text;
        // Rimuovi le parole chiave del tipo trovate
        if (newItem.tipo === "Spesa") {
             paroleSpesa.forEach(keyword => {
                 const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                 refinedDescription = refinedDescription.replace(regex, '');
             });
        } else if (newItem.tipo === "Entrata") {
             paroleEntrata.forEach(keyword => {
                 const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                 refinedDescription = refinedDescription.replace(regex, '');
             });
        }
        // Rimuovi le parole chiave della categoria trovata
        if (newItem.categoria && categorieMap[newItem.categoria]) {
             categorieMap[newItem.categoria].forEach(keyword => {
                 const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
                 refinedDescription = refinedDescription.replace(regex, '');
             });
        }
        // Rimuovi l'importo trovato (con o senza euro)
        if (matchImporto) {
             refinedDescription = refinedDescription.replace(matchImporto[0], ''); // Rimuovi l'intera occorrenza trovata
        }
        // Pulisci spazi extra e trim
        refinedDescription = refinedDescription.replace(/\s+/g, ' ').trim();
        // Se la descrizione raffinata è vuota, usa quella originale meno pulita
        newItem.descrizione = refinedDescription || text.replace(/\s+/g, ' ').trim();

        // Se il tipo è ancora "Non definito", ma c'è un importo, prova a dedurlo
        if (newItem.tipo === "Non definito" && newItem.importo !== "0.00") {
             // Logica euristica: se non ci sono parole chiave di entrata, assumi spesa
             let isEntrata = false;
             for (const parola of paroleEntrata) {
                 if (text.toLowerCase().includes(parola)) {
                     isEntrata = true;
                     break;
                 }
             }
             if (!isEntrata) {
                 newItem.tipo = "Spesa";
                 console.log("Tipo dedotto come 'Spesa' per mancanza di parole chiave entrata.");
             }
             // Altrimenti rimane "Non definito" e verrà gestito da Apps Script
        }


        console.log("Dati estratti:", newItem);
        return newItem;
    }

    // Rimuovi "(MODALITÀ FORM DATA PER TEST)" dai log
    function inviaDatiAlFoglio(data) {
        console.log("Invio dati al foglio:", data); // Log pulito

        // Converti l'oggetto dati in parametri URL encoded
        const formData = new URLSearchParams();
        formData.append('type', data.type); // Invia il tipo così com'è (potrebbe essere "NON DEFINITO")
        formData.append('importo', data.importo);
        formData.append('categoria', data.categoria || '');
        formData.append('descrizione', data.descrizione || '');

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
                statusP.textContent = "✅ Dati inviati e salvati nel foglio!";
            } else {
                // Mostra l'errore specifico restituito da Apps Script
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