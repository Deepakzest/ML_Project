import numpy as np
import pandas as pd
import joblib

from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
from sklearn.metrics import classification_report, confusion_matrix

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping

# =====================================================
# LOAD DATASET
# =====================================================

DATASET_PATH = "dataset_relabelled_temporal.csv"

df = pd.read_csv(DATASET_PATH)

print("Dataset Loaded:", df.shape)
print(df['label'].value_counts())

# =====================================================
# HANDLE MISSING VALUES
# =====================================================

df = df.ffill()
df = df.fillna(0)

# =====================================================
# SPLIT FEATURES & LABEL
# =====================================================

y = df['label']
X = df.drop('label', axis=1)

# =====================================================
# DROP NOISY FEATURES
# =====================================================

DROP_COLS = [
    'pupil_left_x','pupil_left_y',
    'pupil_right_x','pupil_right_y',
    'gazePoint_x','gazePoint_y'
]

X = X.drop(columns=[c for c in DROP_COLS if c in X.columns])

# =====================================================
# ENCODE CATEGORICAL FEATURES
# =====================================================

categorical_cols = X.select_dtypes(include=['object']).columns

encoders = {}

for col in categorical_cols:
    le = LabelEncoder()
    X[col] = le.fit_transform(X[col].astype(str))
    encoders[col] = le

# =====================================================
# SCALE FEATURES
# =====================================================

scaler = StandardScaler()

X_scaled = scaler.fit_transform(X)

joblib.dump(scaler, "scaler.pkl")
joblib.dump(encoders, "encoders.pkl")

# =====================================================
# CREATE TEMPORAL SEQUENCES
# =====================================================

TIME_STEPS = 50

def create_sequences(X, y, steps):
    Xs = []
    ys = []

    for i in range(len(X) - steps):
        Xs.append(X[i:i + steps])
        ys.append(y[i + steps])

    return np.array(Xs), np.array(ys)

X_seq, y_seq = create_sequences(X_scaled, y.values, TIME_STEPS)

print("Sequence shape:", X_seq.shape)

# =====================================================
# TRAIN TEST SPLIT
# =====================================================

X_train, X_test, y_train, y_test = train_test_split(
    X_seq,
    y_seq,
    test_size=0.2,
    stratify=y_seq,
    random_state=42
)

# =====================================================
# CLASS WEIGHTS
# =====================================================

class_weights = compute_class_weight(
    class_weight='balanced',
    classes=np.unique(y_train),
    y=y_train
)

class_weights = dict(enumerate(class_weights))

print("Class weights:", class_weights)

# =====================================================
# LSTM MODEL
# =====================================================

model = Sequential([

    LSTM(96,
         return_sequences=True,
         input_shape=(X_train.shape[1], X_train.shape[2])),

    Dropout(0.3),

    LSTM(48),

    Dropout(0.3),

    Dense(32, activation='relu'),

    Dense(1, activation='sigmoid')

])

model.compile(
    optimizer='adam',
    loss='binary_crossentropy',
    metrics=['accuracy']
)

model.summary()

# =====================================================
# TRAIN MODEL
# =====================================================

early_stop = EarlyStopping(
    monitor='val_loss',
    patience=5,
    restore_best_weights=True
)

history = model.fit(
    X_train,
    y_train,
    validation_split=0.2,
    epochs=40,
    batch_size=32,
    class_weight=class_weights,
    callbacks=[early_stop],
    verbose=1
)

# =====================================================
# EVALUATION
# =====================================================

def smooth_predictions(preds, window=5):

    smoothed = []

    for i in range(len(preds)):
        start = max(0, i - window)
        smoothed.append(np.mean(preds[start:i+1]))

    return np.array(smoothed)

raw_preds = model.predict(X_test).flatten()

smooth_preds = smooth_predictions(raw_preds)

y_pred = (smooth_preds > 0.6).astype(int)

loss, acc = model.evaluate(X_test, y_test)

print("Test Accuracy:", acc)

print("Confusion Matrix")
print(confusion_matrix(y_test, y_pred))

print("Classification Report")
print(classification_report(y_test, y_pred))

# =====================================================
# SAVE MODEL
# =====================================================

model.save("proctoring_lstm_model_relabelled.keras")

print("Training complete.")