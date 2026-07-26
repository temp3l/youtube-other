# Canonicalization and hash contract

All JSON hashes in this pack are calculated over:

1. UTF-8 encoded JSON.
2. Object keys sorted lexicographically.
3. Compact separators: `,` and `:`, without extra spaces.
4. Unicode preserved rather than ASCII escaped.
5. Arrays retained in their declared order.
6. Integer numbers only in canonical review specifications.
7. Exactly one line-feed byte (`0x0A`) after the JSON document.
8. Omitted properties not serialized. An explicit `null` is therefore distinct
   from an omitted property.

Reference Python:

```python
payload = (
    json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    + "\n"
).encode("utf-8")
digest = hashlib.sha256(payload).hexdigest()
```

The `review_spec_sha256` field of each skill is calculated before that field is
added to the skill object. The packet `content_set_sha256` binds the ordered
skill IDs, complete skill objects, and any datasets. The
`target_document_sha256` binds the complete canonical target before the
`target_document_sha256` property itself is added.
