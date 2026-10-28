# Training CleanStream's own waste model

The app's built-in AI uses general-purpose models (COCO-SSD and MobileNetV2) that were
never trained on garbage in Cebu's rivers and canals. Every time a barangay official
verifies a report and confirms the waste type, or a reporter confirms it on the result
screen, CleanStream collects a labelled photo. This folder turns those photos into a
classifier trained on your own data.

## What you need

- At least **15 labelled photos per waste type** to include that type, and ideally
  **50+ per type** for a usable model. The portal's *Training data* page shows the counts.
- A Google account, for **Google Colab** (free GPU). Nothing has to be installed on your
  own computer.

## Steps

1. **Export the data.** In the Super Admin portal, open *Training data* and click
   *Export for training*. You get `cleanstream-training-YYYY-MM-DD.json`. Tick
   *Official labels only* first if you want only official-confirmed labels.

2. **Open Colab.** Go to colab.research.google.com, create a notebook and choose
   *Runtime → Change runtime type → T4 GPU*.

3. **Upload** `train_waste_classifier.py`, `requirements.txt` and the exported JSON
   (folder icon on the left → upload).

4. **Run** these in a cell:

   ```
   !pip install -q -r requirements.txt
   !python train_waste_classifier.py --manifest cleanstream-training-YYYY-MM-DD.json
   ```

   Training takes about 5–20 minutes depending on the number of photos.

5. **Check the results.** At the end the script prints:
   - accuracy per waste type and a confusion matrix (which types get mixed up),
   - the new model's accuracy on test photos it never saw, and
   - the **current app AI's accuracy on the same photos**.

   Only continue if the new model is clearly better. If it isn't, collect more labelled
   photos (especially for the types with low scores) and train again.

6. **Download** the `out/waste` folder (right-click → Download, or zip it first with
   `!zip -r waste.zip out/waste`). It contains `model.json`, `metadata.json` and
   `group1-shard*.bin` weight files.

7. **Deploy.** Copy the files into `superadmin-web/public/models/waste/`, then:

   ```
   cd superadmin-web
   npm run build
   cd ..
   npx firebase-tools deploy --only hosting
   ```

8. **Switch it on.** In the portal, open *System settings → Custom waste model*, tick
   *Use the model*, enter
   `https://cleanstream-b7942.web.app/models/waste/model.json` and a version name
   (e.g. `waste-20261028`), and save. Phones use it from their next analysis, with no app
   update needed. To roll back, untick it and save.

## How the app uses it

`src/services/customModel.ts` downloads the model once per app session and classifies
each report photo. When it is at least 55% sure, its answer is added to the detections
(or raises the confidence of a matching one). It never replaces hazard evidence from
warning symbols or label text. The result screen's model line then shows the version,
e.g. `COCO-SSD/MobileNetV2 + waste-20261028`.

## Notes

- This script hasn't been run against real CleanStream data yet, because there isn't
  enough labelled data. Expect to adjust epochs or `--min-per-class` on the first run.
- The model is a classifier: it names the main waste type in a photo. It doesn't draw
  boxes around items, so object counts and coverage still come from COCO-SSD.
- Retrain every few months as more reports are verified. Give each run a new
  `--version` so reports record which model analyzed them.
