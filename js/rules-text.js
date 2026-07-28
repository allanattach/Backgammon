(function (root) {
  'use strict';
  root.BgRulesText = `
    <h3>Målet med spillet</h3>
    <p>Hver spiller har 15 brikker. Målet er at flytte alle sine brikker rundt om brættet og ind i sit eget hjemmefelt, og derefter bære dem af brættet, før modstanderen gør det samme.</p>

    <h3>Opstilling og retning</h3>
    <p>Hvid flytter sine brikker fra felt 24 mod felt 1. Sort flytter sine brikker fra felt 1 mod felt 24. Hvids hjemmefelt er felterne 1-6, Sorts hjemmefelt er felterne 19-24.</p>

    <h3>Terninger og træk</h3>
    <p>Spillerne skiftes til at slå to terninger og flytte brikker svarende til de to tal. Man kan flytte én brik to gange (summen af begge tal), eller to forskellige brikker – én gang for hvert tal.</p>
    <p><strong>Slår man dublet</strong> (samme tal på begge terninger), skal man spille det tal <em>fire</em> gange i stedet for to.</p>
    <p><strong>Man er forpligtet til at bruge begge terninger</strong>, hvis det er muligt. Hvis kun ét af tallene kan spilles – ikke begge – skal man spille det højeste tal, man kan. Hvis ingen af tallene kan spilles, mister man turen.</p>

    <h3>Blokerede felter</h3>
    <p>Et felt med to eller flere af modstanderens brikker er blokeret – der kan ikke flyttes eller sættes brikker ind dér.</p>

    <h3>At slå en brik ("hit")</h3>
    <p>Ligger der kun én brik (en "blot") fra modstanderen på et felt, kan man slå den ved at flytte sin egen brik dertil. Den slåede brik sættes på baren.</p>

    <h3>Baren</h3>
    <p>Har man brikker på baren, <strong>skal</strong> de sættes ind i spillet igen, før man kan flytte andre brikker. Brikker sættes ind i modstanderens hjemmefelt, svarende til øjnene på terningen. Er alle seks felter i modstanderens hjemmefelt blokerede, kan man ikke sætte ind og må stå over turen (kaldet at "danse").</p>

    <h3>Udtagning ("bearing off")</h3>
    <p>Når alle ens 15 brikker er i ens eget hjemmefelt, må man begynde at bære dem af brættet. Et terningeslag, der matcher et felts nummer præcist, bærer en brik af det felt. Hvis terningetallet er højere end det højeste felt, man har en brik på, må man bære den brik af i stedet. Man kan også vælge at flytte en brik inden for hjemmefeltet i stedet for at bære af, hvis det er muligt.</p>

    <h3>Sådan vinder man</h3>
    <ul>
      <li><strong>Almindelig sejr:</strong> Modstanderen har allerede båret mindst én brik af.</li>
      <li><strong>Gammon (dobbelt):</strong> Modstanderen har ikke båret nogen brikker af endnu.</li>
      <li><strong>Backgammon (tredobbelt):</strong> Modstanderen har hverken båret nogen brikker af og har stadig en brik på baren eller i din vinderens hjemmefelt.</li>
    </ul>

    <h3>Fordoblingsterningen (valgfri)</h3>
    <p>Kan slås til på startskærmen. Det er en separat terning med tallene 2, 4, 8, 16, 32 og 64, der bruges til at forhøje indsatsen undervejs – ikke til at flytte brikker med.</p>
    <p>På sin egen tur, <strong>før</strong> man slår sine terninger, kan man i stedet tilbyde at fordoble indsatsen. Modstanderen skal så vælge:</p>
    <ul>
      <li><strong>Tage imod:</strong> Indsatsen fordobles, spillet fortsætter, og nu er det modstanderen, der ejer terningen – kun vedkommende må tilbyde den næste fordobling.</li>
      <li><strong>Afslå:</strong> Spillet slutter med det samme, og man taber til den indsats, terningen viste <em>før</em> fordoblingsforsøget.</li>
    </ul>
    <p>Gammon og backgammon ganger stadig den endelige (evt. fordoblede) indsats med hhv. 2 eller 3.</p>

    <h3>Bemærk</h3>
    <p>Denne udgave følger de officielle bevægelses- og udtagningsregler for backgammon.</p>
  `;
})(typeof window !== 'undefined' ? window : globalThis);
