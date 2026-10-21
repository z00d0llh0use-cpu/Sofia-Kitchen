import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('dist/book.html','utf8');
const code=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean).join('\n')+'\n'+fs.readFileSync('dist/member-book.js','utf8');
new vm.Script(code);
const elements=new Map(),handlers=new Map(),classNames=new Set();
function element(id){if(!elements.has(id))elements.set(id,{id,hidden:true,value:'',textContent:'',checked:false,disabled:false,style:{},classList:{add(){},remove(){},contains(){return true},toggle(){}},addEventListener(t,fn){handlers.set(id+':'+t,fn)},replaceChildren(){},appendChild(){},remove(){},click(){},showModal(){this.open=true},close(){this.open=false}});return elements.get(id)}
const database=new Map();let failure=null,transactions=0;let listenerSync=false;
function snapshot(){return {metadata:{hasPendingWrites:false,fromCache:false},docs:[...database].map(([key,value])=>({id:key.split('/').at(-1),data:()=>structuredClone(value)}))}}
const sandbox={console,URL,Blob,TextEncoder,crypto:globalThis.crypto,location:{protocol:'http:'},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},confirm:()=>true,window:{addEventListener(){}},Member:{nameOf:user=>user?.email||'會員',state:{},errorText:error=>error.message||'操作失敗'},document:{addEventListener(){},getElementById:element,querySelectorAll(){return []},createElement:()=>element('new-'+Math.random()),body:{appendChild(){},classList:{toggle(key,on){on?classNames.add(key):classNames.delete(key)}}}},localStorage:{getItem(){throw new Error('Cloud mode must not read local recipe storage')},setItem(){throw new Error('Cloud mode must not save local recipes')}}};
const context=vm.createContext(sandbox);
const run=source=>vm.runInContext(source,context,{timeout:2000});
run(code);run('updateBookView=()=>{}; goToRecipePage=()=>{}; downloadRecipeData=()=>{};');
const sample=JSON.parse(fs.readFileSync('tests/fixtures/recipe.json','utf8')).recipes[0];context.sample=sample;
const uid='DipeHVpohTZh6gsaguD5oTgNV0D2';
context.testSdk={doc:(db,...parts)=>parts.join('/'),serverTimestamp:()=>({server:true}),async runTransaction(db,callback){transactions++;if(failure)throw failure;const operations=[];await callback({async get(ref){return {exists:()=>database.has(ref),data:()=>structuredClone(database.get(ref))}},set(ref,data){operations.push(['set',ref,structuredClone(data)])},delete(ref){operations.push(['delete',ref])}});for(const [kind,ref,data]of operations){if(kind==='set')database.set(ref,data);else database.delete(ref)}if(listenerSync){context.snapshot=snapshot();run('receiveCloudSnapshot(snapshot)')}}};
context.testAuth={currentUser:{uid}};
run(`cloud.settings={founderUid:'${uid}'};cloud.ownerUid='${uid}';cloud.book={ownerId:'${uid}',visibility:'members'};cloud.sdk=testSdk;cloud.auth=testAuth;cloud.ready=true;cloud.confirmed=true;cloud.hasData=true;refreshDataStatus();`);
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
await test('Anonymous sessions cannot mutate or open editing forms',async()=>{assert.equal(await run('persistCloudRecipes([sample])'),false);run('openRecipeModal()');assert.notEqual(element('recipeModal').classList.contains('hidden'),false);assert.equal(transactions,0);assert.ok(classNames.has('cloud-readonly'))});
await test('Signed-in but unauthorized UID cannot mutate',async()=>{run("cloud.user={uid:'other-user'}");assert.equal(await run('persistCloudRecipes([sample])'),false);assert.equal(transactions,0)});
run(`cloud.user={uid:'${uid}',email:'editor@example.test'};`);
await test('Disconnected editor cannot mutate',async()=>{run('cloud.confirmed=false');assert.equal(await run('persistCloudRecipes([sample])'),false);assert.equal(transactions,0);run('cloud.confirmed=true')});
await test('Authorized edit writes recipe and revision atomically',async()=>{assert.equal(await run('persistCloudRecipes([sample])'),true);assert.equal(database.get('books/'+uid+'/recipes/'+sample.id).title,'番茄炒蛋');assert.equal(database.get('books/'+uid+'/recipes/sofia-book-state').revision,1);assert.equal(run('cloud.revision'),1)});
await test('No change is a no-op without transaction',async()=>{const count=transactions;assert.equal(await run('persistCloudRecipes(recipes)'),true);assert.equal(transactions,count)});
await test('Permission failure does not report success or change local/remote data',async()=>{failure={code:'permission-denied'};assert.equal(await run("persistCloudRecipes([{...sample,title:'unsaved'}])"),false);assert.equal(run('recipes[0].title'),'番茄炒蛋');assert.equal(database.get('books/'+uid+'/recipes/'+sample.id).title,'番茄炒蛋');failure=null});
await test('Stale revision is rejected without overwriting another device',async()=>{database.set('books/'+uid+'/recipes/sofia-book-state',{kind:'sofia-book-state',revision:2});assert.equal(await run("persistCloudRecipes([{...sample,title:'stale'}])"),false);assert.equal(database.get('books/'+uid+'/recipes/'+sample.id).title,'番茄炒蛋')});
await test('Public snapshot excludes version document and confirms server data',async()=>{context.snapshot=snapshot();run('receiveCloudSnapshot(snapshot)');assert.equal(run('recipes.length'),1);assert.equal(run('cloud.revision'),2);assert.equal(run('cloud.confirmed'),true)});
await test('Cache snapshots and pending writes do not grant editing authority',async()=>{context.snapshot={...snapshot(),metadata:{fromCache:true,hasPendingWrites:false}};run('receiveCloudSnapshot(snapshot)');assert.equal(run('cloud.confirmed'),false);context.snapshot={...snapshot(),metadata:{fromCache:false,hasPendingWrites:true}};run('receiveCloudSnapshot(snapshot)');assert.equal(run('cloud.confirmed'),false);context.snapshot=snapshot();run('receiveCloudSnapshot(snapshot)')});
await test('Import preserves cloud data when replacement consent is missing',async()=>{run('pendingImport={recipes:[],revision:cloud.revision}');element('importMode').value='replace';element('replaceConsent').checked=false;await run('applyRecipeImport()');assert.equal(run('recipes.length'),1)});
await test('Embedded photos, reserved IDs and oversized batches are rejected before writing',async()=>{assert.throws(()=>run("validateCloudRecipes([{...sample,imageUrl:'data:image/png;base64,AAAA'}])"));assert.throws(()=>run("validateCloudRecipes([{...sample,id:BOOK_STATE_ID}])"));assert.throws(()=>run("planCloudChanges([],Array.from({length:401},(_,i)=>({...sample,id:'r-'+i})))"));});
await test('Import preview is refreshed before applying a stale preview',async()=>{run('pendingImport={recipes:[{...sample,title:"changed"}],revision:cloud.revision-1}');element('importMode').value='update';const count=transactions;await run('applyRecipeImport()');assert.equal(transactions,count);assert.match(element('dataManagerMessage').textContent,/預覽已重新計算/)});
await test('Import commits and safe undo restores previous version',async()=>{listenerSync=true;await run('applyRecipeImport()');assert.equal(run('recipes[0].title'),'changed');assert.equal(run('cloud.undo.revision'),run('cloud.revision'));await run('undoLastImport()');assert.equal(run('recipes[0].title'),'番茄炒蛋');assert.equal(run('cloud.undo'),null)});
await test('Delete removes recipe but preserves version metadata',async()=>{run('pendingDeleteId=recipes[0].id;cloud.deleteBase=JSON.stringify(recipes[0])');await run('confirmCloudDelete()');assert.equal(run('recipes.length'),0);assert.equal(database.has('books/'+uid+'/recipes/'+sample.id),false);assert.ok(database.has('books/'+uid+'/recipes/sofia-book-state'))});
await test('Form saves keep input open on failure',async()=>{element('editRecipeId').value='';element('inputTitle').value='new dish';element('inputCategory').value='chinese';element('inputTime').value='5 分鐘';element('inputIngredients').value='salt';element('inputPrePrep').value='prep';element('inputSteps').value='cook';failure={code:'unavailable'};context.formEvent={preventDefault(){}};await run('saveRecipeFromModal(formEvent)');assert.equal(run('recipes.length'),0);assert.equal(element('inputTitle').value,'new dish');failure=null});
await test('Form saves commit after server acknowledgement',async()=>{await run('saveRecipeFromModal(formEvent)');assert.equal(run('recipes.length'),1);assert.equal(run('recipes[0].title'),'new dish')});
await test('Changed remote recipe blocks stale form overwrite',async()=>{run('cloud.editBase="stale"');element('editRecipeId').value=run('recipes[0].id');const count=transactions;await run('saveRecipeFromModal(formEvent)');assert.equal(transactions,count)});
await test('Failed import read and Base64 import never mutate data',async()=>{context.fileEvent={target:{value:'file',files:[{name:'bad.json',size:10,text:async()=>JSON.stringify([{...sample,imageUrl:'data:image/png;base64,AAAA'}])}]}};await run('readImportFile(fileEvent)');assert.equal(run('pendingImport'),null);assert.equal(run('recipes.length'),1);assert.match(element('dataManagerMessage').textContent,/內嵌照片/)});
await test('Metadata corruption disables editing without clearing last public content',async()=>{context.snapshot={metadata:{fromCache:false,hasPendingWrites:false},docs:[{id:'sofia-book-state',data:()=>({kind:'wrong',revision:1})}]};run('receiveCloudSnapshot(snapshot)');assert.equal(run('cloud.confirmed'),false);assert.equal(run('recipes.length'),1)});
assert.ok(!html.includes('localStorage.setItem'));
assert.equal((code.match(/async function saveRecipeFromModal/g)||[]).length,1);
await test('An owner cannot mutate another member book',async()=>{run("cloud.confirmed=true;cloud.ownerUid='someone-else';cloud.book={ownerId:'someone-else'}");const count=transactions;assert.equal(await run('persistCloudRecipes([sample])'),false);assert.equal(transactions,count);});

context.testSdk.collection=(db,...parts)=>parts.join('/');
await test('Only founder can access the legacy migration routine',async()=>{
  run("cloud.user={uid:'friend'};cloud.ownerUid='friend';cloud.book={ownerId:'friend'};cloud.confirmed=true");
  let reads=0;context.testSdk.getDocsFromServer=async()=>{reads++;return {docs:[]}};
  await run('migrateLegacyRecipes()');assert.equal(reads,0);
});
run("cloud.user={uid:'"+uid+"'};cloud.ownerUid='"+uid+"';cloud.book={ownerId:'"+uid+"'};cloud.confirmed=true");
context.snapshot=snapshot();run('receiveCloudSnapshot(snapshot)');
await test('Legacy migration adds missing IDs without overwriting newer personal content',async()=>{
  const oldTitle=run('recipes[0].title'),oldId=run('recipes[0].id');
  context.testSdk.getDocsFromServer=async ref=>{assert.equal(ref,'recipes');return {docs:[{id:oldId,data:()=>({...sample,id:oldId,title:'older title'})},{id:'legacy-added',data:()=>({...sample,id:'legacy-added',title:'舊版料理'})}]}};
  await run('migrateLegacyRecipes()');assert.equal(run('recipes.length'),2);assert.equal(run('recipes.find(r=>r.id!=="legacy-added").title'),oldTitle);assert.ok(database.has('books/'+uid+'/recipes/legacy-added'));
});
await test('Invalid legacy photo migration is rejected without changing destination',async()=>{
  const before=JSON.stringify([...database]);
  context.testSdk.getDocsFromServer=async()=>({docs:[{id:'legacy-photo',data:()=>({...sample,id:'legacy-photo',imageUrl:'data:image/png;base64,AAAA'})}]});
  await run('migrateLegacyRecipes()');assert.equal(JSON.stringify([...database]),before);
});

console.log('All '+passed+' cloud checks passed. No live Firebase writes performed.');
