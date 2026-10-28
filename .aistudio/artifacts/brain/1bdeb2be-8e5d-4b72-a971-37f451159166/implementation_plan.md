# Sistem za Radne Naloge i Upravljanje Magacinom Materijala

Sveobuhvatna radionička aplikacija za izdavanje radnih naloga, preciznu dodjelu poslova radnicima (Stefan i Draško), automatsko razduživanje zaliha materijala (uključujući kubne metre - m³), te administratorski uvid u utrošak i vrijeme izrade po proizvodu.

### Korisnički pregled i ključne odluke

> [!IMPORTANT]
> Aplikacija implementira strogo razdvajanje prava pristupa prema definisanim korisničkim nalozima:
> - **admin / admin**: Potpuna kontrola — kreiranje i brisanje radnih naloga, unos, izmjena i brisanje materijala u skladištu, uvid u ukupne zalihe, istoriju razduživanja materijala i zbirne izvještaje o utrošenom vremenu i materijalima po proizvodima.
> - **Stefan1 / Stefan123**: Radnički pristup — vidi isključivo naloge u kojima je označen (stikliran), bilježi utrošak materijala (koji automatski skida stanje iz baze) i upisuje utrošeno vrijeme (sati i minute).
> - **Drasko1 / Drasko456**: Radnički pristup — vidi isključivo svoje naloge, vrši razduživanje materijala i unosi radne sate za dodijeljeni posao.

- **Potvrđeno (Tip proizvodnje)**: Univerzalna proizvodnja sa prilagođenim materijalima (drvo/građa sa m³, bravarija, opšti elementi).
- **Potvrđeno (Evidencija vremena)**: Unos ukupnog broja radnih sati i minuta utrošenih na nalogu uz datum i opis obavljene faze.
- **Potvrđeno (Dodjela naloga)**: Nalog se dodjeljuje jednom ili više radnika stikliranjem (checkbox izbor: Stefan, Draško). Radnik vidi nalog čim je označen.

---

### 1. Pregled i osnovni koncept

- **Namjena aplikacije**: Centralizovano vođenje proizvodnih radnih naloga u radionici, sprečavanje neovlaštenog pristupa podacima i automatsko praćenje stanja zaliha u realnom vremenu bez ručnog prebrojavanja.
- **Ciljni korisnici**:
  - *Poslovođa / Administrator*: Kreira zadatke, prati zalihe materijala, ima uvid u troškove i trajanje proizvodnje svakog proizvoda.
  - *Radnici na mašinama i montaži*: Pregledaju svoje aktivne zadatke bez uvida u tuđe naloge i cjelokupnu bazu magacina, unose tačan utrošak nakon završetka posla.
- **Ključna vrijednost**: Utrošeni materijal se istog trenutka oduzima od glavnog stanja u magacinu. Admin tačno zna koji radnik je, kada i za koji proizvod potrošio materijal (npr. 0.35 m³ građe i 50 komada spojnica), uz tačno trajanje izrade.

---

### 2. Korisničko iskustvo i vizuelni dizajn

- **Korisnički tokovi**:
  1. *Prijava (Login)*: Jednostavna i brza prijava sa predefinisanim korisnicima (`admin`, `Stefan1`, `Drasko1`) uz opciju brzog odabira profila za testiranje.
  2. *Admin pregled*:
     - **Glavna tabela radnih naloga**: Prikaz svih naloga, statusi (*Na čekanju*, *U izradi*, *Završeno*), označeni radnici, dugmad za novi nalog, izmjenu i brisanje.
     - **Magacin / Baza materijala**: Tabela stanja sa nazivom, šifrom, jedinicom mjere (posebno istaknut **m³**, uz kom, kg, m, m², l), trenutnom količinom i pragom niske zalihe. Samo admin ima dugmad *Dodaj materijal*, *Uredi zalihu* i *Obriši*.
     - **Izvještaji i kartica utroška**: Hronološki i tabelarni pregled razduženog materijala po proizvodu i radniku, sa filtriranjem po nalogu i datumu.
  3. *Radnički pregled (Stefan / Draško)*:
     - Kartice i tabela samo njihovih dodijeljenih naloga (nema pristupa tuđim nalozima niti bazi materijala).
     - Forma: *"Evidentiraj utrošak materijala i radno vrijeme"* — bira materijal iz baze (prikazuje se naziv i jedinica mjere npr. m³), upisuje količinu, unosi broj sati i minuta i po želji mijenja status svog posla.
     - Potvrda unosa automatski umanjuje količinu u bazi i dodaje stavku u administratorski izvještaj.

- **Vizuelni identitet i estetika**:
  - *Stil*: Industrijski radionički ERP dizajn visoke preglednosti i čistoće (SaaS Dashboard prema smjernicama).
  - *Paleta boja*: Tamni škriljac / tamno plavi akcenti (`#0F172A`, `#1E293B`), neutralna radna površina (`#F8FAFC`), kontrastni plavi akcenti (`#2563EB`) za primarne akcije, smaragdno zelena (`#16A34A`) za završene poslove i stabilne zalihe, te upozoravajuća ćilibarna (`#D97706`) za niske zalihe.
  - *Tipografija*: `Plus Jakarta Sans` za strukturu i naslove, u kombinaciji sa `font-mono tabular-nums` za sve brojeve, dimenzije u m³, radne sate i šifre naloga.
  - *Pravila*: Bez suvišnih ukrasnih pilula i neaktivnih kontrola; čista tabelarna poravnanja (brojevi desno, nazivi lijevo).

---

### 3. Ključne tehničke odluke

- **Model autentifikacije**:
  - *Izbor*: Klijentsko upravljanje sesijom sa ulogama (`admin`, `worker`) i verifikacijom lozinki (`admin/admin`, `Stefan1/Stefan123`, `Drasko1/Drasko456`).
  - *Razlog*: Odmah spremno za rad u AI Studio okruženju, jednostavno testiranje uloga bez potrebe za eksternim serverom, uz trenutno prebacivanje sesija.
- **Perzistencija podataka i stanje magacina**:
  - *Izbor*: Strukturirano lokalno skladište (`localStorage`) sa mehanizmom automatske sinhronizacije i početnim realističnim podacima (nalozi za izradu namještaja/elemenata, materijali u m³, kg i kom).
  - *Razlog*: Podaci ostaju sačuvani pri osvježavanju stranice; skidanje materijala je transakciono sigurno (prije unosa se provjerava raspoloživost i odmah kalkuliše novo stanje).
- **Podrška za jedinicu m³ (kubni metar)**:
  - Podrška za decimalne unose (npr. `0.045 m³` ili `1.2 m³`), uz precizno formatiranje na 3 decimale gdje je potrebno za drvnu građu i kubikažu.

---

### 4. Arhitektura sistema i dijagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Radni Nalozi & Magacin                          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
┌───────────────────────────┐                       ┌─────────────────────┐
│  Administrator (admin)    │                       │  Radnici (Stefan,   │
│  - Glavna tabela naloga   │                       │           Draško)   │
│  - Dodavanje / Brisanje   │                       │  - Samo moji nalozi │
│  - Baza materijala (m³)   │                       │  - Unos utroška     │
│  - Pregled utroška/vremena│                       │  - Unos sati/minuta │
└─────────────┬─────────────┘                       └──────────┬──────────┘
              │                                                │
              │         ┌─────────────────────────────┐        │
              └────────►│ Centralni Store (Upravljanje│◄───────┘
                        │ stanja i LocalStorage)      │
                        │ - Radni nalozi              │
                        │ - Magacin (Zalihe materijala)
                        │ - Dnevnik utroška & sati    │
                        └──────────────┬──────────────┘
                                       ▼
                        ┌─────────────────────────────┐
                        │ Automatsko skidanje zaliha  │
                        │ Novo_Stanje = Stanje - Utrošak
                        └─────────────────────────────┘
```

#### Glavni entiteti podataka:
- `User`: `{ id, username, fullName, role: 'admin' | 'worker', avatar }`
- `WorkOrder`: `{ id, orderNumber, title, description, assignedWorkerUsernames: string[], status: 'pending'|'in_progress'|'completed', priority, createdAt, dueDate }`
- `Material`: `{ id, code, name, unit: 'm³' | 'kom' | 'kg' | 'm' | 'm²' | 'l', currentStock, minStock, description }`
- `ConsumptionLog`: `{ id, workOrderId, workOrderTitle, workerUsername, workerName, materialId, materialName, quantity, unit, hoursSpent, minutesSpent, note, timestamp }`

---

### Koraci verifikacije nakon odobrenja:
1. Provjera prijave za sva 3 korisnika sa zadatim šiframa.
2. Provjera da admin može kreirati i brisati radne naloge i materijale sa jedinicom m³.
3. Provjera da Stefan vidi samo naloge dodijeljene Stefanu, a Draško samo naloge dodijeljene Drašku.
4. Provjera da unos utroška od strane radnika automatski umanjuje količinu u bazi materijala i stvara zapis u administratorskom izvještaju sa utrošenim satima i minutama.
5. Provjera rada na računaru i mobilnom prikazu i verifikacija kroz `compile_applet`.
