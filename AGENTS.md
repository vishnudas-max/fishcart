# Repository guidance

## Product context
This is a monolithic ecommerce backend for quick local delivery, focused on seafood (sea fish and freshwater fish) with possible future pickle products. Backend: Python, Django, Django REST Framework. PostgreSQL is the deployment database; SQLite is acceptable for local development. Next.js is the frontend and should remain SEO-friendly for public catalog pages.

## Engineering rules
- Read the relevant code and docs before changing behavior. Avoid speculative abstractions and do not silently widen the task.
- Keep domain flow separate from infrastructure. Use small service functions/adapters for SMS, WhatsApp, payments, storage, and similar integrations; provider choices must be replaceable without rewriting business flows.
- Prefer Django/DRF class-based views, serializers for validation, explicit permissions, and shared utility/service functions where behavior is reused.
- The custom user model is foundational. Keep phone number normalization and uniqueness consistent across all entry points. Admin access uses Django username/password; customer access uses verified phone OTP.
- Never store OTPs or bearer tokens in plaintext. Never log OTPs, credentials, full tokens, or personal data unnecessarily.
- Return access JWTs to the frontend for in-memory use only. Put refresh JWTs in HttpOnly, Secure (outside local development), appropriately SameSite cookies; protect cookie-authenticated endpoints with CSRF and validate CORS/origin policy deliberately.
- Keep secrets in environment/secret stores. Do not commit `.env`, real credentials, production data, or generated keys. Production must fail closed if required secrets are absent.
- Validate external input, use parameterized ORM/database operations, enforce object-level authorization, throttle authentication and expensive endpoints, and use generic auth responses to reduce account enumeration.
- Keep dependency versions bounded and explain new runtime dependencies. Do not choose a WhatsApp provider until product requirements and account setup are decided.
- For containerized production, run as non-root, use health/readiness checks, TLS at the deployment boundary, secure headers, and least-privilege database credentials.

## Review and verification
- Review every change for authentication/authorization flaws, CSRF/CORS issues, secrets in code/logs, unsafe deserialization, injection, data leakage, race conditions, and missing database constraints.
- For auth and money/order changes, inspect failure paths and replay/concurrency behavior, not only the happy path.
- Run focused Django checks and migrations after backend changes. Add tests for security-sensitive behavior when implementing that feature; do not claim a check passed unless it was run.
- Inspect `git diff` before handing off. Call out unresolved production decisions and risks plainly.
