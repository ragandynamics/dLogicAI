import { z } from 'zod';
const key=z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).refine(k=>!['constructor','prototype','__proto__'].includes(k));
export const fieldSchema=z.object({key,label:z.string().trim().min(1).max(120),help:z.string().max(300).default(''),type:z.enum(['text','textarea','email','number','date','select','checkbox']),required:z.boolean().default(false),options:z.array(z.string().trim().min(1).max(100)).max(30).default([]),min:z.number().finite().optional(),max:z.number().finite().optional(),show_if:z.object({field:key,equals:z.union([z.string().max(1000),z.boolean(),z.number()])}).optional()}).strict();
export const formSchema=z.object({show_in_widget:z.boolean().default(false),title:z.string().trim().min(1).max(120),description:z.string().max(1000).default(''),confirmation:z.string().trim().min(1).max(500).default('Your request was received.'),retention_days:z.number().int().min(1).max(365).default(30),fields:z.array(fieldSchema).min(1).max(30),action:z.object({connector_id:z.string().min(1).max(100),operation:z.enum(['create_lead','create_ticket','request_booking']),input_fields:z.record(z.string().max(100),key)}).strict().optional()}).strict().superRefine((form,ctx)=>{
 const seen=new Set<string>();for(const [i,f] of form.fields.entries()){
  if(seen.has(f.key))ctx.addIssue({code:'custom',path:['fields',i,'key'],message:'Field keys must be unique.'});
  if(f.show_if&&!seen.has(f.show_if.field))ctx.addIssue({code:'custom',path:['fields',i,'show_if'],message:'Conditions must refer to an earlier field.'});
  if(f.type==='select'&&(!f.options.length||new Set(f.options).size!==f.options.length))ctx.addIssue({code:'custom',path:['fields',i,'options'],message:'Provide unique choices.'});
  if(f.min!==undefined&&f.max!==undefined&&f.min>f.max)ctx.addIssue({code:'custom',path:['fields',i,'min'],message:'Minimum exceeds maximum.'});seen.add(f.key);
 }
 for(const field of Object.values(form.action?.input_fields||{}))if(!seen.has(field))ctx.addIssue({code:'custom',path:['action'],message:'Action mapping references a missing field.'});
});
export type FormDefinition=z.infer<typeof formSchema>;
export function validateAnswers(form:FormDefinition,input:unknown){
 const parsed=z.record(z.string(),z.union([z.string().max(4000),z.number().finite(),z.boolean()])).safeParse(input);
 if(!parsed.success)return {answers:{},errors:{_form:'Enter valid answers.'}};
 const answers:Record<string,string|number|boolean>=Object.create(null),errors:Record<string,string>={};
 for(const field of form.fields){
  if(field.show_if && answers[field.show_if.field]!==field.show_if.equals)continue;
  const value=parsed.data[field.key];const empty=value===undefined||value==='';
  if(empty){if(field.required)errors[field.key]='This field is required.';continue;}
  let valid=true;
  if(field.type==='checkbox')valid=typeof value==='boolean'&&(!field.required||value);
  else if(field.type==='number')valid=typeof value==='number'&&(field.min===undefined||value>=field.min)&&(field.max===undefined||value<=field.max);
  else{
   valid=typeof value==='string' && value.trim().length>0 && value.length<=(field.type==='textarea'?4000:1000);
   if(valid&&field.type==='email')valid=z.string().email().safeParse(value).success;
   if(valid&&field.type==='date')valid=/^\d{4}-\d{2}-\d{2}$/.test(String(value))&&!Number.isNaN(Date.parse(String(value)))&&new Date(String(value)).toISOString().slice(0,10)===value;
   if(valid&&field.type==='select')valid=field.options.includes(String(value));
  }
  if(!valid)errors[field.key]='Enter a valid value for this field.';
  else answers[field.key]=typeof value==='string'?value.trim():value;
 }
 return {answers,errors};
}
export const formTemplates={
 contact:{title:'Contact request',fields:[{key:'name',label:'Your name',type:'text',required:true},{key:'email',label:'Email address',type:'email',required:true},{key:'message',label:'How can we help?',type:'textarea',required:true}]},
 support:{title:'Support request',fields:[{key:'email',label:'Email address',type:'email',required:true},{key:'category',label:'Issue category',type:'select',options:['Account','Product','Other'],required:true},{key:'title',label:'Issue summary',type:'text',required:true},{key:'description',label:'Describe the issue',type:'textarea',required:true}]}
};
