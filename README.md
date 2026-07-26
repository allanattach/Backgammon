# Backgammon

En standalone backgammon-webapp bygget i almindelig HTML/CSS/JavaScript (ingen build-trin, ingen afhængigheder).

## Funktioner

- **2 spillere** på samme skærm, eller **spil mod computeren** (let/normal sværhedsgrad).
- Fuldt officielt regelsæt: bevægelse, slå brikker ("hit"), baren, blokerede felter, tvungen brug af begge terninger (og det højeste tal, hvis kun ét kan spilles), dubletter (4 træk), udtagning ("bearing off") med korrekt håndtering af over-slag, samt gammon/backgammon-sejre.
- **Regelhjælp:** forsøger du et ulovligt træk, forklarer appen præcis hvorfor (blokeret felt, brikker på baren, ikke alle brikker hjemme endnu osv.), og der er en fuld regelbog i appen ("Reglerne").
- Session-scoreboard og pip count, samt "fortryd træk" inden for egen tur.

Fordoblingsterningen (bruges i match-/pengespil) er ikke inkluderet — hvert spil afgøres for sig selv.

## Kør appen

Ingen build nødvendig. Start blot en simpel statisk webserver i mappen og åbn den i en browser:

```bash
npm start          # kører "python3 -m http.server 8080"
# åbn derefter http://localhost:8080
```

(Alternativt kan du åbne `index.html` direkte i browseren, eller bruge en anden statisk server efter eget valg.)

## Kør tests

Spillets regelmotor (`js/rules-engine.js`) har et sæt automatiske tests uden eksterne afhængigheder:

```bash
npm test
```

## Projektstruktur

- `js/rules-engine.js` – ren spillogik (opstilling, lovlige træk, tvungen terningebrug, sejrsbetingelser).
- `js/ai.js` – computermodstanderen (evaluerer alle lovlige trækrækker for hver terningeslag).
- `js/ui.js` – tegner brættet og håndterer klik.
- `js/app.js` – spilstyring, turnus, terningeslag, regelhjælp-beskeder.
- `js/rules-text.js` – den fulde danske regeltekst vist i "Reglerne"-dialogen.
- `test/` – automatiske tests af regelmotoren (`node --test test/`).
