"""Tests for BM25 search and Reciprocal Rank Fusion."""

import pytest

from agent_core.analysis.search import SearchResult, bm25_search, rrf_merge


class TestBM25:
    def test_empty_documents(self) -> None:
        assert bm25_search("query", []) == []

    def test_empty_query(self) -> None:
        assert bm25_search("", ["doc"]) == []

    def test_single_match(self) -> None:
        docs = ["the cat sat on the mat", "the dog ran fast"]
        results = bm25_search("cat", docs)
        assert len(results) == 1
        assert results[0].doc_index == 0

    def test_ranking_order(self) -> None:
        docs = [
            "python programming language",
            "python snake animal python",
            "java programming",
        ]
        results = bm25_search("python", docs)
        # Doc 1 has "python" twice -> should rank higher
        assert results[0].doc_index == 1
        assert results[1].doc_index == 0

    def test_multi_term_query(self) -> None:
        docs = [
            "machine learning algorithms",
            "deep learning neural networks",
            "cooking recipes food",
        ]
        results = bm25_search("learning algorithms", docs)
        assert len(results) >= 1
        # First doc has both terms
        assert results[0].doc_index == 0

    def test_no_match(self) -> None:
        docs = ["hello world", "foo bar"]
        results = bm25_search("zebra", docs)
        assert results == []


class TestRRF:
    def test_empty_lists(self) -> None:
        assert rrf_merge([]) == []

    def test_single_list(self) -> None:
        ranked = [SearchResult(doc_index=0, score=1.0), SearchResult(doc_index=1, score=0.5)]
        merged = rrf_merge([ranked])
        assert len(merged) == 2
        assert merged[0].doc_index == 0  # higher rank -> higher RRF

    def test_merge_two_lists(self) -> None:
        list1 = [SearchResult(doc_index=0, score=1.0), SearchResult(doc_index=1, score=0.5)]
        list2 = [SearchResult(doc_index=1, score=1.0), SearchResult(doc_index=2, score=0.5)]
        merged = rrf_merge([list1, list2])
        # Doc 1 appears in both lists -> should have highest combined score
        assert merged[0].doc_index == 1

    def test_rrf_scores_decrease(self) -> None:
        ranked = [
            SearchResult(doc_index=i, score=1.0) for i in range(5)
        ]
        merged = rrf_merge([ranked])
        for i in range(len(merged) - 1):
            assert merged[i].score >= merged[i + 1].score
