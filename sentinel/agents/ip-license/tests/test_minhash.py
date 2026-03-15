"""Tests for MinHash/LSH fuzzy similarity matching."""

from sentinel_license.minhash import (
    MinHashSignature,
    compute_minhash,
    jaccard_similarity,
    LSHIndex,
)


def test_minhash_deterministic():
    """Same tokens produce same signature."""
    tokens = {"alpha", "beta", "gamma", "delta"}
    sig1 = compute_minhash(tokens)
    sig2 = compute_minhash(tokens)
    assert sig1.values == sig2.values


def test_minhash_length():
    """Signature has exactly num_hashes values."""
    tokens = {"a", "b", "c"}
    sig16 = compute_minhash(tokens, num_hashes=16)
    assert len(sig16.values) == 16

    sig128 = compute_minhash(tokens, num_hashes=128)
    assert len(sig128.values) == 128


def test_similar_sets_have_high_similarity():
    """Sets with 5/7 overlap should have similarity > 0.5."""
    common = {"a", "b", "c", "d", "e"}
    set_a = common | {"f", "g"}
    set_b = common | {"h", "i"}
    sig_a = compute_minhash(set_a)
    sig_b = compute_minhash(set_b)
    assert sig_a.similarity(sig_b) > 0.5


def test_different_sets_have_low_similarity():
    """Disjoint sets should have similarity < 0.3."""
    set_a = {"a", "b", "c", "d", "e"}
    set_b = {"v", "w", "x", "y", "z"}
    sig_a = compute_minhash(set_a)
    sig_b = compute_minhash(set_b)
    assert sig_a.similarity(sig_b) < 0.3


def test_jaccard_similarity_exact():
    """{a,b,c} vs {b,c,d} should be exactly 0.5."""
    assert jaccard_similarity({"a", "b", "c"}, {"b", "c", "d"}) == 0.5


def test_lsh_index_find_similar():
    """Index 3 sigs, query with one, verify self-match found."""
    tokens_a = {"the", "quick", "brown", "fox", "jumps"}
    tokens_b = {"the", "quick", "brown", "cat", "sleeps"}
    tokens_c = {"completely", "different", "set", "of", "words"}

    sig_a = compute_minhash(tokens_a)
    sig_b = compute_minhash(tokens_b)
    sig_c = compute_minhash(tokens_c)

    index = LSHIndex()
    index.insert("doc_a", sig_a)
    index.insert("doc_b", sig_b)
    index.insert("doc_c", sig_c)

    results = index.query(sig_a)
    assert "doc_a" in results


def test_lsh_index_empty():
    """Query empty index returns empty set."""
    index = LSHIndex()
    sig = compute_minhash({"some", "tokens"})
    results = index.query(sig)
    assert results == set()
