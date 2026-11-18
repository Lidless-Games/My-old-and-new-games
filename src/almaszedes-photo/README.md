# Almaszedés – fotós mód forrásai

AI-generált (fal.ai, FLUX1.1 [pro] ultra) nyers képek és a feldolgozó szkript, amely az `almaszedes/assets/img/` fájlokat készíti.

- `bg3_raw.jpg` – oldalnézeti almafasor + rét. A háttér: felső 16,7% levágva, 2,2486:1 arányra vágva, 1900×845-re méretezve, a fehér ég kékre színezve (bg4.jpg), majd `bg.jpg` / `bg_flash.jpg`.
  Fontos: a rét a kép kb. 52%-ánál kezdődik, mert a játék a legtávolabbi almát `groundY(0) = 470` (850-ből) magasságban teszi le.
- `apples.jpg` – piros, zöld, sárga alma fehér háttéren → háttérmentesítés (rembg, isnet-general-use), 100 px-es almák 134×134-es dobozban.
- `basin2.jpg` – kék műanyag tál → 324 px széles, 0,68-szorosra lapítva (széles, lapos tál), `basin0..3` töltöttségi fokozatok; `basinw0..3` a széles-lavór bónuszhoz (1,6× szélesebb tál, a benne lévő almák nem nyúlnak).
- `make_photo_assets.py` – a teljes feldolgozás (pip: pillow numpy rembg onnxruntime).

A madár fotós módban is a rajzolt madár.
