"""The NotiCare Smishing byte-level CNN text classifier and its input encoder.

The encoder must match the app exactly (plugins/android/V3RiskEvaluator.kt, encode): take the
message's UTF-8 bytes, keep the first 256, add 1 to each byte (so 0 can mean padding), and pad
with zeros to 256 values.

Architecture (20,641 trainable parameters, same as the bundled V3 model):
  input 256 int32 -> Embedding 257x32 -> Conv1D 64 filters, kernel 5, ReLU
  -> global max pooling -> Dense 32 ReLU -> Dense 1 sigmoid (probability the message is a scam)
"""
import numpy as np

MAX_LENGTH = 256
VOCABULARY = 257  # 256 byte values + padding


def encode(text):
    values = np.frombuffer(text.encode('utf-8')[:MAX_LENGTH], dtype=np.uint8).astype(np.int32) + 1
    encoded = np.zeros(MAX_LENGTH, dtype=np.int32)
    encoded[: len(values)] = values
    return encoded


def encode_all(texts):
    return np.stack([encode(text) for text in texts]) if texts else np.zeros((0, MAX_LENGTH), dtype=np.int32)


def build_model(dropout=0.3):
    import tensorflow as tf

    inputs = tf.keras.Input(shape=(MAX_LENGTH,), dtype='int32', name='bytes')
    x = tf.keras.layers.Embedding(VOCABULARY, 32, name='byte_embedding')(inputs)
    x = tf.keras.layers.Conv1D(64, 5, activation='relu', name='byte_patterns')(x)
    x = tf.keras.layers.GlobalMaxPooling1D(name='strongest_pattern')(x)
    # Dropout only acts during training; it adds no parameters and is removed from the exported model.
    x = tf.keras.layers.Dropout(dropout, name='dropout')(x)
    x = tf.keras.layers.Dense(32, activation='relu', name='hidden')(x)
    outputs = tf.keras.layers.Dense(1, activation='sigmoid', name='scam_probability')(x)
    return tf.keras.Model(inputs, outputs, name='noticare_smishing_byte_cnn')
