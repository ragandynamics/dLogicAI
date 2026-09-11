import {spawn,execFileSync} from 'node:child_process';
const tail=spawn('cmd.exe',['/c','pnpm.cmd exec wrangler tail dlogicai-api-uat --format json --search DLOGICAI_UPSTREAM_FAILURE'],{stdio:['ignore','pipe','pipe']});
let buffer='';
tail.stdout.on('data',chunk=>{
 buffer+=chunk;
 let start=buffer.indexOf('{');
 if(start<0){buffer='';return;}
 buffer=buffer.slice(start);
 let depth=0,quoted=false,escaped=false;
 for(let i=0;i<buffer.length;i++){
  const c=buffer[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{')depth++;
  if(c==='}'&&--depth===0){
   try{const event=JSON.parse(buffer.slice(0,i+1));for(const log of event.logs||[]){const text=JSON.stringify(log.message);if(text.includes('DLOGICAI_UPSTREAM_FAILURE'))console.log(JSON.stringify({provider:'google',httpStatus:text.match(/status[^0-9]*(\d{3})/)?.[1]||'unknown'}));}}catch{}
   buffer=buffer.slice(i+1);i=-1;depth=0;
  }
 }
});
tail.stderr.on('data',()=>{});
console.log('Safe UAT status listener started');
setTimeout(()=>{try{execFileSync('taskkill.exe',['/PID',String(tail.pid),'/T','/F'],{stdio:'ignore'});}catch{}process.exit(0);},60000);

