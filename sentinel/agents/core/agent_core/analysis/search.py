"""Multi-index search: BM25 + Reciprocal Rank Fusion."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class SearchResult:
    doc_index: int
    score: float


def bm25_search(
    query: str,
    documents: list[str],
    k1: float = 1.5,
    b: float = 0.75,
) -> list[SearchResult]:
    """BM25 ranking of documents against a query."""
    if not documents:
        return []

    query_terms = query.lower().split()
    if not query_terms:
        return []

    # Tokenize documents
    doc_tokens = [doc.lower().split() for doc in documents]
    avg_dl = sum(len(dt) for dt in doc_tokens) / len(doc_tokens)
    n = len(documents)

    # Document frequency per term
    df: dict[str, int] = {}
    for terms in doc_tokens:
        seen = set(terms)
        for t in seen:
            df[t] = df.get(t, 0) + 1

    # Score each document
    results: list[SearchResult] = []
    for i, tokens in enumerate(doc_tokens):
        score = 0.0
        dl = len(tokens)
        tf_map: dict[str, int] = {}
        for t in tokens:
            tf_map[t] = tf_map.get(t, 0) + 1

        for term in query_terms:
            if term not in tf_map:
                continue
            tf = tf_map[term]
            idf = math.log((n - df.get(term, 0) + 0.5) / (df.get(term, 0) + 0.5) + 1)
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * (dl / avg_dl))
            score += idf * (numerator / denominator)

        if score > 0:
            results.append(SearchResult(doc_index=i, score=score))

    results.sort(key=lambda r: r.score, reverse=True)
    return results


def rrf_merge(
    ranked_lists: list[list[SearchResult]],
    k: int = 60,
) -> list[SearchResult]:
    """Reciprocal Rank Fusion to merge multiple ranked result lists."""
    scores: dict[int, float] = {}

    for ranked in ranked_lists:
        for rank, result in enumerate(ranked):
            rrf_score = 1.0 / (k + rank + 1)
            scores[result.doc_index] = scores.get(result.doc_index, 0) + rrf_score

    merged = [
        SearchResult(doc_index=idx, score=score)
        for idx, score in scores.items()
    ]
    merged.sort(key=lambda r: r.score, reverse=True)
    return merged
