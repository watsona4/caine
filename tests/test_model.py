import numpy as np

from caine.model import CharRNN, decode, encode


def test_fresh_model_is_random_not_pretrained():
    a = CharRNN(hidden_size=8, seed=1)
    b = CharRNN(hidden_size=8, seed=2)
    assert not np.allclose(a.Wxh, b.Wxh)
    assert not np.allclose(a.Wxh, 0)


def test_encode_decode_roundtrip():
    text = "Hello, CAINE!"
    assert decode(encode(text)) == text


def test_unknown_characters_map_to_unk_without_crashing():
    text = "hi ééé"
    assert len(encode(text)) == len(text)


def test_training_reduces_loss_on_repeated_text():
    model = CharRNN(hidden_size=16, seq_len=8, learning_rate=0.2, seed=0)
    text = "abcabcabcabcabcabcabcabc"
    first = model.train_on_text(text)
    last = first
    for _ in range(20):
        last = model.train_on_text(text)
    assert last < first


def test_train_on_text_too_short_returns_none():
    model = CharRNN(hidden_size=8, seed=0)
    assert model.train_on_text("a") is None
    assert model.train_on_text("") is None


def test_generate_returns_requested_length():
    model = CharRNN(hidden_size=8, seed=0)
    out = model.generate(prompt="hi", length=50, seed=0)
    assert len(out) == 50


def test_save_and_load_roundtrip(tmp_path):
    model = CharRNN(hidden_size=8, seed=0)
    model.train_on_text("abcabcabc")
    path = tmp_path / "state.npz"
    model.save(path)
    loaded = CharRNN.load(path)
    assert np.allclose(model.Wxh, loaded.Wxh)
    assert np.allclose(model.hprev, loaded.hprev)
