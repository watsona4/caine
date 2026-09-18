"""A minimal, honestly-untrained character-level recurrent network.

No pretrained weights ship with this project. Every CharRNN starts from
random Gaussian noise and only ever learns from the text it is actually
shown, one exchange at a time, via truncated backpropagation through time.
"""

import numpy as np

PRINTABLE = "".join(chr(c) for c in range(32, 127)) + "\n\t"
UNK = "\x00"
VOCAB = PRINTABLE + UNK
CHAR_TO_IX = {c: i for i, c in enumerate(VOCAB)}
IX_TO_CHAR = {i: c for i, c in enumerate(VOCAB)}


def encode(text):
    return [CHAR_TO_IX.get(c, CHAR_TO_IX[UNK]) for c in text]


def decode(indices):
    return "".join(IX_TO_CHAR[i] for i in indices)


class CharRNN:
    """A single-layer tanh RNN with a softmax output head.

    Weights are randomly initialized and never seeded from a corpus --
    CAINE is "untrained" in the literal sense until you talk to it.
    """

    def __init__(self, hidden_size=128, seq_len=25, learning_rate=0.1, seed=None):
        vocab_size = len(VOCAB)
        rng = np.random.default_rng(seed)

        self.vocab_size = vocab_size
        self.hidden_size = hidden_size
        self.seq_len = seq_len
        self.learning_rate = learning_rate

        self.Wxh = rng.standard_normal((hidden_size, vocab_size)) * 0.01
        self.Whh = rng.standard_normal((hidden_size, hidden_size)) * 0.01
        self.Why = rng.standard_normal((vocab_size, hidden_size)) * 0.01
        self.bh = np.zeros((hidden_size, 1))
        self.by = np.zeros((vocab_size, 1))

        # Adagrad running memory, one per weight/bias.
        self.mWxh = np.zeros_like(self.Wxh)
        self.mWhh = np.zeros_like(self.Whh)
        self.mWhy = np.zeros_like(self.Why)
        self.mbh = np.zeros_like(self.bh)
        self.mby = np.zeros_like(self.by)

        self.hprev = np.zeros((hidden_size, 1))

    def _loss_and_grads(self, inputs, targets, hprev):
        xs, hs, ps = {}, {}, {}
        hs[-1] = np.copy(hprev)
        loss = 0.0
        for t, ix in enumerate(inputs):
            xs[t] = np.zeros((self.vocab_size, 1))
            xs[t][ix] = 1
            hs[t] = np.tanh(self.Wxh @ xs[t] + self.Whh @ hs[t - 1] + self.bh)
            y = self.Why @ hs[t] + self.by
            exp = np.exp(y - np.max(y))
            ps[t] = exp / np.sum(exp)
            loss += -np.log(max(ps[t][targets[t], 0], 1e-12))

        dWxh = np.zeros_like(self.Wxh)
        dWhh = np.zeros_like(self.Whh)
        dWhy = np.zeros_like(self.Why)
        dbh = np.zeros_like(self.bh)
        dby = np.zeros_like(self.by)
        dhnext = np.zeros_like(hs[0])

        for t in reversed(range(len(inputs))):
            dy = np.copy(ps[t])
            dy[targets[t]] -= 1
            dWhy += dy @ hs[t].T
            dby += dy
            dh = self.Why.T @ dy + dhnext
            dhraw = (1 - hs[t] * hs[t]) * dh
            dbh += dhraw
            dWxh += dhraw @ xs[t].T
            dWhh += dhraw @ hs[t - 1].T
            dhnext = self.Whh.T @ dhraw

        for grad in (dWxh, dWhh, dWhy, dbh, dby):
            np.clip(grad, -5, 5, out=grad)

        return loss, dWxh, dWhh, dWhy, dbh, dby, hs[len(inputs) - 1]

    def train_on_text(self, text):
        """Train on `text` as a next-character prediction task.

        Runs truncated BPTT in seq_len chunks and applies an Adagrad
        update after each chunk. Returns the average per-character loss
        (useful for watching it drop as CAINE learns), or None if `text`
        is too short to learn anything from.
        """
        if len(text) < 2:
            return None

        data = encode(text)
        losses = []
        for start in range(0, len(data) - 1, self.seq_len):
            chunk = data[start : start + self.seq_len + 1]
            if len(chunk) < 2:
                continue
            inputs, targets = chunk[:-1], chunk[1:]
            loss, dWxh, dWhh, dWhy, dbh, dby, hlast = self._loss_and_grads(
                inputs, targets, self.hprev
            )
            self.hprev = hlast
            losses.append(loss / len(inputs))

            for param, dparam, mem in (
                (self.Wxh, dWxh, self.mWxh),
                (self.Whh, dWhh, self.mWhh),
                (self.Why, dWhy, self.mWhy),
                (self.bh, dbh, self.mbh),
                (self.by, dby, self.mby),
            ):
                mem += dparam * dparam
                param += -self.learning_rate * dparam / np.sqrt(mem + 1e-8)

        return sum(losses) / len(losses) if losses else None

    def generate(self, prompt="", length=200, temperature=0.8, seed=None):
        rng = np.random.default_rng(seed)
        h = np.copy(self.hprev)

        if prompt:
            for c in prompt[:-1]:
                x = np.zeros((self.vocab_size, 1))
                x[CHAR_TO_IX.get(c, CHAR_TO_IX[UNK])] = 1
                h = np.tanh(self.Wxh @ x + self.Whh @ h + self.bh)
            ix = CHAR_TO_IX.get(prompt[-1], CHAR_TO_IX[UNK])
        else:
            ix = int(rng.integers(self.vocab_size))

        out_ix = []
        for _ in range(length):
            x = np.zeros((self.vocab_size, 1))
            x[ix] = 1
            h = np.tanh(self.Wxh @ x + self.Whh @ h + self.bh)
            y = self.Why @ h + self.by
            y = y / max(temperature, 1e-3)
            exp = np.exp(y - np.max(y))
            p = (exp / np.sum(exp)).ravel()
            ix = int(rng.choice(self.vocab_size, p=p))
            out_ix.append(ix)

        return decode(out_ix)

    def save(self, path):
        np.savez(
            path,
            Wxh=self.Wxh,
            Whh=self.Whh,
            Why=self.Why,
            bh=self.bh,
            by=self.by,
            mWxh=self.mWxh,
            mWhh=self.mWhh,
            mWhy=self.mWhy,
            mbh=self.mbh,
            mby=self.mby,
            hprev=self.hprev,
            hidden_size=self.hidden_size,
            seq_len=self.seq_len,
            learning_rate=self.learning_rate,
        )

    @classmethod
    def load(cls, path):
        data = np.load(path)
        model = cls(
            hidden_size=int(data["hidden_size"]),
            seq_len=int(data["seq_len"]),
            learning_rate=float(data["learning_rate"]),
        )
        for name in (
            "Wxh",
            "Whh",
            "Why",
            "bh",
            "by",
            "mWxh",
            "mWhh",
            "mWhy",
            "mbh",
            "mby",
            "hprev",
        ):
            setattr(model, name, data[name])
        return model
