from app.adapters.audit.sha256_log import Sha256AuditLog


def test_digest_changes_after_record():
    log = Sha256AuditLog()
    d0 = log.digest()
    log.record("verify", "matter-1", ["citation:FABRICATED"])
    d1 = log.digest()
    assert d0 != d1


def test_digest_is_64_char_hex():
    log = Sha256AuditLog()
    log.record("ingest", "matter-1", ["chars=1234"])
    digest = log.digest()
    assert len(digest) == 64
    assert all(c in "0123456789abcdef" for c in digest)


def test_records_are_immutable_append_only():
    log = Sha256AuditLog()
    log.record("step1", "ref1", ["a"])
    log.record("step2", "ref1", ["b"])
    assert len(log._entries) == 2
    assert log._entries[0]["action"] == "step1"
    assert log._entries[1]["action"] == "step2"


def test_each_entry_has_prev_hash():
    log = Sha256AuditLog()
    log.record("a", "r", ["x"])
    log.record("b", "r", ["y"])
    assert log._entries[0]["prev_hash"] == ""
    assert log._entries[1]["prev_hash"] == log._entries[0]["hash"]
