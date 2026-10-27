const {spawnSync}=require('node:child_process');const fs=require('node:fs');
process.loadEnvFile('.env');const raw=process.env.DIRECT_DATABASE_URL;
if(!raw)throw new Error('DIRECT_DATABASE_URL is missing');
const u=new URL(raw);if((u.port||'5432')!=='5432')throw new Error('Only direct/session port5432 is allowed');
const env={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15'};
function run(sql,transaction=false){const args=['-X','-q','-v','ON_ERROR_STOP=1'];if(transaction)args.push('--single-transaction');args.push('-A','-t');const r=spawnSync('/opt/homebrew/opt/postgresql@17/bin/psql',args,{env,input:sql,encoding:'utf8',timeout:60000});if(r.status!==0){console.error((r.stderr||'Database operation failed').replaceAll(raw,'[database URL]'));process.exit(1)}return r.stdout.trim()}
if(process.argv.includes('--apply')){
 const state=JSON.parse(run("BEGIN READ ONLY; SELECT json_build_object('jobs',to_regclass('public.speech_synthesis_jobs') IS NOT NULL,'usage',to_regclass('public.speech_synthesis_usage') IS NOT NULL); COMMIT;"));
 if(state.jobs||state.usage)throw new Error('Tables already exist; verify instead of blindly rerunning');
 run(fs.readFileSync('packages/db/migrations/20261024135239_speech_synthesis_queue.sql','utf8'),true);console.log('New speech queue migration applied in one transaction.');
}
const sql="BEGIN READ ONLY; SELECT json_build_object('jobs',to_regclass('public.speech_synthesis_jobs') IS NOT NULL,'usage',to_regclass('public.speech_synthesis_usage') IS NOT NULL,'table_security',(SELECT json_agg(json_build_object('name',relname,'rls',relrowsecurity,'anon_access',has_table_privilege('anon',oid,'SELECT') OR has_table_privilege('anon',oid,'INSERT'),'authenticated_access',has_table_privilege('authenticated',oid,'SELECT') OR has_table_privilege('authenticated',oid,'INSERT'))) FROM pg_class WHERE oid IN (to_regclass('public.speech_synthesis_jobs'),to_regclass('public.speech_synthesis_usage')))); COMMIT;";
console.log(run(sql));
