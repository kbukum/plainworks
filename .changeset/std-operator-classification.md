---
"@plainworks/std": patch
---

Add operator classification to the `std/list` contract: the `PRESENCE_OPERATORS`, `LIST_OPERATORS`, and `SCALAR_OPERATORS` groups plus the `isPresenceOperator`/`isListOperator`/`isScalarOperator` guards, derived from the `ListFilter` variants so every operator is classified by its value shape from one source of truth. Filter builders and transports narrow an operator to its value shape without re-deriving the groups.
