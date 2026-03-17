import pandas as pd
import numpy as np

# Load dataset
df = pd.read_csv("Students suspicious behaviors detection dataset_V1.csv")

WINDOW = 30     # frames
THRESHOLD = 0.6 # 60%

labels = df['label'].values
new_labels = labels.copy()

for i in range(len(labels)):
    start = max(0, i - WINDOW // 2)
    end = min(len(labels), i + WINDOW // 2)

    window_labels = labels[start:end]

    if np.mean(window_labels) >= THRESHOLD:
        new_labels[i] = 1
    else:
        new_labels[i] = 0

df['label'] = new_labels

df.to_csv("dataset_relabelled_temporal.csv", index=False)

print("Relabeling done.")