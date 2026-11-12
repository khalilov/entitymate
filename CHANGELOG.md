# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0]

### Added

- Ordered in-memory collections for plain objects and class instances, with stable `_id` keys and Nano ID generation.
- `Collection` and `Entity` classes with `collection()` and `entity()` factories, typed entity behavior, relations, and application metadata.
- Unique and grouped indexes addressed by nested Objwalk paths or named selectors, with live group views and scoped search.
- In-place updates and replacements, record snapshots, one-step rollback, and duplicate checks before applying a batch.
- Async loading with load state, change subscriptions, and read-only collections derived from related sources.
- ESM and CommonJS builds with TypeScript declarations, usage documentation, and an Entitymate agent skill.
