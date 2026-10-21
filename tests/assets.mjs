import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root='dist';
let checks=0;
for(const base of ['https://example.github.io/','https://example.github.io/Sofia-Kitchen/']){
  const location=new URL('login.html',base),sandbox={URL,URLSearchParams,location,document:{getElementById:()=>({})}};
  sandbox.window=sandbox;
  const ctx=vm.createContext(sandbox);vm.runInContext(fs.readFileSync(root+'/member-shared.js','utf8'),ctx);
  for(const [raw,expected]of [[null,'index.html'],['./book.html?owner=test','book.html?owner=test'],[new URL('profile.html',base).pathname+'?id=10000001','profile.html?id=10000001'],['https://evil.example/','index.html'],['//evil.example/','index.html'],['../outside.html','index.html']]){
    sandbox.raw=raw;assert.equal(vm.runInContext('Member.safeNext(raw)',ctx),new URL(expected,base).pathname+new URL(expected,base).search);checks++;
  }
}
for(const file of fs.readdirSync(root).filter(file=>file.endsWith('.html'))){
  const html=fs.readFileSync(root+'/'+file,'utf8');
  assert.ok(!html.includes('demo-sdk.js'));
  assert.ok(!/(?:href|src)=["']\/(?!\/)/.test(html));
  for(const link of html.matchAll(/(?:href|src)=["']\.\/([^"'#?]+)/g))assert.ok(fs.existsSync(root+'/'+link[1]),'Missing '+link[1]);
  for(const script of html.matchAll(/<script[^>]+src=["'](\.\/[^"']+)/g))assert.match(script[1],/\?v=20261021-firebase-1$/);
  checks++;
}
for(const file of fs.readdirSync(root).filter(file=>file.endsWith('.js'))){
  const js=fs.readFileSync(root+'/'+file,'utf8');new vm.Script(js);
  assert.ok(!/['"]\/(?:index|login|book|discover|profile)\.html/.test(js));
  assert.ok(!js.includes('SOFIA_DEMO_LOADER'));checks++;
}
assert.ok(fs.readFileSync(root+'/firebase-config.js','utf8').includes('sofia-kitchen001'));
console.log('PASS '+checks+' production assets, Firebase mode and root/subpath redirect checks.');
