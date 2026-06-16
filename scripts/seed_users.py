"""Seed the demo users (admin / technician / operator) for live login.

Idempotent — re-running only creates the missing ones. Matches the dashboard
login quick-fill credentials.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.database import SessionLocal, Base, engine
from app.models.user import User, UserRole
from app.utils.security import hash_password

Base.metadata.create_all(bind=engine)

USERS = [
    ("admin",      "admin123", UserRole.ADMIN,      "admin@auguard.local"),
    ("technician", "tech123",  UserRole.TECHNICIAN, "tech@auguard.local"),
    ("operator",   "op123",    UserRole.OPERATOR,   "operator@auguard.local"),
]

db = SessionLocal()
for username, pw, role, email in USERS:
    if db.query(User).filter(User.username == username).first():
        print(f"  exists : {username}")
        continue
    db.add(User(username=username, email=email,
                password_hash=hash_password(pw), role=role))
    db.commit()
    print(f"  created: {username} ({role.value})")
db.close()
print("demo users ready: admin/admin123, technician/tech123, operator/op123")
