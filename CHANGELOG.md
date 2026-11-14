# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0]

### Added

- `item.belongsTo(criteria)` checks top-level and nested fields on the live record using strict equality.
- `snapshot(ids?)` returns independent snapshots keyed by `_id`. Omit the IDs or pass an empty list to snapshot the entire collection.
- `indexOf(id)` returns the current zero-based row position or `-1` for an unknown ID.
- `update(id, path, value)` supports typed nested writes and creates missing containers. Index validation and one-step rollback apply to both path updates and shallow object patches.

### Changed

- Updated the nested path dependency to 1.11.0 and use its strict write mode for path updates.

## [0.2.0]

### Added

- `reorder(ids)` changes collection order while preserving record identity and rollback history. It updates live group order and notifies subscribers. The input must contain every current `_id` exactly once.
- `EntityBehavior<ReturnType<typeof factory>>` extracts an entity's methods and getters from a named behavior factory.

### Documentation

- Translated the specification into English and made the use cases project-neutral.
- Updated the documentation to match the factory-based API. Added examples of applying a domain transition in one patch and keeping DOM resources in a behavior closure.

## [0.1.0]

### Added

- Ordered in-memory collections for plain objects and class instances, with stable `_id` keys and Nano ID generation.
- `Collection` and `Entity` classes with `collection()` and `entity()` factories, typed entity behavior, relations, and application metadata.
- Unique and grouped indexes addressed by nested Objwalk paths or named selectors, with live group views and scoped search.
- In-place updates and replacements, record snapshots, one-step rollback, and duplicate checks before applying a batch.
- Async loading with load state, change subscriptions, and read-only collections derived from related sources.
- ESM and CommonJS builds with TypeScript declarations, usage documentation, and an Entitymate agent skill.
