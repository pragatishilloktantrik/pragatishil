#!/usr/bin/env python3
# LOCAL TEST ONLY: resets pragatishil_recovery on 127.0.0.1:55437.
# Requires the disposable PostgreSQL cluster, with auth/storage mocks for validation.
# Never point this script at Supabase; deploy the two files in supabase/migrations instead.
from pathlib import Path
import subprocess,re,json
root=Path(__file__).resolve().parents[2]
out=Path('/private/tmp/pragatishil-recovery-sql');out.mkdir(exist_ok=True)
psql=['/opt/homebrew/opt/postgresql@17/bin/psql','-h','127.0.0.1','-p','55437','-U','roman','-d','pragatishil_recovery','-X','-v','ON_ERROR_STOP=1']
subprocess.run(['/opt/homebrew/opt/postgresql@17/bin/psql','-h','127.0.0.1','-p','55437','-U','roman','-d','postgres','-c','DROP DATABASE IF EXISTS pragatishil_recovery'],capture_output=True,check=True)
subprocess.run(['/opt/homebrew/opt/postgresql@17/bin/createdb','-h','127.0.0.1','-p','55437','-U','roman','pragatishil_recovery'],check=True)
stub="""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
"""
# Roles persist at cluster scope.
subprocess.run(psql+['-c',stub],capture_output=True)
stub="""
CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA extensions;
CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon') $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;
CREATE FUNCTION storage.filename(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[array_length(string_to_array($1,'/'),1)] $$;
CREATE PUBLICATION supabase_realtime;
"""
subprocess.run(psql+['-c',stub],capture_output=True,check=True)
base=['cms_schema.sql','migration_add_avatar_to_profiles.sql','migration_rbac_system.sql','migration_add_identity_columns.sql','fix_audit_logs_schema.sql','migration_add_thread_summary.sql','migration_advanced.sql','migration_votes.sql','migration_channel_category.sql','migration_category_manager.sql','migration_channel_resources_v2.sql','migration_ban_system.sql','migration_user_management.sql','fix_profile_missing_fullname.sql','migration_profile_trigger.sql','migration_members_rls.sql','migration_performance_indexes.sql','fix_enum_values.sql','ACCESS','20251216234500_migration_attachments.sql','20251216235800_fix_flag_permissions.sql','20251217000800_fix_flag_enums.sql','01_normalize_user_role_enum.sql','02_convert_role_columns_and_rls.sql','master_fix_v1.sql']
later=sorted(p.name for p in (root/'supabase/legacy-migrations').glob('208*.sql'))
later.remove('20811224_social_features.sql');later.insert(later.index('20811224_dm_attachments.sql'),'20811224_social_features.sql')
# Fix permissions after all tables exist; avoid intermediate versions of overlapping policies.
skip={'20811219_extend_news_cms.sql','20811219_fix_date_bs_schema_cache.sql','20811219_fix_media_schema_cache.sql','20811219_storage_policies_only.sql','20811219_fix_cc_permissions.sql','20811219_fix_cms_rls.sql','20811219_restrict_audit_rls.sql','20811219_force_author_name.sql','20811219_fix_news_public_policy.sql','20811220_fix_news_rls_matrix.sql','20811222_comprehensive_rls_security.sql','20811222_media_gallery_rls.sql','20811222_news_items_rls.sql','20811222_write_page_status_rls.sql','20811224_profession_category_policies.sql'}
names=['BASE','GEO']+base+[n for n in later if n not in skip]
applied=[]
for i,name in enumerate(names):
 s=(root/'supabase_schema.md').read_text() if name=='BASE' else (root/'supabase/legacy-migrations'/('master_fix_v1.sql' if name in ('ACCESS','GEO') else name)).read_text()
 if name=='GEO':
  s=(root/'scripts/recovery/geography.sql').read_text()
 if name=='ACCESS':
  s=(root/'supabase/legacy-migrations/master_fix_v1.sql').read_text().split('-- 2. FIX PROFILES TABLE')[0]
 if name=='02_convert_role_columns_and_rls.sql':
  s="DO $$ DECLARE p record; BEGIN FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname IN ('public','storage') LOOP EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename); END LOOP; END $$;\n"+s
 if name=='master_fix_v1.sql':
  s='-- 2. FIX PROFILES TABLE'+s.split('-- 2. FIX PROFILES TABLE',1)[1]
 if name=='20811222_fix_signup_trigger.sql':
  s=s.split('-- 3) Allow inserts')[0]
 if name=='cms_schema.sql':
  s=s[:s.index('-- Seed News')]+s[s.index('-- 9. Storage Buckets'):]
 # Single transaction per stage; enum changes commit between stages.
 s=re.sub(r'^\s*(?:BEGIN|COMMIT);\s*$', '', s, flags=re.M)
 p=out/f'{i:03d}_{name}.sql';p.write_text(s)
 r=subprocess.run(psql+['-1','-f',str(p)],capture_output=True,text=True)
 if r.returncode:
  print('FAILED',name);print(r.stderr[-2200:]);break
 applied.append(name);print('APPLIED',name)
else: print('ALL STAGES APPLIED')
(out/'manifest.json').write_text(json.dumps(applied,indent=2))

if len(applied)==len(names):
 r=subprocess.run(psql+['-1','-f',str(root/'scripts/recovery/finalize.sql')],capture_output=True,text=True)
 if r.returncode: print(r.stderr);raise SystemExit(r.returncode)

 if r.returncode==0:
  r=subprocess.run(psql+['-1','-f',str(root/'supabase/migrations/20261007120002_lookup_and_membership_access.sql')],capture_output=True,text=True)
  if r.returncode: print(r.stderr);raise SystemExit(r.returncode)
