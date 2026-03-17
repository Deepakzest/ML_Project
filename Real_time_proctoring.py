import os
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"

import cv2
import numpy as np
import pandas as pd
import mediapipe as mp
import joblib
import tensorflow as tf
import json
import datetime
import threading

from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ultralytics import YOLO

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATUS_PATH = os.path.join(BASE_DIR, "live_status.json")
FRONTEND_STATUS_PATH = os.path.join(BASE_DIR, "coding-assessment-frontend", "public", "live_status.json")
latest_status = {
    "persons": 0,
    "faces": 0,
    "face_present": False,
    "multiple_faces": False,
    "phone_detected": False,
    "book_detected": False,
    "looking_away": False,
    "score": 0.0,
    "status": "INITIALIZING",
    "severity": "LOW"
}

def write_status_file(payload):
    global latest_status
    latest_status = payload
    for p in (STATUS_PATH, FRONTEND_STATUS_PATH):
        try:
            with open(p, "w") as f:
                json.dump(payload, f)
        except Exception:
            pass

# =====================================================
# LOAD MODEL
# =====================================================

# The model was saved with Keras 3; we reconstruct the architecture
# in Keras 2 and manually map weights to avoid naming convention differences.
import zipfile, tempfile, shutil, h5py

def _load_model_compat(path):
    model = tf.keras.Sequential([
        tf.keras.layers.LSTM(96, return_sequences=True, input_shape=(50, 31)),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.LSTM(48, return_sequences=False),
        tf.keras.layers.Dropout(0.3),
        tf.keras.layers.Dense(32, activation="relu"),
        tf.keras.layers.Dense(1, activation="sigmoid"),
    ])
    # Build so layers have weights allocated
    model.build((None, 50, 31))

    tmp_dir = tempfile.mkdtemp()
    try:
        with zipfile.ZipFile(path) as z:
            z.extract("model.weights.h5", tmp_dir)

        # Keras 3 stores weights as layers/<name>/cell/vars/0,1,2 for LSTM
        # and layers/<name>/vars/0,1 for Dense.  Map them in order.
        with h5py.File(f"{tmp_dir}/model.weights.h5", "r") as f:
            # On Windows, Keras 3 saves HDF5 keys with backslash separators
            # as flat root-level names (e.g. r"layers\lstm\cell"), not nested groups.
            sep = "\\" if r"layers\lstm\cell" in f else "/"
            lstm0_cell = f[f"layers{sep}lstm{sep}cell"]["vars"]
            lstm1_cell = f[f"layers{sep}lstm_1{sep}cell"]["vars"]
            dense0 = f[f"layers{sep}dense"]["vars"]
            dense1 = f[f"layers{sep}dense_1"]["vars"]

            model.layers[0].set_weights([
                lstm0_cell["0"][()], lstm0_cell["1"][()], lstm0_cell["2"][()]
            ])
            model.layers[2].set_weights([
                lstm1_cell["0"][()], lstm1_cell["1"][()], lstm1_cell["2"][()]
            ])
            model.layers[4].set_weights([dense0["0"][()], dense0["1"][()]])
            model.layers[5].set_weights([dense1["0"][()], dense1["1"][()]])
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    return model

model = _load_model_compat(os.path.join(BASE_DIR, "proctoring_lstm_model_relabelled.keras"))

scaler = joblib.load(os.path.join(BASE_DIR, "scaler.pkl"))

FEATURE_COLUMNS = list(scaler.feature_names_in_)

TIME_STEPS = 50
BASE_THRESHOLD = 0.6

SMOOTH_WINDOW = 10

conf_buffer = deque(maxlen=SMOOTH_WINDOW)
sequence = deque(maxlen=TIME_STEPS)

# =====================================================
# YOLO
# =====================================================

yolo = YOLO(os.path.join(BASE_DIR, "yolov8n.pt"))

# =====================================================
# MEDIAPIPE
# =====================================================

mp_face = mp.solutions.face_mesh
mp_hands = mp.solutions.hands

face_mesh = mp_face.FaceMesh(refine_landmarks=True)
hands = mp_hands.Hands()

# =====================================================
# FEATURE EXTRACTION
# =====================================================

def extract_features(frame):

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    face_result = face_mesh.process(rgb)
    hand_result = hands.process(rgb)

    features = dict.fromkeys(FEATURE_COLUMNS, 0.0)

    face_count = 0
    looking_away = False

    if face_result.multi_face_landmarks:

        face_count = len(face_result.multi_face_landmarks)

        lm = face_result.multi_face_landmarks[0].landmark

        nose = lm[1]
        left_eye = lm[33]
        right_eye = lm[263]
        mouth = lm[13]

        features['face_present'] = 1
        features['face_x'] = nose.x
        features['face_y'] = nose.y
        features['face_w'] = abs(left_eye.x - right_eye.x)
        features['face_h'] = abs(mouth.y - nose.y)

        eye_center_x = (left_eye.x + right_eye.x) / 2
        face_width = max(abs(left_eye.x - right_eye.x), 1e-6)
        yaw_ratio = abs(nose.x - eye_center_x) / face_width

        features['head_yaw'] = yaw_ratio

        looking_away = yaw_ratio > 0.18
        features['gaze_direction'] = 1 if looking_away else 0
        features['gaze_on_script'] = 1 - features['gaze_direction']

    if hand_result.multi_hand_landmarks:

        features['hand_count'] = len(hand_result.multi_hand_landmarks)
        features['hand_obj_interaction'] = 1

    features['phone_present'] = 0

    return [features[col] for col in FEATURE_COLUMNS], {
        "face_count": face_count,
        "looking_away": looking_away,
    }

# =====================================================
# OBJECT DETECTION
# =====================================================

def detect_objects(frame):

    results = yolo(frame, verbose=False, conf=0.10, iou=0.4, imgsz=640)

    phone = False
    book = False
    person_count = 0

    for r in results:
        for box in r.boxes:

            cls = yolo.names[int(box.cls[0])]

            if cls == "cell phone":
                phone = True

            if cls in ["book","notebook"]:
                book = True

            if cls == "person":
                person_count += 1

    return phone, book, person_count

# =====================================================
# WEBCAM
# =====================================================

# =====================================================
# FRAME ANALYSIS  (called by the POST /analyze handler)
# =====================================================

state_lock = threading.Lock()

def analyze_frame(frame):
    """Process one BGR frame; update latest_status and return the result dict."""
    phone_detected, book_detected, person_count = detect_objects(frame)
    feature_vector, face_info = extract_features(frame)

    face_count   = face_info["face_count"]
    face_present = face_count > 0
    # Use both face landmarks and YOLO person boxes for robust multi-person detection.
    multiple_faces = (face_count > 1) or (person_count > 1)
    looking_away   = face_info["looking_away"]

    feature_df     = pd.DataFrame([feature_vector], columns=FEATURE_COLUMNS)
    feature_scaled = scaler.transform(feature_df)

    with state_lock:
        sequence.append(feature_scaled.flatten())

        det_status   = "Collecting..."
        smoothed_conf = 0.0

        if len(sequence) == TIME_STEPS:
            X = np.array(sequence).reshape(1, TIME_STEPS, -1)
            raw_conf = 1.0 - float(model.predict(X, verbose=0)[0][0])
            conf_buffer.append(raw_conf)
            smoothed_conf = sum(conf_buffer) / len(conf_buffer)
            smoothed_conf = min(smoothed_conf * 1.7, 0.85)
            det_status = "SUSPICIOUS" if smoothed_conf > BASE_THRESHOLD else "NORMAL"

        if phone_detected or book_detected or multiple_faces or not face_present or looking_away:
            smoothed_conf = max(smoothed_conf, 0.75)

        if   smoothed_conf < 0.6:  level = "LOW"
        elif smoothed_conf < 0.75: level = "MEDIUM"
        else:                      level = "HIGH"

        result = {
            "persons":        person_count,
            "faces":          face_count,
            "face_present":   face_present,
            "multiple_faces": multiple_faces,
            "phone_detected": phone_detected,
            "book_detected":  book_detected,
            "looking_away":   looking_away,
            "score":          round(smoothed_conf, 2),
            "status":         det_status,
            "severity":       level,
        }

    write_status_file(result)

    if det_status == "SUSPICIOUS":
        print({
            "time":       datetime.datetime.now().strftime("%H:%M:%S"),
            "confidence": round(smoothed_conf, 2),
            "severity":   level,
        })

    return result

# =====================================================
# HTTP SERVER  — handles GET /live-status and POST /analyze
# =====================================================

import base64

class ProctorHandler(BaseHTTPRequestHandler):
    """Single handler replacing StatusHandler; also accepts frame POSTs."""

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/live-status"):
            with state_lock:
                payload = json.dumps(latest_status).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if not self.path.startswith("/analyze"):
            self.send_response(404)
            self.end_headers()
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            data   = json.loads(self.rfile.read(length))
            img_bytes = base64.b64decode(data["frame"])
            nparr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None:
                raise ValueError("Could not decode frame image")

            result  = analyze_frame(frame)
            payload = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            print(f"[ANALYZE ERROR] {exc}")
            err = json.dumps({"error": str(exc)}).encode()
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)

    def log_message(self, format, *args):  # silence access logs
        return


# =====================================================
# ENTRY POINT
# =====================================================

if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 5001), ProctorHandler)
    print("[PROCTOR SERVER] Listening on http://127.0.0.1:5001")
    print("[PROCTOR SERVER]   GET  /live-status  — latest detection state")
    print("[PROCTOR SERVER]   POST /analyze      — send {frame:<base64-jpeg>}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[PROCTOR SERVER] Shutting down...")
        server.shutdown()