ALTER TABLE plans ADD COLUMN max_document_size_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN max_attached_knowledge_bases INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN max_retrieval_chunks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN max_retrieval_context_chars INTEGER NOT NULL DEFAULT 0;

ALTER TABLE knowledge_base_documents ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_base_documents ADD COLUMN source_deleted_at INTEGER;

CREATE TABLE IF NOT EXISTS tenant_knowledge_policies (
  tenant_id TEXT PRIMARY KEY,
  delete_processed_sources INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

UPDATE plans
SET max_knowledge_bases = 1,
    max_documents = 10,
    max_storage_bytes = 26214400,
    max_vector_chunks = 1000,
    max_document_size_bytes = 1048576,
    max_attached_knowledge_bases = 1,
    max_retrieval_chunks = 1,
    max_retrieval_context_chars = 1200
WHERE id = 'plan_free';

UPDATE plans
SET max_knowledge_bases = 5,
    max_documents = 100,
    max_storage_bytes = 1073741824,
    max_vector_chunks = 10000,
    max_document_size_bytes = 5242880,
    max_attached_knowledge_bases = 3,
    max_retrieval_chunks = 2,
    max_retrieval_context_chars = 2400
WHERE id = 'plan_developer';

UPDATE plans
SET max_knowledge_bases = 20,
    max_documents = 1000,
    max_storage_bytes = 10737418240,
    max_vector_chunks = 75000,
    max_document_size_bytes = 15728640,
    max_attached_knowledge_bases = 10,
    max_retrieval_chunks = 4,
    max_retrieval_context_chars = 6000
WHERE id = 'plan_pro';

UPDATE plans
SET max_knowledge_bases = 100,
    max_documents = 10000,
    max_storage_bytes = 107374182400,
    max_vector_chunks = 500000,
    max_document_size_bytes = 26214400,
    max_attached_knowledge_bases = 25,
    max_retrieval_chunks = 6,
    max_retrieval_context_chars = 9000
WHERE id = 'plan_business';