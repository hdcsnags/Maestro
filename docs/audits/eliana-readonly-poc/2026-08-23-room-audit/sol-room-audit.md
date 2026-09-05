# Sol — independent Room setup audit (read-only, 2026-08-23)

- success: true
- elapsed: 341.2s
- sandbox: read-only (Codex native)


## Sol's findings

ROOM DATABASE AUDIT — independent, read-only

Verdict: no BLOCKER found. Two HIGH findings, including a concrete race that can explain the reported blank Bible tab.

HIGH — Initial-load race can produce a persistent blank reader

Files:
- app/src/main/java/com/eliana/rhythm/viewmodel/EnhancedBibleReaderViewModel.kt:38-49, 102-108, 120-162, 189-219
- app/src/main/java/com/eliana/rhythm/data/local/BibleRoomRepository.kt:87-95
- app/src/main/java/com/eliana/rhythm/ui/screens/EnhancedBibleReaderScreen.kt:124-138, 432-456
- app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt:246-286
- app/src/main/java/com/eliana/rhythm/viewmodel/EnhancedBibleReaderViewModel.kt:442-449

`loadBibleVersions()` and `loadBibleBooks()` launch independently during ViewModel initialization. A returning user may have `currentVersionId` persisted as ORIG, ELIANA, or FA-GNB, while `_selectedVersions` initially remains empty.

If books finish first:

1. The screen selects the saved/default book.
2. `loadChapterVerses()` reads the still-empty `_selectedVersions`.
3. `BibleRoomRepository.getChapter()` silently substitutes BSB for an empty version list.
4. The later versions result restores the persisted version ID, but does not reload the chapter.
5. Reading mode filters the returned BSB verses using `verse.versionId == currentVersion`. If `currentVersion` is ORIG/ELIANA/FA-GNB, every verse is removed.
6. The enclosing state is `UiState.Success`, so there is no loading indicator or error card—only an empty reading card.

This directly matches the requested failure class: successful nonempty data exists, but the final filtered list is empty and no error/loading state is visible. `retry()` will not repair it because it retries only `UiState.Error`; all relevant states are already `Success`.

There is also a shorter first-frame empty state because `_versesState` starts as `UiState.Success(emptyList())` at ViewModel line 48. Selecting the book and launching the verse coroutine are separate state transitions, so composition can briefly render that empty success before `Loading`.

This is the strongest code-based explanation for Michael’s symptom, especially if the emulator had a non-BSB version saved. Navigating away and recreating the destination can make it appear intermittent because the versions/books completion order changes.

Recommended correction: coordinate initial books and versions loading, and select/load the initial chapter only after a valid selected version exists. Also make successful empty/mismatched chapter data an explicit error state instead of rendering an empty reader.

HIGH — Updated bundled database contents do not reach existing installs

Files:
- app/src/main/java/com/eliana/rhythm/data/local/BibleRoomDatabase.kt:19-28, 40-90
- app/src/main/java/com/eliana/rhythm/data/local/OriginalsDatabase.kt:30-58
- tools/build_originals_db.py:45-75
- tools/slim_bible_db.py:4-11

`createFromAsset()` copies an asset only when the installed database is absent, or when Room performs an eligible destructive migration. It does not compare asset hashes or recopy a same-version database during an app update.

Consequences:

- Replacing `eliana_bible.db` while keeping Room version 3 leaves existing users on the old verses/books/version rows.
- Merely bumping the Bible schema version does not solve this when an explicit migration path exists: Room prioritizes the migration and does not replace the database from the asset.
- Replacing `originals.db` while keeping `OriginalsDatabase` at version 1 likewise leaves existing users on the previous original-language data.
- `fallbackToDestructiveMigration()` does not trigger for version 1 → version 1 content changes.

This matters because these appear to be actively regenerated datasets. Fresh installs and upgraded installs can silently see different scripture/source data.

For the Bible database, a destructive refresh is unacceptable because `user_annotations` shares the file. Either implement content migrations that replace only static tables, or separate user annotations from the shipped scripture database.

For `originals.db`, a deliberate database-version bump per content release can use destructive recopy safely, provided the release process verifies the new asset.

MEDIUM — Auto Backup rules can attempt to back up roughly 122 MB of reproducible databases

Files:
- app/src/main/AndroidManifest.xml:14-17
- app/src/main/res/xml/backup_rules.xml:8-13
- app/src/main/res/xml/data_extraction_rules.xml:6-18
- app/src/main/java/com/eliana/rhythm/data/local/BibleRoomDatabase.kt:12-16

`allowBackup=true` is enabled, while both backup-rule files remain effectively default/sample configurations. Copied Room databases normally live in the application databases domain and are eligible for backup.

The installed copies are approximately:

- `eliana_bible.db`: 29.7 MB
- `originals.db`: 92.1 MB

That is far above Android Auto Backup’s standard per-app quota. `originals_database` is entirely reproducible and should be excluded. The Bible database is harder: most of its size is reproducible scripture, but it also contains irreplaceable annotations. Co-locating those makes selective platform backup impossible.

The manual JSON backup does export annotations, which helps, but it is user-triggered and does not remove the Auto Backup design issue.

MEDIUM — Study JSON is synchronously read and decoded during composition

Files:
- app/src/main/java/com/eliana/rhythm/ui/screens/EnhancedBibleReaderScreen.kt:116-122
- app/src/main/java/com/eliana/rhythm/data/study/StudyRepository.kt:19-49

When the first book becomes selected, `remember(selectedBook, currentChapter)` calls `StudyRepository.chainsFor()` on the Compose/UI thread. On the first call, that path:

- lists asset files;
- reads every published study JSON;
- decodes every study;
- reads and decodes `chains.json`;
- cross-validates every chain against loaded studies.

The current assets total roughly 235 KB. This is not huge, but it occurs at exactly the moment the cold chapter is trying to render and can add visible jank or extend a blank frame on slower devices/emulators. Move initial parsing off the main thread or preload/cache it before the reader composition needs it.

MEDIUM — Migration safety lacks exported schemas and migration tests

Files:
- app/src/main/java/com/eliana/rhythm/data/local/BibleRoomDatabase.kt:19-28, 40-80
- app/src/main/java/com/eliana/rhythm/data/local/OriginalsDatabase.kt:36-40

Both databases use `exportSchema=false`, and no `MigrationTestHelper` tests exist. This is particularly risky for Bible migration 2→3 because it rebuilds the only user-owned Room table.

The migration logic itself appears reasonable: it creates the composite-primary-key table, inserts newest annotations first with `INSERT OR IGNORE`, then swaps tables. But there is no automated proof that real version-1/version-2 installed files migrate to the current generated schema while preserving expected annotations.

Export schemas and test every supported start version through version 3 using representative duplicates and annotations.

MEDIUM — Search “text index” does not accelerate the implemented search

Files:
- app/src/main/java/com/eliana/rhythm/data/local/BibleEntity.kt:11-19
- app/src/main/java/com/eliana/rhythm/data/local/BibleDao.kt:37-66

`Index(["text"])` is a normal B-tree index, but both search queries use:

`text LIKE '%' || :query || '%'`

The leading wildcard prevents that index from serving the text predicate. Query-plan inspection of the shipped asset showed SQLite using the `version` index, scanning that version’s rows, and creating a temporary B-tree for ordering.

With roughly 31,000 rows per English version and a 100-result cap, this is probably tolerable for closed testing, but the comment calling it “Full-text search” is inaccurate. Use an FTS table if search latency becomes visible; otherwise remove the misleading/redundant text index.

LOW — Warm-up failures are completely discarded

Files:
- app/src/main/java/com/eliana/rhythm/MainScreen.kt:55-63
- app/src/main/java/com/eliana/rhythm/ui/screens/OnboardingScreen.kt:45-52

Both warm-ups wrap the first query in `runCatching` and discard the result. A failed asset copy, disk-space error, or schema-open failure produces no log or telemetry at the warm-up site.

The reader later records book/version exceptions, so this is not total error suppression. Still, logging the warm-up failure would make cold-install problems much easier to distinguish from emulator flakiness.

LOW — The originals asset is not pre-stamped with its Room version or identity hash

Files:
- tools/build_originals_db.py:26-75
- app/src/main/java/com/eliana/rhythm/data/local/OriginalsDatabase.kt:36-58

The shipped `originals.db` has `PRAGMA user_version=0` and no `room_master_table`. Room 2.8.4 can treat it as a newly created prepackaged database, validate its existing tables, create the master table, and stamp version 1 on first open. The schema and both declared indexes match the generated Room schema.

So this is not a current fresh-install defect. It is operational fragility: the asset is less self-describing, and correctness depends on Room’s bootstrap path plus runtime validation. The build script should ideally stamp the intended version and include an automated Room-open smoke test.

LOW — Several indexes are redundant; hot chapter lookups are already covered

Files:
- app/src/main/java/com/eliana/rhythm/data/local/BibleEntity.kt:11-19
- app/src/main/java/com/eliana/rhythm/data/local/OriginalsEntities.kt:24-30
- app/src/main/java/com/eliana/rhythm/data/local/BibleDao.kt:19-34
- app/src/main/java/com/eliana/rhythm/data/local/OriginalsDatabase.kt:13-20

No missing index was found for the hot book/chapter/verse paths:

- `bible_verses` primary key begins with `(book, chapter, verse, version)`.
- `original_verses` primary key begins with `(book, chapter, verse)`.
- `original_words` primary key begins with `(book, chapter, verse, pos)`.

Query plans use those primary-key indexes.

Therefore `index_bible_verses_book`, `index_bible_verses_book_chapter`, and `index_original_words_book_chapter_verse` are largely redundant prefixes. They increase asset size and first-copy cost without helping the inspected hot queries.

LOW — Unbounded occurrence DAO could become a memory problem if activated

File:
- app/src/main/java/com/eliana/rhythm/data/local/OriginalsDatabase.kt:22-24

`getOccurrences(strongs)` returns every matching `OriginalWordEntity` in one list. It is currently unused, so there is no present runtime impact. Some common values have tens of thousands of rows in the asset; one inspected value had 24,375 matches. Paginate or project only display fields before wiring this method into UI.

CALIBRATION — Things done well

- The shipped `eliana_bible.db` is version 3, passes SQLite integrity checking, and its Room identity hash exactly matches the generated version-3 implementation.
- The `originals.db` tables, column constraints, primary keys, and declared indexes match the generated Room schema.
- No `allowMainThreadQueries()` exists. DAO operations are suspend functions, and explicit warm-up/word-loading work uses background dispatchers.
- Room’s singleton construction and prepackaged-copy lock prevent concurrent warm-up and reader queries from corrupting the copied database.
- The 92 MB originals asset is not copied during an ordinary BSB initial load merely because `OriginalsDatabase` is instantiated; its first real originals query triggers that copy.
- Chapter-sized result lists are modest. The reader does not load entire Bible books into memory.
- Avoiding destructive migration on the Bible database is correct because annotations live there.
- Destructive fallback for the originals database is reasonable for actual version transitions because that database contains no user-authored data.
- No additional direct `SQLiteDatabase`, raw SQLite, or third Room database usage was found.