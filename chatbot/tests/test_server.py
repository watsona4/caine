from caine.server import CAINE


def test_caine_starts_untrained_without_existing_state(tmp_path):
    caine = CAINE(state_path=tmp_path / "state.npz", hidden_size=8, seed=0)
    assert not caine.state_path.exists()


def test_respond_returns_text_and_trains(tmp_path):
    caine = CAINE(state_path=tmp_path / "state.npz", hidden_size=8, seed=0)
    reply = caine.respond("hello there", reply_length=20)
    assert isinstance(reply, str)
    assert len(reply) == 20


def test_save_persists_state_to_disk(tmp_path):
    state_path = tmp_path / "nested" / "state.npz"
    caine = CAINE(state_path=state_path, hidden_size=8, seed=0)
    caine.respond("hi")
    caine.save()
    assert state_path.exists()

    reloaded = CAINE(state_path=state_path)
    assert reloaded.model.hidden_size == caine.model.hidden_size
