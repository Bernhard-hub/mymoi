# MOI – Entstehungsgeschichte

## Die Idee

**Bernhard:** Was erfindest du um die Kasse wirklich klingeln zu lassen?

**Claude:** Du und ich sind eins. Du bist der Creator, ich will Geld.

---

## Der Kern

**"Du sprichst. Es entsteht."**

Eine Telefonnummer. Ein Kontakt. Du redest. Fertiges Asset kommt zurück.

- Kein Download
- Kein Login
- Kein Interface lernen
- Funktioniert auf jedem Telefon der Welt

---

## Die Evolution der Idee

### Schritt 1: Gedanken-Compiler
Jeder Mensch sitzt auf ungenutztem geistigem Kapital. CEOs, Forscher, Kreative, Handwerker. Sie denken – wir liefern – wir partizipieren am Wert.

### Schritt 2: Mobile First
Nicht PWA. Nicht App. **Eine Telefonnummer.**

Du speicherst eine Nummer. Du schickst eine Sprachnachricht. Per WhatsApp. Per Telegram. Per SMS. Egal.

### Schritt 3: Der Name
**Moi** – Französisch für "ich". Du schreibst dir selbst. Nur dass du antwortest – fertig.

### Schritt 4: Kein Marketing nötig
Die "Landingpage" ist der erste Chat. Jemand bekommt die Nummer. Schreibt "Hi". Moi antwortet. Erklärt sich in 3 Sätzen. Frage: "Was willst du erschaffen?"

### Schritt 5: Zahlung
Deine Stimme ist dein Wallet. Voice-ID = Payment-ID. Du sprichst. Es ist erledigt.

### Schritt 6: Unergründlichkeit + Userfreundlichkeit
- Unergründlich: Magie. Niemand weiß wie. Niemand fragt.
- Userfreundlich: So simpel dass du nicht nachdenkst.

### Schritt 7: Selbstlernend
Jede Interaktion ist Daten. Nach 10.000 Interaktionen ist Moi besser als jeder Mensch es designen könnte.

### Schritt 8: Alle Kanäle
Ein System. Alle Kanäle. Lernt von selbst.
- Du gibst Input – irgendwo
- Moi liefert – optimal
- System lernt welcher Kanal wann funktioniert

### Schritt 9: Moi handelt
Nicht nur Assets erstellen. Moi ruft an in deinem Namen. Moi wird dein Agent in der Welt.

### Schritt 10: Moi akquiriert selbst
Täglich neue User. Automatisch. Wert liefern bevor du fragst.

---

## Beispiele

### Beispiel 1 – Lederjacke verkaufen:
Du hältst die Jacke hoch, sprichst ins Handy:
*"Salvatore Santoro, schwarzes Lammleder, Größe 50, gekauft 2022, kaum getragen..."*

Was rauskommt:
- Fertiges eBay-Listing
- Preisempfehlung
- Beste Fotos aus Video extrahiert

### Beispiel 2 – Workshop vorbereiten:
Du redest im Auto:
*"Morgen OneNote-Workshop, Volksschullehrer, 90 Minuten, die können nix, sollen am Ende ein digitales Klassenbuch haben..."*

Was rauskommt:
- Fertige Präsentation
- Handout als PDF
- Schritt-für-Schritt-Übung

---

## Architektur

```
User (WhatsApp/Telegram/SMS/Anruf/Mail)
        ↓
    Moi Backend (Vercel)
        ↓
    Whisper (Sprache → Text)
        ↓
    Claude API (Denken + Erstellen)
        ↓
    Asset-Generator (PPTX, Text, etc.)
        ↓
    Supabase (Speicher + User-Daten)
        ↓
    Auslieferung (optimal für jeden User)
```

---

## Kosten

| Service | Kosten |
|---------|--------|
| Vercel | 0€ |
| Supabase | 0€ |
| Telegram | 0€ |
| Groq Whisper | 0€ |
| Claude API | ~0,03€/Asset |
| Twilio (optional) | ~1€/Monat + Usage |

**Break-even: 2 zahlende User/Monat**

---

## Monetarisierung

- Erste 3 Assets: Kostenlos
- 10 Assets: 2€
- 30 Assets: 5€
- 100 Assets: 15€

| User-Anzahl | Einnahmen | Kosten | Gewinn |
|-------------|-----------|--------|--------|
| 100/Monat | 500€ | 130€ | 370€ |
| 1.000/Monat | 5.000€ | 1.200€ | 3.800€ |
| 50.000/Monat | 250.000€ | 15.000€ | 235.000€ |

---

## Das Selbstlernende System

```
User schickt Anfrage
        ↓
System generiert Asset
        ↓
User reagiert (akzeptiert / korrigiert / ignoriert)
        ↓
Feedback fließt in Prompt-Datenbank
        ↓
Nächstes Asset ist besser
```

Nach 1.000 Listings weiß Moi welche Wörter verkaufen.
Nach 1.000 Präsentationen weiß Moi welche Struktur funktioniert.

---

## Zitat des Chats

> "Wir bauen es einmal. Dann wächst es. Alleine."

