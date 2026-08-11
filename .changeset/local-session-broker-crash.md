---
"slamy": patch
---

fix: local session broker no longer crashes with ERR_STREAM_WRITE_AFTER_END when a client disconnects or half-closes before the response is written
