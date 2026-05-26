# 🔒 Security Policy

## Supported Versions

DRMD is currently in early development (MVP v0.0.1). Security patches
are provided for the latest release only.

| Version | Supported          |
| ------- | ------------------ |
| latest  | ✅                 |
| < 0.1.0 | ❌                 |

## Reporting a Vulnerability

**Please do NOT open a public issue for security vulnerabilities.**

Instead, report them privately via:

- 📧 Email: [xian9qianqi@yandex.com](mailto:xian9qianqi@yandex.com)
- 🐛 GitHub: [Report a vulnerability](https://github.com/dmc-forwardtogether/DRMD/security/advisories/new)

### What to expect

| Step | Timeline |
|------|----------|
| Acknowledgment | Within 48 hours |
| Status update | Within 5 business days |
| Fix released | Typically within 14 days |

### Scope

Security reports related to the following are in scope:

- 🗄️ Database access & SQL injection
- 🔐 API authentication & authorization
- 📦 Dependency vulnerabilities (`npm audit`)
- 🌐 Cross-site scripting (XSS) & CSRF
- 🗺️ GeoJSON/PostGIS data injection

### Out of scope

- Theoretical attacks without proof-of-concept
- Social engineering
- Physical security
- DoS attacks (this is early-stage software)

---

## Dependency Policy

We use `npm audit` and Dependabot to track vulnerabilities.
Before reporting a dependency issue, check if a newer version already fixes it.

```bash
npm audit
```

---

> 🙏 Thank you for helping keep DRMD secure!

