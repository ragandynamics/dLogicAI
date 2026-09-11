CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  knowledge_base_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_length INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(document_id, chunk_index),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES knowledge_base_documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_scope_idx
  ON knowledge_base_chunks(tenant_id, project_id, knowledge_base_id);
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_idx
  ON knowledge_base_chunks(document_id, chunk_index);
