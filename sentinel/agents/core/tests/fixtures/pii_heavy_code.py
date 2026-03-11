# This fixture contains embedded secrets for testing PII scrubbing.
# DO NOT use these values in production — they are all fake/test values.

AWS_KEY = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"

DATABASE_URL = "postgres://admin:s3cretP@ss@db.example.com:5432/myapp"
MONGO_URI = "mongodb+srv://root:hunter2@cluster0.example.net/production"

EMAIL_ADMIN = "admin@company.io"
EMAIL_SUPPORT = "support@internal.example.com"

SSN_RECORD = "123-45-6789"

PRIVATE_KEY = """-----BEGIN RSA PRIVATE KEY-----
MIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJpFkUFODJiL5HmTsNqFP3Vu2u2
YFQJ3+FIHbzpmIkNlPkG/9LSSToQHKMfcYECAwEAAQJAQJBDREXeVnSm2Xm/
-----END RSA PRIVATE KEY-----"""

SERVER_IP = "10.0.1.42"
SAFE_IP = "127.0.0.1"

api_key = "abcdef1234567890abcdef1234567890"
secret_key = "AABBCCDD11223344AABBCCDD11223344"
