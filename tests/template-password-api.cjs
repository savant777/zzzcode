const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, deps = {}) { const module = { exports: {} }; new Function('exports','require','module',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(module.exports,n=>deps[n]||require(n),module);return module.exports; }
process.env.TEMPLATE_PASSWORD_ENCRYPTION_KEY = 'ab'.repeat(32);
const crypto = load('lib/template-password-crypto.ts');
const { handleTemplatePasswordRequest } = load('lib/template-password-api.ts', { './template-password-crypto': crypto });
let user = 'creator', role = 'creator', active = true, encrypted = null, saves = 0;
const db = { auth:{getUser:async()=>({data:{user:{id:user}}})}, from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='creators'?{role,is_active:active}:{user_id:'creator',is_personal:true}})})})}), rpc:async()=>({data:encrypted}) };
const userDb = {rpc:async(name,args)=>{assert.equal(name,'save_template');saves++;encrypted=args.p_password_encrypted;assert(!encrypted.includes(args.p_password));return {data:{id:136}};}};
const request = (body, auth=true, origin='http://localhost') => new Request('http://localhost/api/templates/password',{method:'POST',headers:{Origin:origin,...(auth?{Authorization:'Bearer test'}:{})},body:JSON.stringify(body)});
(async()=>{
 const text='ไทย🔑secret';const value=crypto.encryptTemplatePassword('template-password',text);
 assert.equal(crypto.decryptTemplatePassword('template-password',value),text);
 assert.throws(()=>crypto.decryptTemplatePassword('wrong',value));
 assert.notEqual(crypto.encryptTemplatePassword('template-password',text),value);
 assert.equal((await handleTemplatePasswordRequest(request({templateId:136},false),'read',{db,userDb})).status,401);
 assert.equal((await handleTemplatePasswordRequest(request({templateId:136},true,'http://other'),'read',{db,userDb})).status,403);
 user='unrelated';assert.equal((await handleTemplatePasswordRequest(request({templateId:136}),'read',{db,userDb})).status,403);assert.equal(saves,0);
 user='creator';let result=await handleTemplatePasswordRequest(request({templateId:136}),'read',{db,userDb});assert.equal((await result.json()).password,null);
 result=await handleTemplatePasswordRequest(request({templateId:136,data:{title:'test',is_personal:true},password:text}),'save',{db,userDb});assert.equal(result.status,200);
 result=await handleTemplatePasswordRequest(request({templateId:136}),'read',{db,userDb});assert.equal((await result.json()).password,text);assert.equal(result.headers.get('cache-control'),'no-store');
 user='owner';role='owner';result=await handleTemplatePasswordRequest(request({templateId:136}),'read',{db,userDb});assert.equal(result.status,200);
 active=false;assert.equal((await handleTemplatePasswordRequest(request({templateId:136}),'read',{db,userDb})).status,403);
 console.log('PASS: encrypted password roundtrip, fresh IVs, binding, manager authorization, legacy hashes, save/read and no-store.');
})().catch(e=>{console.error(e);process.exitCode=1});
