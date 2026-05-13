---
"@unisource/sdk": minor
---

Add multipart upload helpers under `releases.upload.multipart` (`create`, `signPart`, `listParts`, `complete`, `abort`) so consumers can upload large release artifacts via S3 presigned URLs without touching the AWS SDK.
