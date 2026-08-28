(() => {
  if(location.hostname!=='127.0.0.1') throw new Error('Fixture must run locally');
  const clientId='70000000-0000-4000-8000-000000000001',candidateId='70000000-0000-4000-8000-000000000002';
  let client={id:clientId,name:'Northshire Community Health',primary_invoice_email:'accounts@example.invalid',invoice_address:'Finance department\n12 Station Road',ap_phone:'020 7000 0000',vat_chargeable:true,payment_terms_days:0,client_address:'12 Station Road',contact_forename:'Sam',contact_surname:'Taylor',ts_queries_email:'staffing@example.invalid',notes:'Existing client notes'};
  let settings={timezone_id:'Europe/London',day_start:'07:00',day_end:'19:00',night_start:'19:00',night_end:'07:00',sat_start:'00:00',sat_end:'00:00',sun_start:'00:00',sun_end:'00:00',bh_start:'00:00',bh_end:'00:00',week_ending_weekday:0,default_submission_mode:'ELECTRONIC',weekly_mode:'HEALTHROSTER',hr_weekly_behaviour:'VERIFY',requires_hr:true,autoprocess_hr:true,no_timesheet_required:false,invoice_consolidation_mode:'BY_WEEK',candidate_paper_submission_enabled:false,daily_calc_of_invoices:false};
  let candidate={id:candidateId,title:'Ms',first_name:'Alex',last_name:'Morgan',display_name:'Alex Morgan',email:'alex@example.invalid',phone:'07700000000',pay_method:'PAYE',address_line1:'14 Example Street',address_line2:'Flat 2',address_line3:'',town_city:'Reading',county:'Berkshire',postcode:'RG1 1AA',country:'UK',band:'6',ni_number:'AB123456C',date_of_birth:'1990-03-15',gender:'Female',prof_reg_number:'AB123',notes:'Existing notes',key_norm:'',opt_in_email:true,opt_in_sms:true,opt_in_whatsapp:true,roles:[],job_titles:[],account_holder:'Alex Morgan',bank_name:'Example bank',sort_code:'12-34-56',account_number:'12345678',remittance_overrides_enabled:false};
  const writes=[];
  const jobTitles=[
    {id:'70000000-0000-4000-8000-000000000010',label:'Registered Nurse',is_role:true,active:true,requires_prof_reg:true,prof_reg_type:'NMC'},
    {id:'70000000-0000-4000-8000-000000000011',label:'Community Nurse',is_role:true,active:true,requires_prof_reg:true,prof_reg_type:'NMC'}
  ];
  candidate.job_titles=jobTitles.map((j,i)=>({job_title_id:j.id,is_primary:i===0}));
  candidate.prof_reg_type='NMC';
  const output=document.createElement('pre');output.id='fixture-results';output.style.cssText='white-space:pre-wrap;color:#dce5f7;padding:20px';
  const report=()=>{output.textContent=JSON.stringify({writes,client,settings,candidate},null,2);};
  const response=(json,status=200)=>Promise.resolve(new Response(JSON.stringify(json),{status,headers:{'Content-Type':'application/json'}}));
  const fixtureFetch=async(url,init={})=>{
    const pathname=new URL(String(url),location.origin).pathname,method=(init.method||'GET').toUpperCase();
    const body=init.body?JSON.parse(init.body):{};
    if(!['GET','HEAD'].includes(method)) {
      writes.push({path:pathname,method,body});
      if(/^\/api\/clients(?:\/[^/]+)?$/.test(pathname)) {
        if(body.client_settings) {
          settings={...settings,...body.client_settings};
          // Writes use the existing canonical flags, not the UI's mode aliases.
          settings.weekly_mode=settings.is_nhsp?'NHSP':settings.requires_hr?'HEALTHROSTER':'NONE';
          settings.hr_weekly_behaviour=settings.requires_hr&&settings.no_timesheet_required?'CREATE':'VERIFY';
        } else client={...(method==='POST'?{}:client),...body,id:clientId};
        report();return response({ok:true,client,client_settings:settings,id:clientId});
      }
      if(/^\/api\/candidates(?:\/[^/]+)?$/.test(pathname)) {candidate={...(method==='POST'?{}:candidate),...body,id:candidateId};report();return response({ok:true,candidate,id:candidateId});}
      report();return response({ok:true});
    }
    if(pathname.endsWith('/delete-eligibility'))return response({can_delete:false,reason:'Local fixture'});
    if(pathname===`/api/clients/${clientId}`)return response({client,client_settings:settings,has_e_history:false});
    if(pathname===`/api/candidates/${candidateId}`)return response({candidate,job_titles:candidate.job_titles.map((j,i)=>typeof j==='string'?{job_title_id:j,is_primary:i===0}:j),hr_aliases:[],has_e_history:false});
    if(pathname==='/api/job-titles')return response({items:jobTitles});
    if(pathname.includes('printed-timesheet')) return response({ok:true,candidate_paper_submission_enabled:settings.candidate_paper_submission_enabled});
    if(pathname.includes('/settings'))return response({settings:{},client_settings:settings});
    return response({ok:true,rows:[],items:[],clients:[],candidates:[],roles:[],job_titles:[],total:0});
  };
  // Only this local fixture replaces transports. No application code uses this.
  authFetch=fixtureFetch;
  window.fetch=fixtureFetch;
  const ready=()=>{
    for(const id of ['loginOverlay','tfaOverlay']){const el=document.getElementById(id);if(el)el.style.display='none';}
    const nav=document.createElement('div');nav.id='fixture-launchers';nav.style.cssText='position:relative;z-index:2;display:flex;flex-wrap:wrap;gap:12px;padding:24px;background:#0c172a';
    const actions=[['New candidate',()=>openCandidate({})],['Existing candidate',()=>openCandidate({id:candidateId})],['New client',()=>openClient({})],['Existing client',()=>openClient({id:clientId})]];
    for(const[label,action]of actions){const b=document.createElement('button');b.className='btn';b.textContent=label;b.onclick=async()=>{try{await action();}catch(error){output.textContent=JSON.stringify({fixtureError:String(error),stack:error.stack});}};nav.append(b);}
    document.body.prepend(nav);document.body.append(output);report();
  };
  setTimeout(ready,700);
})();
