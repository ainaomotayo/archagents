from sentinel_dependency.typosquat import detect_typosquats, levenshtein


def test_levenshtein_identical():
    assert levenshtein("requests", "requests") == 0


def test_levenshtein_one_edit():
    assert levenshtein("requets", "requests") == 1


def test_levenshtein_two_edits():
    assert levenshtein("rqusts", "requests") == 2


def test_detects_typosquat():
    packages = [("requets", "app.py", 1)]
    findings = detect_typosquats(packages, "python")
    assert len(findings) >= 1
    assert findings[0].category == "typosquat"
    assert "requests" in findings[0].title


def test_no_flag_for_exact_match():
    packages = [("requests", "app.py", 1)]
    findings = detect_typosquats(packages, "python")
    assert len(findings) == 0


def test_no_flag_for_distant_package():
    packages = [("mylib", "app.py", 1)]
    findings = detect_typosquats(packages, "python")
    assert len(findings) == 0
