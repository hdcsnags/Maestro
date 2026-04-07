/*
  # Add file_manifest to responses

  ## Why
  Task 2 of the Bolt-replacement spec: Build mode agents now return a
  file_manifest array describing concrete file changes. github-execute
  iterates this manifest to write real files at real paths instead of
  dumping prose into maestro-patches/. The manifest must persist on the
  response row so that approval-then-execute works across page reloads.

  ## Shape
  jsonb array of { path: string, content: string | null, operation: 'upsert' | 'delete' }
  Default empty array. Non-Build responses leave it empty.
*/

ALTER TABLE responses
  ADD COLUMN IF NOT EXISTS file_manifest jsonb NOT NULL DEFAULT '[]'::jsonb;
