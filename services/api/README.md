# @mei/api

Main HTTP API. Node 20 Lambda handlers behind API Gateway. See `SPEC.md §7`.

## Layout (planned)

```
src/
  handlers/
    closet/
    stella/
    ootd/
    hangout/
    friend/
    chat/
    profile/
  lib/
    ddb.ts
    s3.ts
    auth.ts
```

P0 ships: `auth`, `me`, `closet`, `closet/combinations`, `today`, `stella`, `ootd`, `friends`, `chat/threads` (DMs only). See `SPEC.md §13.1`.
