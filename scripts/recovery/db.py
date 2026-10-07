#!/usr/bin/env python3
"""Run PostgreSQL utilities using private .env.local credentials without logging them.

Examples (from repository root):
  python3 scripts/recovery/db.py psql -X -c "select count(*) from public.profiles"
  python3 scripts/recovery/db.py pg_dump --format=custom --file=/private/path/backup.dump

Backups include database rows and metadata, not the actual Storage file bytes.
Migration SQL contains reference seeds; it is not a backup of the lost project's users/content."""
from pathlib import Path
from urllib.parse import urlparse,unquote
import os,subprocess,sys
root=Path(__file__).resolve().parents[2]
values={}
for line in (root/'.env.local').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key,value=line.split('=',1);values[key.strip()]=value.strip().strip('\"\'')
u=urlparse(values['DATABASE_URL'])
if u.hostname!='db.ufwkblaqnutxqineduke.supabase.co':
    raise SystemExit('Refusing unexpected project host')
env=os.environ.copy();env.update(PGHOST=u.hostname,PGPORT=str(u.port or 5432),PGUSER=u.username,PGPASSWORD=unquote(u.password or ''),PGDATABASE=u.path.lstrip('/'),PGSSLMODE='require',PGCONNECT_TIMEOUT='15')
tool=sys.argv[1] if len(sys.argv)>1 else 'psql'
if tool not in ('psql','pg_dump'):raise SystemExit('Unsupported tool')
binary=Path('/opt/homebrew/opt/postgresql@17/bin')/tool
result=subprocess.run([str(binary),*sys.argv[2:]],env=env)
sys.exit(result.returncode)
