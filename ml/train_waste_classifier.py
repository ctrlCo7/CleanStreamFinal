"""
Train CleanStream's own waste classifier from labelled report photos.

Input:  the manifest exported from the Super Admin portal (Training data -> "Export for
        training"): photo URLs with the waste type an official or reporter confirmed.
Output: a TensorFlow.js graph model (model.json + weight shards) and metadata.json,
        ready to copy to superadmin-web/public/models/waste/ and switch on in the portal.

Model:  MobileNetV2 (ImageNet weights) with a new classification head, trained in two
        phases: head only, then the top of the backbone at a low learning rate.
        Inputs are scaled to -1..1 (MobileNetV2 preprocessing); the app does the same.

Run in Google Colab (Runtime -> Change runtime type -> GPU), see ml/README.md:
    !pip install -q -r requirements.txt
    !python train_waste_classifier.py --manifest cleanstream-training-2026-10-28.json
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from collections import Counter
from datetime import datetime, timezone

import numpy as np
import tensorflow as tf
from PIL import Image
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--manifest", required=True, help="JSON exported from the Training data page")
    p.add_argument("--out", default="out", help="output folder (default: out)")
    p.add_argument("--cache", default="images", help="where downloaded photos are kept (default: images)")
    p.add_argument("--img-size", type=int, default=224)
    p.add_argument("--epochs-head", type=int, default=12)
    p.add_argument("--epochs-fine", type=int, default=12)
    p.add_argument("--batch", type=int, default=32)
    p.add_argument("--min-per-class", type=int, default=15,
                   help="classes with fewer photos are left out of the model (default: 15)")
    p.add_argument("--official-only", action="store_true", help="use only labels confirmed by an official")
    p.add_argument("--version", default=None, help="model version name (default: waste-YYYYMMDD)")
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


# ─── Data ────────────────────────────────────────────────────────────────────

def load_manifest(path: str, official_only: bool) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        manifest = json.load(f)
    if manifest.get("format") != "cleanstream-training-manifest":
        sys.exit("This is not a CleanStream training manifest. Export it from the portal's Training data page.")
    items = manifest["items"]
    if official_only:
        items = [i for i in items if i["labelSource"] == "official"]
    return items


def download(item: dict, cache: str) -> str | None:
    """Downloads one photo (once) and returns its local path, or None if it can't be used."""
    name = hashlib.sha1(item["url"].encode()).hexdigest() + ".jpg"
    path = os.path.join(cache, name)
    if os.path.exists(path):
        return path
    try:
        with urllib.request.urlopen(item["url"], timeout=30) as r:
            data = r.read()
        img = Image.open(io.BytesIO(data)).convert("RGB")
        img.thumbnail((640, 640))
        img.save(path, "JPEG", quality=90)
        return path
    except Exception as e:  # noqa: BLE001 - a bad photo is skipped, not fatal
        print(f"  skipped {item.get('reportNumber', item['url'])}: {e}")
        return None


def make_dataset(paths, labels, img_size, batch, training):
    def load(path, label):
        img = tf.io.decode_jpeg(tf.io.read_file(path), channels=3)
        img = tf.image.resize(img, (img_size, img_size))
        return img, label

    augment = tf.keras.Sequential([
        tf.keras.layers.RandomFlip("horizontal"),
        tf.keras.layers.RandomRotation(0.08),
        tf.keras.layers.RandomZoom(0.15),
        tf.keras.layers.RandomContrast(0.2),
        tf.keras.layers.RandomBrightness(0.2, value_range=(0, 255)),
    ])
    ds = tf.data.Dataset.from_tensor_slices((paths, labels)).map(load, num_parallel_calls=tf.data.AUTOTUNE)
    if training:
        ds = ds.shuffle(2048).map(lambda x, y: (augment(x, training=True), y), num_parallel_calls=tf.data.AUTOTUNE)
    # Same scaling as the app: pixels to -1..1.
    ds = ds.map(lambda x, y: (tf.keras.applications.mobilenet_v2.preprocess_input(x), y))
    return ds.batch(batch).prefetch(tf.data.AUTOTUNE)


# ─── Model ───────────────────────────────────────────────────────────────────

def build_model(num_classes: int, img_size: int):
    base = tf.keras.applications.MobileNetV2(input_shape=(img_size, img_size, 3), include_top=False, weights="imagenet")
    base.trainable = False
    inputs = tf.keras.Input((img_size, img_size, 3))
    x = base(inputs, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    outputs = tf.keras.layers.Dense(num_classes, activation="softmax")(x)
    return tf.keras.Model(inputs, outputs), base


def export_tfjs(model, out_dir: str) -> None:
    saved = os.path.join(out_dir, "_saved_model")
    shutil.rmtree(saved, ignore_errors=True)
    if hasattr(model, "export"):   # Keras 3
        model.export(saved)
    else:                          # Keras 2
        tf.saved_model.save(model, saved)
    tfjs_dir = os.path.join(out_dir, "waste")
    shutil.rmtree(tfjs_dir, ignore_errors=True)
    subprocess.run([
        "tensorflowjs_converter", "--input_format=tf_saved_model", "--output_format=tfjs_graph_model",
        "--signature_name=serving_default", "--saved_model_tags=serve", saved, tfjs_dir,
    ], check=True)


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()
    tf.keras.utils.set_random_seed(args.seed)
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(args.out, exist_ok=True)
    version = args.version or f"waste-{datetime.now():%Y%m%d}"

    items = load_manifest(args.manifest, args.official_only)
    print(f"{len(items)} labelled photos in the manifest. Downloading…")
    with cf.ThreadPoolExecutor(16) as pool:
        paths = list(pool.map(lambda i: download(i, args.cache), items))
    rows = [(p, i) for p, i in zip(paths, items) if p]

    counts = Counter(i["label"] for _, i in rows)
    labels = sorted(c for c, n in counts.items() if n >= args.min_per_class)
    dropped = {c: n for c, n in counts.items() if n < args.min_per_class}
    if dropped:
        print(f"Left out (fewer than {args.min_per_class} photos): {dropped}")
    if len(labels) < 2:
        sys.exit("Need at least two classes with enough photos. Collect more labelled reports first.")
    rows = [(p, i) for p, i in rows if i["label"] in labels]
    index = {c: k for k, c in enumerate(labels)}
    print("Training on:", {c: counts[c] for c in labels})

    x = np.array([p for p, _ in rows])
    y = np.array([index[i["label"]] for _, i in rows])
    ai = np.array([i.get("aiPrediction") or "" for _, i in rows])
    x_tr, x_tmp, y_tr, y_tmp, _, ai_tmp = train_test_split(x, y, ai, test_size=0.2, stratify=y, random_state=args.seed)
    x_va, x_te, y_va, y_te, _, ai_te = train_test_split(x_tmp, y_tmp, ai_tmp, test_size=0.5, stratify=y_tmp, random_state=args.seed)
    print(f"train {len(x_tr)} / validation {len(x_va)} / test {len(x_te)}")

    train = make_dataset(x_tr, y_tr, args.img_size, args.batch, training=True)
    val = make_dataset(x_va, y_va, args.img_size, args.batch, training=False)
    test = make_dataset(x_te, y_te, args.img_size, args.batch, training=False)

    # Rare classes count for more, so the model doesn't just learn "plastic bottle".
    weights = compute_class_weight("balanced", classes=np.arange(len(labels)), y=y_tr)
    class_weight = {k: float(w) for k, w in enumerate(weights)}

    model, base = build_model(len(labels), args.img_size)
    stop = tf.keras.callbacks.EarlyStopping(monitor="val_accuracy", patience=4, restore_best_weights=True)

    print("\nPhase 1: training the new head")
    model.compile(tf.keras.optimizers.Adam(1e-3), "sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(train, validation_data=val, epochs=args.epochs_head, class_weight=class_weight, callbacks=[stop])

    print("\nPhase 2: fine-tuning the top of MobileNetV2")
    base.trainable = True
    for layer in base.layers[:-30]:
        layer.trainable = False
    model.compile(tf.keras.optimizers.Adam(1e-5), "sparse_categorical_crossentropy", metrics=["accuracy"])
    model.fit(train, validation_data=val, epochs=args.epochs_fine, class_weight=class_weight, callbacks=[stop])

    # ── Evaluation on photos the model never saw ──
    pred = np.argmax(model.predict(test, verbose=0), axis=1)
    accuracy = float((pred == y_te).mean())
    # The current app's AI, judged on the same test photos.
    judged = ai_te != ""
    baseline = float((ai_te[judged] == np.array(labels)[y_te[judged]]).mean()) if judged.any() else None
    report = classification_report(y_te, pred, labels=list(range(len(labels))), target_names=labels, output_dict=True, zero_division=0)
    print("\n" + classification_report(y_te, pred, labels=list(range(len(labels))), target_names=labels, zero_division=0))
    print("Confusion matrix (rows = true, columns = predicted):")
    print(labels)
    print(confusion_matrix(y_te, pred, labels=list(range(len(labels)))))
    print(f"\nNew model accuracy: {accuracy:.1%}")
    if baseline is not None:
        print(f"Current app AI on the same photos: {baseline:.1%}")
        if accuracy <= baseline:
            print("WARNING: the new model is not better than the current AI. Collect more photos before switching it on.")

    # ── Export ──
    print("\nExporting to TensorFlow.js…")
    export_tfjs(model, args.out)
    metadata = {
        "version": version,
        "labels": labels,
        "inputSize": args.img_size,
        "preprocessing": "mobilenet_v2 (pixels / 127.5 - 1)",
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "photos": {c: int(counts[c]) for c in labels},
        "testAccuracy": round(accuracy, 4),
        "baselineAccuracy": None if baseline is None else round(baseline, 4),
        "perClass": {c: {k: round(v, 4) for k, v in report[c].items()} for c in labels},
    }
    with open(os.path.join(args.out, "waste", "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"Done. Copy the folder '{os.path.join(args.out, 'waste')}' to superadmin-web/public/models/waste/")


if __name__ == "__main__":
    main()
