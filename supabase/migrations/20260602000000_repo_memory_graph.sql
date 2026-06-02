-- C-02: repo_memory structural enhancement
-- Adds kind (node category) and relations (graph edges) to enable structured
-- knowledge graph queries and eventual auto-generation of the docs/vault/ notes.
--
-- kind: what type of node this memory entry represents
-- relations: directed edges to other repo_memory nodes (wikilink equivalent)
--
-- Existing rows default to kind=NULL (uncategorized) and relations=[] (no edges).
-- The graph_update action in repo-memory-update sets these fields.

ALTER TABLE repo_memory
  ADD COLUMN IF NOT EXISTS kind TEXT
    CHECK (kind IN ('component', 'edge_fn', 'table', 'concept', 'decision', 'file')),
  ADD COLUMN IF NOT EXISTS relations JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN repo_memory.kind IS 'Node type: component | edge_fn | table | concept | decision | file. NULL = uncategorized.';
COMMENT ON COLUMN repo_memory.relations IS 'Directed edges: array of { to: text, label: text } pointing to other repo_memory (repo_full_name) nodes.';

CREATE INDEX IF NOT EXISTS idx_repo_memory_kind
  ON repo_memory(user_id, kind)
  WHERE kind IS NOT NULL;
