"""retrieval: passage-level text search over the case-law corpus.

This is the differentiator layer for the White & Case citation checker:
it lets the tool go to the SOURCE and return the exact paragraph that
supports (or contradicts) the proposition a citation is used for.

Boundary with the existence/good-law graph (the teammate's part):
  - their part owns (:Case) nodes, keyed by `id`.
  - this part adds (:Passage)-[:HAS_PASSAGE]-(:Case) + a vector index,
    and exposes retrieve_passages(case_id, claim, k).
The case `id` is the contract between the two halves.
"""
