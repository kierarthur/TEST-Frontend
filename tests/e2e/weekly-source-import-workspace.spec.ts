import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { externalRequests, mountOfficeShell } from './helpers/weekly-source-local-shell';

const workspaceScript = resolve(__dirname, '../../js/weekly-source/import-workspace.js');
const actionsScript = resolve(__dirname, '../../js/weekly-source/workspace-actions.js');
const stylePath = resolve(__dirname, '../../css/weekly-source.css');
const fixtures = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/weekly-source-workspace-actions-v1.json'),
  'utf8'
));

test.use({ storageState: { cookies: [], origins: [] } });

test('History opens a completed report and loads its immutable detail pages without a mutation',async({page},testInfo)=>{
  await loadOfficeFoundation(page);
  await page.evaluate(async fixture=>{
    const win=window as any,workspace={...fixture,combined_source_workspace:true};
    const report={report_key:'FINAL:proof',client:'Example Trust',source:'NHSP',period:'27 Sep 2026',
      report:'1234',finalised_at:'30 Sep 2026, 15:00',finalised_by:'Office user'};
    win.authFetch=async(url:string,options:any={})=>{
      if(!url.includes('/commands'))return {ok:true,json:async()=>workspace};
      const request=JSON.parse(options.body);win.__requests.push(request);
      if(request.action!=='COMBINED_REVIEW_WORKSPACE')throw new Error('Unexpected mutation');
      if(request.payload.tab!=='history')return {ok:true,json:async()=>({contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',
        tab:request.payload.tab,section:'questions',rows:[],counts:{questions:0},owners:[],scope_options:[],has_more:false})};
      if(request.payload.report_key)return {ok:true,json:async()=>({contract:'WEEKLY_SOURCE_COMPLETED_REPORT_V1',report,
        shifts:[{candidate:request.payload.cursor?'Second Worker':'First Worker',day_date:'21 Sep 2026',
          start:'09:00',end:'17:00',break_minutes:30,net_minutes:450,booking_reference:'123',
          source_total_cost_pence:5000,source_commission_pence:1000,source_shift_charge_pence:6000}],
        movements:[{candidate:'First Worker',day_date:'21 Sep 2026',booking_reference:'123',
          movement:'Positive',pay_ex_vat_pence:5000,invoice_charge_pence:6000,vat_pence:1200,
          total_inc_vat_pence:7200}],shift_count:2,movement_count:1,invoice_charge_pence:6000,
        has_more:!request.payload.cursor,next_cursor:request.payload.cursor?'':'second-page'})};
      return {ok:true,json:async()=>({contract:'WEEKLY_SOURCE_REPORT_HISTORY_V1',rows:[report],
        scope_options:[{week_ending:'2026-09-20',period:'20 Sep 2026'},{week_ending:'2026-09-27',period:'27 Sep 2026'}],has_more:false})};
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open('history');
  },fixtures.workspace);
  await expect(page.locator('[data-wsr-filter="week_ending"]')).toHaveValue('2026-09-27');
  await page.getByRole('button',{name:'View report',exact:true}).click();
  await expect(page.getByText('First Worker',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('30 min',{exact:true})).toBeVisible();
  await expect(page.getByText('Source charges',{exact:true})).toBeVisible();
  await page.getByText('£60.00',{exact:true}).first().click();
  await expect(page.getByText('Cost £50.00 · Commission £10.00 · Charge £60.00')).toBeVisible();
  await page.getByRole('button',{name:'Load more report details',exact:true}).click();
  await expect(page.getByText('Second Worker',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Load more report details',exact:true})).toHaveCount(0);
  for(const width of [390,768,1700]){
    await page.setViewportSize({width,height:900});
    for(const region of await page.locator('[data-wsr-table]').all())
      expect(await region.evaluate(element=>element.scrollWidth-element.clientWidth)).toBe(0);
  }
  await page.screenshot({path:testInfo.outputPath('completed-report-detail.png'),fullPage:true});
  await page.getByRole('button',{name:'Back to completed reports',exact:true}).click();
  await expect(page.getByRole('button',{name:'View report',exact:true})).toBeVisible();
  await page.locator('[data-wsr-filter="week_ending"]').selectOption('2026-09-20');
  await expect(page.locator('[data-wsr-filter="week_ending"]')).toBeFocused();
  await page.locator('#modalTabs').getByRole('button',{name:/^Queries/}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__requests.at(-1)?.payload.week_ending)).toBe('2026-09-20');
  expect(await page.evaluate(()=>(window as any).__requests.every((request:any)=>request.action==='COMBINED_REVIEW_WORKSPACE'))).toBe(true);
});

test('combined finalise reviews eligible clients only and retains their individual completion results',async({page},testInfo)=>{
  await loadOfficeFoundation(page);
  await page.evaluate(async(workspace:any)=>{
    const win=window as any; workspace.combined_source_workspace=true;
    const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
    const scopes=[1,2,3].map(n=>({key:String(n),client:`Client ${n}`,source:'HealthRoster',period:'27 Sep 2026',
      finalise_enabled:n!==3,blocked_count:n===3?1:0,scope:{source_cycle_id:id(n)},
      finalise_payload:{source_cycle_id:id(n),authority_scope_kind:'CYCLE',report_scope_id:null,
        upload_id:id(n+10),projection_publication_id:id(n+20),expected_authority_scope_version:1,
        expected_row_manifest_hash:'a'.repeat(64),expected_comparison_manifest_hash:'b'.repeat(64),expected_issue_set_hash:'c'.repeat(64)}}));
    win.authFetch=async(url:string,options:any={})=>{
      if(!url.includes('/commands'))return {ok:true,json:async()=>workspace};
      const request=JSON.parse(options.body);win.__requests.push(request);
      if(request.action==='COMBINED_FINALISE_WORKSPACE')return {ok:true,json:async()=>({
        contract:'WEEKLY_SOURCE_COMBINED_FINALISE_V1',list:request.payload.list,counts:{ready:2,blocked:1,complete:0},
        scopes,scope_options:[],obligations:[],summary:{missing_previous_reports:1},has_more:false,
        rows:scopes.filter(scope=>request.payload.list==='blocked'?scope.blocked_count:request.payload.list==='complete'?false:!scope.blocked_count).map(scope=>({scope_key:scope.key,row_key:scope.key,client:scope.client,candidate:'Example Worker',period:scope.period,source:scope.source,
          day_date:'21 Sep 2026',system_hours:'09:00–17:00 · 30 min break',status:{text:scope.blocked_count?'Blocked':'Ready'},actions:[]}))
      })};
      return {ok:true,json:async()=>({ok:true,status:'FINALISED',source_finalised:true,invoice_authority_committed:true,
        source_finalisation:{source_cycle_id:request.payload.source_cycle_id,final_revision_id:id(99)}})};
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open('finalise');
  },fixtures.workspace);
  await expect(page.locator('[data-wsc-select="3"]')).toHaveCount(0);
  await page.locator('[data-wsc-list="blocked"]').click();
  await expect(page.locator('[data-wsc-select="3"]')).toBeDisabled();
  await page.locator('[data-wsc-list="ready"]').click();
  await expect(page.locator('#modalTabs button.active')).toHaveText(/Finalise report/);
  await expect(page.locator('[data-wsc-table] tbody tr')).toHaveCount(2);
  expect(await page.locator('[data-wsc-sort="client"]').evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
  for(const width of [390,1700]){
    await page.setViewportSize({width,height:900});
    expect(await page.locator('[data-wsc-table]').evaluate(element=>element.scrollWidth-element.clientWidth)).toBe(0);
  }
  await page.screenshot({path:testInfo.outputPath('combined-finalise-desktop.png'),fullPage:true});
  await page.locator('[data-wsc-progress="missing"]').click();
  await expect(page.locator('[data-wsc-obligations]')).toHaveAttribute('open','');
  await page.locator('[data-wsc-select-all]').click();
  await page.locator('[data-wsc-review]').click();
  await expect(page.getByRole('heading',{name:'Finalisation review'})).toBeVisible();
  await page.locator('[data-wsc-run]').click();
  await expect(page.locator('[data-wsc-dismiss]')).toHaveText('Done');
  const calls=await page.evaluate(()=>(window as any).__requests.filter((request:any)=>request.action!=='COMBINED_FINALISE_WORKSPACE'));
  expect(calls).toHaveLength(2);
  expect(calls.map((request:any)=>request.payload.source_cycle_id)).toEqual([
    '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002']);
});

test('combined query Open accepts only selected eligible shifts after explicit confirmation',async({page})=>{
  await loadOfficeFoundation(page);
  await page.evaluate(async fixture=>{
    const win=window as any, workspace={...fixture,combined_source_workspace:true};
    const group={...fixture.queries.rows[0],combined_key:'accept-row',scope_key:'accept-cycle'};
    group.actions=[{label:'Open',enabled:true,payload:{detail:{candidate:group.candidate,
      client:group.client,shifts:group.children}}}];
    win.authFetch=async(url:string,options:any={})=>{
      if(!url.includes('/commands'))return {ok:true,json:async()=>workspace};
      const request=JSON.parse(options.body);win.__requests.push(request);
      if(request.action==='COMBINED_REVIEW_WORKSPACE')return {ok:true,json:async()=>({
        contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',tab:'queries',section:'questions',
        rows:[group],owners:[],scope_options:[],counts:{questions:1},has_more:false})};
      if(request.action!=='ACCEPT_SYSTEM_HOURS')throw new Error('Unexpected command');
      return {ok:true,json:async()=>({ok:true,status:'COMPLETE'})};
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open('queries');
  },fixtures.workspace);
  await page.getByRole('button',{name:'Open',exact:true}).click();
  await expect(page.locator('[data-wsa-accept-selected]')).toBeDisabled();
  await page.locator('[data-wsa-accept-incident]').first().check();
  await page.locator('[data-wsa-accept-selected]').click();
  await expect(page.getByRole('dialog',{name:'Accept system hours',exact:true})).toBeVisible();
  await expect(page.locator('[data-wsa-run-command]')).toBeDisabled();
  await expect(page.getByText('Mon 14 Sep 2026: 09:00-18:00 (30 min break)',{exact:true})).toBeVisible();
  await expect(page.getByText('Mon 14 Sep 2026: 09:00-17:00 (30 min break)',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__requests.filter((r:any)=>r.action==='ACCEPT_SYSTEM_HOURS'))).toHaveLength(0);
  await page.getByLabel('I confirm the system hours are correct for the selected shifts.').check();
  await page.locator('#modalBody').getByRole('button',{name:'Accept system hours',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__requests.filter((r:any)=>r.action==='ACCEPT_SYSTEM_HOURS').length)).toBe(1);
  const actual=await page.evaluate(()=>(window as any).__requests.find((r:any)=>r.action==='ACCEPT_SYSTEM_HOURS').payload);
  const expected=structuredClone(fixtures.workspace.queries.rows[0].accept_system_hours_action.payload);
  expected.selection.incident_ids=expected.selection.incident_ids.slice(0,1);
  expect(actual).toEqual(expected);
});

test('Office checks show source identity and prefill candidate search without a false empty match',async({page})=>{
  await loadOfficeFoundation(page);
  await page.evaluate(async fixture=>{
    const win=window as any,workspace={...fixture,combined_source_workspace:true};
    const row={combined_key:'checks:baljit',row_key:'baljit',section:'checks',
      client:'Berkshire Healthcare NHS Foundation Trust',candidate:'Rai-Baptiste Baljit',
      source_reference:'CCR-02611',booking_reference:'155154209',day_date:'Mon 21 Sep 2026',
      system_hours:'09:00–17:00 (30 min break)',status:{text:'Needs correction'},
      problem:'No active candidate matches this source row',actions:[{label:'Link candidate',enabled:true,
        payload:{candidate:'Rai-Baptiste Baljit',client:'Berkshire Healthcare NHS Foundation Trust',
          shift:'21 Sep 2026',detail:{source_reference:'CCR-02611',booking_reference:'155154209'},
          recheck_payload:{request_id:'test'}}}]};
    win.authFetch=async(url:string,options:any={})=>{
      if(!url.includes('/commands'))return {ok:true,json:async()=>workspace};
      const request=JSON.parse(options.body);win.__requests.push(request);
      if(request.action!=='COMBINED_REVIEW_WORKSPACE')throw new Error('Unexpected mutation');
      return {ok:true,json:async()=>({contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',
        tab:'queries',section:request.payload.section||'questions',
        rows:request.payload.section==='checks'?[row]:[],counts:{questions:0,checks:1,protected:0},
        owners:[],scope_options:[],has_more:false})};
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open('queries');
  },fixtures.workspace);
  await page.locator('[data-wsr-section="checks"]').click();
  await expect(page.getByText('Source ref: CCR-02611')).toBeVisible();
  await expect(page.getByText('Booking: 155154209')).toBeVisible();
  await page.getByRole('button',{name:'Link candidate'}).click();
  await expect(page.getByRole('dialog',{name:'Link candidate'})).toBeVisible();
  await expect(page.getByText('Source worker reference:')).toBeVisible();
  await expect(page.getByText('CCR-02611',{exact:true})).toBeVisible();
  await expect(page.getByText('Booking reference:')).toBeVisible();
  await expect(page.getByRole('textbox',{name:/Type at least 2 characters/})).toHaveValue('Baljit');
  expect(await page.evaluate(()=>(window as any).__requests.some((request:any)=>request.action==='RECHECK_SOURCE'))).toBe(false);
});

test('combined queries retain independent cycle actions and full-result seek',async({page},testInfo)=>{
  await loadOfficeFoundation(page);
  await page.evaluate(async fixture=>{
    const win=window as any;
    const workspace={...fixture,combined_source_workspace:true};
    const rows=[1,2].map(n=>({combined_key:'row'+n,scope_key:'cycle'+n,row_key:'qg_'+String(n).repeat(64),
      group_key:'qg_'+String(n).repeat(64),candidate:'Worker '+n,candidate_sort:'Worker '+n,client:'Trust '+n,
      source:'NHSP',period:'27 Sep 2026',issues:1,status:{text:'Needs action'},actions:[{label:'Open',enabled:true}],
      children:[{day_date:'21 Sep 2026',candidate_hours:'7 hours',system_hours:'7.5 hours',issue:'Hours differ',
        actions:[{label:'Protect pay',enabled:true,payload:{work_date:'2026-09-21',candidate_id:'candidate'+n}}]}]}));
    const owners=[1,2].map(n=>({key:'cycle'+n,protected_pay_enabled:true,bulk_actions:{
      selection_complete:true,ask_candidates:{enabled:true,request:{source_cycle_id:'cycle'+n,
        projection_publication_id:'publication'+n,expected_workspace_version:'version'+n,
        selection:{filters:{},selection_proof:'proof'+n}}}}}));
    win.__actions=[];win.addEventListener('cloudtms:weekly-source-action',(event:any)=>win.__actions.push(event.detail));
    win.authFetch=async(url:string,options:any={})=>{
      if(url.includes('/commands')){
        const request=JSON.parse(options.body);win.__requests.push(request);
        if(request.action==='COMBINED_REVIEW_WORKSPACE')return {ok:true,json:async()=>({
          contract:'WEEKLY_SOURCE_COMBINED_REVIEW_V1',tab:request.payload.tab,section:request.payload.section,
          counts:{questions:2},rows:request.payload.tab==='queries'?rows:[],owners,scope_options:[],
          has_more:false,sort_key:request.payload.sort_key,sort_direction:request.payload.sort_direction
        })};
        return {ok:true,json:async()=>({ok:true,status:'COMPLETE'})};
      }
      return {ok:true,json:async()=>workspace};
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open('queries');
  },fixtures.workspace);
  await expect(page.locator('[data-wsr-select]')).toHaveCount(2);
  await page.evaluate(()=>document.body.classList.add('ctms-summary-proposal'));
  for (const width of [280,390,768,1700]) {
    await page.setViewportSize({width,height:900});
    expect(await page.locator('[data-wsr-table]').evaluate(element=>element.scrollWidth-element.clientWidth)).toBe(0);
    const buttons=page.locator('[data-wsr-table] tbody tr').first().locator('td.ws-actions > button');
    await expect(buttons).toHaveCount(1);
    await expect(buttons.first()).toBeVisible();
  }
  await page.screenshot({path:testInfo.outputPath('combined-queries-desktop.png'),fullPage:true});
  await page.locator('[data-wsr-select="row1"]').check();
  await page.locator('[data-wsr-select="row2"]').check();
  await page.locator('[data-wsr-outreach="ASK_CANDIDATES"]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__requests.filter((item:any)=>item.action==='ASK_CANDIDATES'))).toHaveLength(2);
  const sent=await page.evaluate(()=>(window as any).__requests.filter((item:any)=>item.action==='ASK_CANDIDATES'));
  expect(sent.map((item:any)=>item.payload.source_cycle_id)).toEqual(['cycle1','cycle2']);
  expect(sent[0].payload.selection.group_keys).toEqual(['qg_'+'1'.repeat(64)]);
  expect(sent[1].payload.selection.group_keys).toEqual(['qg_'+'2'.repeat(64)]);
  await page.getByText('Shifts for Worker 1',{exact:true}).click();
  for (const width of [280,390,768,1700]) {
    await page.setViewportSize({width,height:900});
    expect(await page.locator('[data-wsr-table]').evaluate(element=>element.scrollWidth-element.clientWidth)).toBe(0);
  }
  await page.locator('[data-wsr-row="row1"][data-wsr-child="0"]').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__actions.at(-1)?.payload?.candidate_id)).toBe('candidate1');
  await expect(page.locator('#modalTitle')).toHaveText('Protect shift pay');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.locator('[data-wsr-select]')).toHaveCount(2);
  await page.locator('[data-wsr-table]').focus();
  await page.keyboard.type('Tr');
  await expect.poll(()=>page.evaluate(()=>(window as any).__requests.filter((item:any)=>item.action==='COMBINED_REVIEW_WORKSPACE').at(-1)?.payload.seek)).toBe('Tr');
});

test('file View loads its own bounded shift details without accepting or changing the import',async({page},testInfo)=>{
  await loadOfficeFoundation(page);
  await page.evaluate(()=>{
    const win=window as any;
    const officeAuthFetch=win.authFetch;
    win.authFetch=async(_url:string,options:any)=>{
      if(!_url.includes('/weekly-source/v1/commands'))return officeAuthFetch(_url,options);
      const request=JSON.parse(options.body);win.__requests.push(request);
      return {ok:true,json:async()=>({contract:'WEEKLY_SOURCE_UPLOAD_DETAIL_V1',upload_id:'file-one',
        file:'NHSP report.xlsx',purpose:'Checking hours',uploaded:'1 Oct 2026, 10:00',coverage:'21 Sep 2026 to 21 Sep 2026',
        status:'Current',rows:2,final_source:'Not finalised',has_more:!request.payload.cursor,next_cursor:'page-two',
        shifts:[{candidate:request.payload.cursor?'Kier Arthur':'Rai-Baptiste Baljit',client:'Test Trust',
          source_reference:'CCR-02611',booking_reference:'155154209',day_date:'21 Sep 2026',
          system_hours:'09:00–17:00 · 30 min break',status:'Needs correction',issue:'Candidate needs linking'}]})};
    };
    win.CloudTMSWeeklySourceWorkspaceActionsV1.handleAction({label:'View',payload:{upload_id:'file-one'}});
  });
  await expect(page.getByRole('heading',{name:'NHSP report.xlsx'})).toBeVisible();
  await expect(page.getByText('Rai-Baptiste Baljit',{exact:true})).toBeVisible();
  await expect(page.getByText('Checking hours',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Load more shifts'}).click();
  await expect(page.getByText('Kier Arthur',{exact:true})).toBeVisible();
  await expect(page.getByText('Rai-Baptiste Baljit',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Load more shifts'})).toHaveCount(0);
  const requests=await page.evaluate(()=>(window as any).__requests);
  expect(requests.map((item:any)=>item.action)).toEqual(['UPLOAD_DETAIL','UPLOAD_DETAIL']);
  expect(requests[1].payload).toEqual({upload_id:'file-one',limit:50,cursor:'page-two'});
  for(const width of [390,1280,1700]){
    await page.setViewportSize({width,height:1000});
    await expect.poll(()=>page.locator('#modal').evaluate(el=>{
      const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;
    })).toBe(true);
  }
  await page.locator('#modal').screenshot({path:testInfo.outputPath('file-details-office.png')});
});

async function loadOfficeFoundation(page: import('@playwright/test').Page) {
  await page.setViewportSize({width:1700,height:1000});
  await mountOfficeShell(page,{broker(pathname){
    if(pathname.startsWith('/api/weekly-source/v1/workspace')) return fixtures.workspace;
    return undefined;
  }});
  await page.waitForFunction(()=>typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open==='function');
  await page.evaluate(()=>{(window as any).__requests=[];});
}

test('protected shift editor uses the real Office modal at desktop and phone widths',async({page},testInfo)=>{
  await loadOfficeFoundation(page);
  await page.evaluate(()=>{
    const win=window as any, original=win.authFetch;
    win.authFetch=async(url:string,options:any)=>{
      if(!url.includes('/weekly-source/v1/commands'))return original(url,options);
      const request=JSON.parse(options.body);win.__requests.push(request);
      return {ok:true,json:async()=>({contract:'WEEKLY_PROTECTED_EDITOR_V1',allowed:true,
        client:'CloudTMS Stage 8 NHSP Test Trust',candidate:'Kier Arthur',
        client_id:'11111111-1111-4111-8111-111111111111',candidate_id:'22222222-2222-4222-8222-222222222222',
        work_date:'2026-09-21',candidate_hours:'09:00–17:00 · 30 min break',source_hours:'No shift on the source report',
        contracts:[{id:'33333333-3333-4333-8333-333333333333',label:'Band 6 · Community nursing · 1 Sep – 30 Nov 2026'}]})};
    };
    win.CloudTMSWeeklySourceWorkspaceActionsV1.handleAction({label:'Protect pay',payload:{
      client_id:'11111111-1111-4111-8111-111111111111',candidate_id:'22222222-2222-4222-8222-222222222222',
      work_date:'2026-09-21',start:'09:00',end:'16:00',break_minutes:15}});
  });
  await expect(page.locator('[data-protected-field="contract_id"]')).toContainText('Band 6');
  await expect(page.locator('[data-protected-net]')).toHaveText('6 hours 45 minutes');
  for(const width of [390,1700]){
    await page.setViewportSize({width,height:1000});
    expect(await page.locator('#modalBody').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(()=>page.locator('#modal').evaluate(el=>{
      const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;
    })).toBe(true);
    await page.locator('[data-protected-field="start"]').click({trial:true});
    await page.locator('#modal').screenshot({path:testInfo.outputPath(`protected-shift-office-${width}.png`)});
  }
  expect(await page.evaluate(()=>(window as any).__requests.map((r:any)=>r.action))).toEqual(['PROTECTED_EDITOR_CONTEXT']);
});

test('new protected shift retains client and candidate selected through the real picker Apply buttons', async ({ page }) => {
  await loadOfficeFoundation(page);
  const clientId = '11111111-1111-4111-8111-111111111111';
  const candidateId = '22222222-2222-4222-8222-222222222222';
  await page.evaluate(({ clientId, candidateId }) => {
    const win = window as any;
    const original = win.authFetch;
    win.__pickerData = {
      clients: { since: null, itemsById: { [clientId]: { id: clientId, name: 'Example Trust' } } },
      candidates: { since: null, itemsById: { [candidateId]: {
        id: candidateId, display_name: 'Kier Arthur', first_name: 'Kier', last_name: 'Arthur', active: true
      } } }
    };
    win.authFetch = async (url: string, options: any = {}) => {
      if (url.includes(`/api/clients/${clientId}`)) return { ok: true, json: async () => ({ id: clientId, name: 'Example Trust' }) };
      if (url.includes(`/api/candidates/${candidateId}`)) return { ok: true, json: async () => ({
        id: candidateId, first_name: 'Kier', last_name: 'Arthur', display_name: 'Kier Arthur', active: true
      }) };
      if (url.includes('/weekly-source/v1/commands')) {
        const request = JSON.parse(options.body);
        win.__requests.push(request);
        return { ok: true, json: async () => ({ contract: 'WEEKLY_PROTECTED_EDITOR_V1', allowed: true,
          client_id: clientId, candidate_id: candidateId, work_date: '2026-09-21', contracts: [] }) };
      }
      return original(url, options);
    };
    win.CloudTMSWeeklySourceWorkspaceActionsV1.handleAction({ label: 'Add protected shift', payload: {} });
  }, { clientId, candidateId });
  await page.locator('[data-protected-choose="client"]').click();
  await page.locator(`[data-picker-kind="client"] tr[data-id="${clientId}"] td`).first().click();
  await page.locator('#btnSave').click();
  await expect(page.locator('[data-protected-editor] .ws-child-context strong').first()).toHaveText('Example Trust');

  await page.locator('[data-protected-choose="candidate"]').click();
  await page.locator(`[data-picker-kind="candidate"] tr[data-id="${candidateId}"] td`).first().click();
  await page.locator('#btnSave').click();
  await expect(page.locator('[data-protected-editor] .ws-child-context strong').nth(1)).toHaveText('Arthur, Kier');
  expect(await page.evaluate(() => (window as any).__requests)).toEqual([]);
  await page.locator('[data-protected-field="work_date"]').fill('2026-09-21');
  await page.locator('[data-protected-field="work_date"]').blur();
  await expect.poll(() => page.evaluate(() => (window as any).__requests.length)).toBe(1);
  await expect(page.locator('[data-protected-editor] .ws-child-context strong').first()).toHaveText('Example Trust');
  await expect(page.locator('[data-protected-editor] .ws-child-context strong').nth(1)).toHaveText('Arthur, Kier');
});

test('protecting an existing imported shift locks its identity while Add protected shift remains separate', async ({ page }) => {
  await loadFoundation(page);
  const result = await page.evaluate(() => {
    const editor = (window as any).CloudTMSProtectedShiftEditorV1;
    const context = { allowed: true, client: 'Example Trust', candidate: 'Kier Arthur',
      source_family: 'NHSP', source_hours: '09:00–17:00 · 30 min break',
      contracts: [{ id: '33333333-3333-4333-8333-333333333333', label: 'Band 6' }],
      events: [{ work_event_id: '44444444-4444-4444-8444-444444444444', source_hours: '09:00–17:00' }] };
    const values = { work_date: '2026-09-21', start: '09:00', end: '16:00', break_minutes: 15,
      contract_id: context.contracts[0].id, shift_choice: context.events[0].work_event_id };
    return { existing: editor.render(context, values, { lockedIdentity: true }),
      missing: editor.render(context, values, { lockedIdentity: false }) };
  });
  expect(result.existing).toContain('Imported NHSP Shift:');
  expect(result.existing).not.toContain('Choose candidate');
  expect(result.existing).not.toContain('Choose client');
  expect(result.existing).not.toContain('A separate new shift');
  expect(result.existing).toMatch(/data-protected-field="work_date"[^>]*data-ctms-intentional-lock="1"/);
  expect(result.existing).toMatch(/data-protected-field="contract_id" disabled data-ctms-intentional-lock="1"/);
  expect(result.missing).toContain('Choose candidate');
  expect(result.missing).toContain('A separate new shift');
});

test('an overdue open cycle says cutoff passed in report detail without changing finalisation authority', async ({ page }) => {
  await loadFoundation(page);
  const labels = await page.evaluate((fixture: any) => {
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    const render = (cutoff: string) => {
      const workspace = api.normaliseWorkspace({ ...fixture, combined_source_workspace: false,
        context: { ...fixture.context, cycle_state: 'Before cutoff', controls: [
          { key: 'cutoff', label: 'Cutoff', value: cutoff, options: [] }
        ] } });
      return api.renderWorkspace(workspace, 'imports', { toolbarOnly: true });
    };
    return { overdue: render('30/09/2000 15:00'), future: render('30/09/2099 15:00') };
  }, fixtures.workspace);
  expect(labels.overdue).toContain('Cutoff passed · not finalised');
  expect(labels.overdue).not.toContain('>Before cutoff</span>');
  expect(labels.future).toContain('>Before cutoff</span>');
});

test('Queries shades each shift independently and marks a mixed group red', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(() => {
    const review = (window as any).CloudTMSCombinedReviewV1;
    const model = { contract: 'WEEKLY_SOURCE_COMBINED_REVIEW_V1', tab: 'queries',
      section: 'questions', rows: [{ combined_key: 'kier-week', client: 'Example Trust',
        candidate: 'Kier Arthur', source: 'NHSP', period: '2 Oct 2026',
        children: [{ issue: 'Timesheet missing', day_date: '21 Sep 2026' },
          { issue: 'Manually queried', day_date: '22 Sep 2026' }] }] };
    document.getElementById('modalBody')!.innerHTML = review.render(model);
  });
  await expect(page.locator('tr.ws-query-hold').first()).toBeVisible();
  await page.locator('.ws-query-expansion summary').click();
  await expect(page.locator('.ws-query-shifts tbody tr').nth(0)).toHaveClass(/ws-query-nonblocking/);
  await expect(page.locator('.ws-query-shifts tbody tr').nth(1)).toHaveClass(/ws-query-hold/);
  await expect(page.getByText('Manually queried')).toBeVisible();
});

test('Query progress does not call queued outreach contacted and retains candidate-manager disagreement', async ({ page }) => {
  await loadFoundation(page);
  const result = await page.evaluate(() => {
    const summary = (window as any).CloudTMSCombinedReviewV1.questionSummary;
    const base = { candidate_asked: true, manager_informed: false, source_family: 'NHSP',
      children: [{ issue: 'Hours differ' }] };
    return { queued: summary(base), disagreed: summary({ ...base, manager_informed: true,
      children: [{ issue: 'Hours differ', candidate_response: 'My hours are correct',
        candidate_contacted_at: '2 Oct 2026, 14:30', manager_response: 'System hours are correct',
        manager_contacted_at: '2 Oct 2026, 15:00' }] }) };
  });
  expect(result.queued.candidate).toBe('Candidate not contacted');
  expect(result.disagreed.candidate).toBe('My hours are correct');
  expect(result.disagreed.manager).toBe('System hours are correct');
  expect(result.disagreed.next).toBe('Speak to candidate');
  expect(result.disagreed.managerHint).toContain('2 Oct 2026, 15:00 UK');
});

async function loadFoundation(page: import('@playwright/test').Page) {
  await page.setContent(`<!doctype html><html><head></head><body><header><h1 id="modalTitle"></h1><button id="btnCloseModal" type="button">Close</button></header><nav id="modalTabs"></nav><main id="modalBody"></main></body></html>`);
  await page.addStyleTag({ content: `
    :root{--panel:#0f172a;--line:#334155;--muted:#94a3b8;--accent:#3b82f6;color-scheme:dark}
    *{box-sizing:border-box} body{margin:0;padding:12px;background:#020617;color:#f8fafc;font:14px/1.4 Arial,sans-serif;overflow-x:hidden}
    button,input,select,textarea{font:inherit;color:inherit;background:#111827;border:1px solid #475569;border-radius:7px;padding:7px}
    .btn{min-height:40px;padding:7px 11px}.primary{background:#2563eb}.grid th,.grid td{padding:8px;border-bottom:1px solid #334155;text-align:left}
    header{display:flex;justify-content:space-between;align-items:center} #modalBody{min-width:0;max-width:1120px;margin:0 auto}
  ` });
  await page.addStyleTag({ path: stylePath });
  for(const module of ['finalise-batch','combined-finalise','combined-review','protected-shift-editor']) {
    await page.addScriptTag({path:resolve(__dirname,`../../js/weekly-source/${module}.js`)});
  }
  await page.addScriptTag({ path: workspaceScript });
  await page.addScriptTag({ path: actionsScript });
  await page.evaluate(({ workspaceFixture, correctionPreview }) => {
    const win = window as any;
    win.__modalStack = [];
    win.html = (value: unknown) => String(value ?? '');
    win.API = (path: string) => path;
    win.__requests = [];
    win.__nativeConfirmCalls = 0;
    win.authFetch = async (url: string, options: Record<string, unknown> = {}) => {
      if (String(url).includes('/commands')) {
        const request = JSON.parse(String((options as any).body || '{}'));
        win.__requests.push(request);
        return { ok: true, json: async () => request.action === 'PREVIEW_CORRECT_FINAL_SOURCE'
          ? correctionPreview : ({ ok: true, status: 'CORRECTED' }) };
      }
      if (String(url).includes('/uploads/accept')) {
        win.__requests.push({ action: 'UPLOAD_ACCEPT', payload: JSON.parse(String((options as any).body || '{}')) });
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => workspaceFixture };
    };
    win.uploadImportFileToR2 = async (file: File) => ({ fileKey: `mock/${file.name}`, filename: file.name });
    win.showModal = (title: string, tabs: Array<{key:string;label:string}>, render: (key:string) => unknown, _save: unknown, _hasId: unknown, onReturn: (() => void) | null, options: Record<string, unknown> = {}) => {
      const frame: any = {
        kind: options.kind || null,
        isDirty: false,
        _snapshot: { data: {} },
        _updateButtons() {},
        tabs: tabs.slice(),
        currentTabKey: tabs[0]?.key || 'main',
        async setTab(key: string) {
          frame.currentTabKey = key;
          document.getElementById('modalTitle')!.textContent = title;
          document.getElementById('modalTabs')!.innerHTML = frame.tabs.map((tab: any) => `<button type="button" data-test-tab="${tab.key}">${tab.label}</button>`).join('');
          document.getElementById('modalBody')!.innerHTML = String(render(key) ?? '');
          if (typeof onReturn === 'function') onReturn();
        }
      };
      win.__modalStack.push(frame);
      frame.setTab(frame.currentTabKey);
      return frame;
    };
    win.closeModal = () => {
      if (win.__modalStack.at(-1)?.isDirty) {
        win.__nativeConfirmCalls += 1;
        return;
      }
      win.__modalStack.pop();
      const parent = win.__modalStack.at(-1);
      if (parent) parent.setTab(parent.currentTabKey);
      else document.getElementById('modalBody')!.replaceChildren();
    };
    document.getElementById('btnCloseModal')!.addEventListener('click', win.closeModal);
  }, { workspaceFixture: fixtures.workspace, correctionPreview: fixtures.correctFinalPreview });
}

test('contract review loads the complete current contract and fails safely without opening an empty record', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(() => {
    const win = window as any;
    win.__contractOpens = [];
    win.__contractReads = [];
    win.getContract = async (id: string) => {
      win.__contractReads.push(id);
      return win.__contractReadFails ? null : { contract: { id, client_id: 'client', candidate_id: 'candidate' }, counts: { weeks: 2 } };
    };
    win.openContract = (data: unknown, options: unknown) => win.__contractOpens.push({ data, options });
    win.CloudTMSWeeklySourceWorkspaceActionsV1.handleAction({ label: 'Open charge details', payload: {
      detail: { candidate: 'Example worker', contract_id: 'contract-1', problem: 'Charge does not match' }
    } });
  });
  await page.getByRole('button', { name: 'Review contract', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__contractOpens)).toEqual([{
    data: { contract: { id: 'contract-1', client_id: 'client', candidate_id: 'candidate' }, counts: { weeks: 2 } },
    options: { noParentGate: true }
  }]);
  await page.evaluate(() => { (window as any).__contractReadFails = true; });
  await page.getByRole('button', { name: 'Review contract', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Contract details could not be loaded. Please try again.');
  expect(await page.evaluate(() => (window as any).__contractOpens.length)).toBe(1);
});

test('prepared HealthRoster before cutoff requires the explicit mixed-shift exclusion acknowledgement', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(async (fixture) => {
    const win = window as any;
    const workspace = structuredClone(fixture);
    workspace.profile = { id: 'HEALTHROSTER_V1', label: 'HealthRoster', finalise_label: 'Finalise report' };
    workspace.context.cycle_state = 'Before cutoff';
    Object.assign(workspace.finalise, {
      prepared: true, active_list: 'ready', finalise_enabled: true,
      ready: { total_count: 1, rows: [] }, blocked: { total_count: 0, rows: [] },
      confirmation_text: 'I confirm the prepared HealthRoster report.',
      exclusion_confirmation: 'I understand that the non-finalised shifts are excluded and previous finalised positions may be reversed.',
      excluded_rows: [{ candidate: 'Example worker', day_date: 'Mon 21 Sep 2026', problem: 'Not finalised in HealthRoster', actions: [] }],
      finalise_payload: { source_cycle_id: '22222222-2222-4222-8222-222222222222' }
    });
    win.authFetch = async (url: string, options: any = {}) => {
      if (url.includes('/commands')) {
        win.__requests.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => workspace };
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open();
    await win.__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  const finalise = page.locator('[data-ws-finalise]');
  await expect(finalise).toBeDisabled();
  await page.locator('[data-ws-finalise-confirm]').check();
  await expect(finalise).toBeDisabled();
  await page.locator('[data-ws-exclusion-confirm]').check();
  await expect(finalise).toBeEnabled();
  await finalise.click();
  await expect.poll(() => page.evaluate(() => (window as any).__requests)).toEqual([
    { action: 'FINALISE_WEEK', payload: { source_cycle_id: '22222222-2222-4222-8222-222222222222', exclude_unfinalised_acknowledged: true } }
  ]);
});

test('Queries keeps the two selection planes separate and uses only sticky header checkboxes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1700, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async () => {
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    await (window as any).__modalStack.at(-1).setTab('queries');
  });
  await page.waitForTimeout(50);

  const outreach = page.getByRole('checkbox', { name: 'Select all query groups' });
  const shifts = page.getByRole('checkbox', { name: 'Select all shifts in this group' });
  await expect(outreach).toHaveCount(1);
  await expect(shifts).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: 'Candidate says they worked' })).toBeVisible();
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);

  const sticky = await shifts.evaluate((input) => {
    const cell = input.closest('th')!;
    const style = getComputedStyle(cell);
    return { position: style.position, left: style.left, width: Math.round(cell.getBoundingClientRect().width) };
  });
  expect(sticky).toEqual({ position: 'sticky', left: '0px', width: 48 });

  await outreach.check();
  await expect(page.getByLabel('Select Jane Smith')).toBeChecked();
  await expect(page.getByLabel('Select Mon 14 Sep 2026')).not.toBeChecked();

  await shifts.check();
  await expect(page.getByLabel('Select Mon 14 Sep 2026')).toBeChecked();
  await expect(page.getByLabel('Select Tue 15 Sep 2026')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Accept system hours for selected shifts' })).toBeEnabled();

  const text = await page.locator('#modalBody').innerText();
  expect(text).not.toMatch(/source rounding|Workbench|RPC|manifest|fingerprint|hourly rate/i);
  await page.screenshot({ path: testInfo.outputPath('weekly-source-queries-desktop.png'), fullPage: true });

  await page.getByRole('button', { name: 'Accept system hours for selected shifts' }).click();
  await expect(page.getByRole('heading', { name: 'Accept system hours' })).toBeVisible();
  await expect(page.getByText('2 shifts selected', { exact: true })).toBeVisible();
  await page.getByLabel('I confirm the system hours are correct for the selected shifts.').check();
  await page.locator('#modalBody').getByRole('button', { name: 'Accept system hours', exact: true }).click();
  await page.waitForTimeout(50);
  const acceptRequest = await page.evaluate(() => (window as any).__requests[0]);
  expect(acceptRequest).toEqual({
    action: 'ACCEPT_SYSTEM_HOURS',
    payload: {
      actor_user_id: '71111111-1111-4111-8111-111111111111',
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      projection_publication_id: '55555555-5555-4555-8555-555555555555',
      expected_workspace_version: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      action: 'ACCEPT_SYSTEM_HOURS',
      selection: {
        mode: 'EXPLICIT',
        group_keys: ['qg_1111111111111111111111111111111111111111111111111111111111111111'],
        excluded_group_keys: [],
        incident_ids: ['66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'],
        filters: { status: 'UNRESOLVED', candidate: '', issue: 'ALL' },
        sort_key: 'candidate',
        sort_direction: 'asc',
        selection_proof: null,
        group_selection_proofs: [{
          group_key: 'qg_1111111111111111111111111111111111111111111111111111111111111111',
          selection_proof: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
        }]
      }
    }
  });

  await page.getByLabel('Select Jane Smith').uncheck();
  await expect(page.getByText('1 query group selected')).toBeVisible();
  await page.getByRole('button', { name: 'Ask selected candidates' }).click();
  await page.waitForTimeout(50);
  const request = await page.evaluate(() => (window as any).__requests[1]);
  expect(request.action).toBe('ASK_CANDIDATES');
  expect(request.payload.selection).toEqual({
    mode: 'ALL_FILTERED',
    group_keys: [],
    excluded_group_keys: ['qg_1111111111111111111111111111111111111111111111111111111111111111'],
    incident_ids: [],
    filters: { status: 'UNRESOLVED', candidate: '', issue: 'ALL' },
    sort_key: 'candidate',
    sort_direction: 'asc',
    selection_proof: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  });
});

test('Imports opens as the shared weekly-source landing view', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async () => {
    await (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open();
  });
  await expect(page.getByRole('button', { name: 'Upload source file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Daily rota check' })).toBeVisible();
  await expect(page.getByText('Backing report 1741227.xlsx')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('imports-tab.png'), fullPage: true });
});

test('NHSP imports clearly select the exact pre-final or final file journey', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = { id: 'NHSP_FINAL_BACKING_V1', label: 'NHSP', finalise_label: 'Finalise report' };
    payload.context.cycle_state = 'Before cutoff';
    payload.context.controls[0].options[0].label = 'NHSP';
    const win = window as any;
    win.authFetch = async () => ({ ok: true, json: async () => payload });
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open();
  }, fixtures.workspace);

  const fileType = page.getByLabel('File type');
  await expect(fileType).toBeVisible();
  await expect(fileType).toHaveValue('NHSP_PREFINAL_RELEASED_V1');
  await expect(fileType.locator('option')).toHaveText(['Previously released shifts', 'Final backing report']);
  const uploadButton = page.getByRole('button', { name: 'Upload source file' });
  const [prefinalChooser] = await Promise.all([page.waitForEvent('filechooser'), uploadButton.click()]);
  expect(prefinalChooser.isMultiple()).toBe(false);
  await fileType.selectOption('NHSP_FINAL_BACKING_V1');
  await expect(fileType).toHaveValue('NHSP_FINAL_BACKING_V1');
  const [finalChooser] = await Promise.all([page.waitForEvent('filechooser'), uploadButton.click()]);
  expect(finalChooser.isMultiple()).toBe(true);
  await expect(page.getByLabel('Source', { exact: true })).toHaveText(/NHSP/);
  await page.screenshot({ path: testInfo.outputPath('nhsp-import-file-type.png'), fullPage: true });
});

test('NHSP previously released review accepts the shared group scope without one Trust', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  const result = await page.evaluate(() => {
    const actions = (window as any).CloudTMSWeeklySourceWorkspaceActionsV1;
    const model = actions.normalisePreview({
      ok: true,
      file_key: 'mock/previously-released.xlsx',
      preview: {
        ok: true,
        profileId: 'NHSP_PREFINAL_RELEASED_V1',
        rows: [{ candidateName: 'Kier Arthur', shiftDate: '2026-09-08', actualTotal: 2.5 }],
        fatalErrors: [],
        warnings: []
      },
      accept_context: {
        file_key: 'mock/previously-released.xlsx',
        original_filename: 'previously-released.xlsx',
        source_group_id: '11111111-1111-4111-8111-111111111111',
        source_cycle_id: '22222222-2222-4222-8222-222222222222',
        client_id: null,
        report_scope_id: null,
        profile_id: 'NHSP_PREFINAL_RELEASED_V1'
      }
    });
    const payload = actions.buildUploadAcceptancePayload(model, { confirmed: true });
    return {
      ok: model.ok,
      authorityReady: model.authority_ready,
      hasClientId: Object.hasOwn(payload, 'client_id'),
      hasReportScopeId: Object.hasOwn(payload, 'report_scope_id'),
      html: actions.renderPreview(model, { confirmed: true })
    };
  });

  expect(result.ok).toBe(true);
  expect(result.authorityReady).toBe(true);
  expect(result.hasClientId).toBe(false);
  expect(result.hasReportScopeId).toBe(false);
  expect(result.html).not.toContain('This file cannot be accepted yet');
  expect(result.html).not.toContain('data-wsa-accept disabled');
});

test('one-day NHSP replacement remains actionable and displays the superseded comparison in readable dates', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cloudtms:weekly-source-preview', { detail: {
    ok: true, file_key: 'mock/revised.xlsx',
    preview: {
      ok: true, profileId: 'NHSP_PREFINAL_RELEASED_V1',
      rows: [{ date: '2026-09-21', workerName: 'Kier Arthur', actual: { start: '09:00', end: '17:00', breakMinutes: 30 } }],
      fatalErrors: [], warnings: [],
    },
    accept_context: {
      file_key: 'mock/revised.xlsx', original_filename: 'revised.xlsx',
      source_group_id: '11111111-1111-4111-8111-111111111111',
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      profile_id: 'NHSP_PREFINAL_RELEASED_V1',
      previous_coverage: { start_local_date: '2026-09-08', end_local_date: '2026-09-17' },
    },
  } })));
  await expect(page.getByText('This replaces the current provisional comparison')).toBeVisible();
  await expect(page.getByText(/8 Sep 2026 to 17 Sep 2026/)).toBeVisible();
  await expect(page.locator('[data-wsa-shrink-confirm]')).toHaveCount(0);
  await page.locator('[data-wsa-confirm]').check();
  await expect(page.locator('[data-wsa-accept]')).toBeEnabled();
});

test('switching tabs fetches the selected tab rows instead of reusing a partial workspace', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    win.__workspaceUrls = [];
    win.authFetch = async (url: string) => {
      const requestUrl = String(url);
      win.__workspaceUrls.push(requestUrl);
      const payload = JSON.parse(JSON.stringify(workspaceFixture));
      if (requestUrl.includes('tab=finalise')) {
        payload.imports.rows = [];
        payload.imports.total_count = 1;
      }
      if (requestUrl.includes('tab=imports')) {
        payload.imports.rows = [{
          row_key: 'selected-tab-upload',
          file: 'SELECTED_TAB_SOURCE.xlsx',
          uploaded: '22 Sep 2026 19:30',
          rows: '2',
          report: '990100001',
          cutoff: '23 Sep 2026 15:00',
          status: { text: 'Ready', tone: 'positive' },
          final_source: '—',
          actions: [{ label: 'View', enabled: true }]
        }];
        payload.imports.total_count = 1;
      }
      return { ok: true, json: async () => payload };
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open('finalise');
    await win.__modalStack.at(-1).setTab('imports');
  }, fixtures.workspace);

  await expect(page.getByText('SELECTED_TAB_SOURCE.xlsx', { exact: true })).toBeVisible();
  await expect(page.getByText('Nothing matches the current filters.')).toHaveCount(0);
  const urls = await page.evaluate(() => (window as any).__workspaceUrls);
  expect(urls.some((url: string) => url.includes('tab=finalise'))).toBe(true);
  expect(urls.some((url: string) => url.includes('tab=imports'))).toBe(true);
});

test('NHSP import review and finalise show the accepted source facts without blank details', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = {
      id: 'NHSP_FINAL_BACKING_V1',
      label: 'NHSP backing report',
      finalise_label: 'Finalise report'
    };
    payload.imports.rows = [{
      row_key: 'nhsp-accepted-report',
      file: 'NHSP_STAGE8_TEST_CLIENT_KIER_ARTHUR_INITIAL.xlsx',
      uploaded: '22 Sep 2026 10:15',
      rows: '2',
      report: '990100001',
      cutoff: '16 Sep 2026 15:00',
      status: { text: 'Ready to review', tone: 'positive' },
      final_source: 'Current',
      actions: [{ label: 'Review', enabled: true }]
    }];
    payload.imports.total_count = 1;
    payload.finalise.active_list = 'ready';
    payload.finalise.ready = {
      total_count: 1,
      rows: [{
        row_key: 'nhsp-ready-row',
        candidate: 'Kier Arthur',
        day_date: 'Tue 15 Sep 2026',
        actual_hours: '09:00-17:00 · 30 min break · 7.5 hours',
        movement: 'Positive',
        commission: '£10.00',
        total_cost: '£90.00',
        invoice_charge: '£100.00',
        status: { text: 'Ready', tone: 'positive' }
      }]
    };
    payload.finalise.blocked = { total_count: 0, rows: [] };
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    await (window as any).__modalStack.at(-1).setTab('imports');
  }, fixtures.workspace);

  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('heading', { name: 'NHSP_STAGE8_TEST_CLIENT_KIER_ARTHUR_INITIAL.xlsx' })).toBeVisible();
  await expect(page.getByText('22 Sep 2026 10:15', { exact: true })).toBeVisible();
  await expect(page.getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByText('990100001', { exact: true })).toBeVisible();
  await expect(page.getByText('Current', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();

  await page.evaluate(async () => {
    (window as any).CloudTMSWeeklySourceImportWorkspaceV1._session.loadedTab = 'finalise';
    await (window as any).__modalStack.at(-1).setTab('finalise');
  });
  const table = page.locator('.ws-scroll table');
  await expect(table.getByText('09:00-17:00 · 30 min break · 7.5 hours')).toBeVisible();
  await expect(table.getByText('Positive', { exact: true })).toBeVisible();
  await expect(table.getByText('£10.00', { exact: true })).toBeVisible();
  await expect(table.getByText('£90.00', { exact: true })).toBeVisible();
  await expect(table.getByText('£100.00', { exact: true })).toBeVisible();
  await expect(table.getByText('—')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('nhsp-accepted-report-finalise-facts.png'), fullPage: true });
});

test('NHSP final report keeps the row action visible at Office desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 1193, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (fixture) => {
    const payload = structuredClone(fixture);
    payload.imports.journey = { authority_mode: 'SOURCE_AUTHORITY' };
    payload.finalise.active_list = 'ready';
    payload.finalise.blocked = { total_count: 0, rows: [] };
    payload.finalise.ready = { total_count: 1, rows: [{
      candidate: 'Kier Arthur', day_date: 'Tue 8 Sep 2026', actual_hours: '01:00-04:00 (30 min break)',
      movement: 'Positive', commission: '£50.00', total_cost: '£50.00', invoice_charge: '£100.00',
      status: { text: 'Ready', tone: 'positive' },
      actions: [{ label: 'Send back to Queries', enabled: true, payload: { source_row_id: 'row-1' } }]
    }] };
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await (window as any).__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  const table = page.locator('.ws-source-finalise-grid');
  await expect(table.getByRole('button', { name: 'Send back to Queries' })).toBeVisible();
  const overflow = await page.locator('[data-ws-scroll]').evaluate(region => region.scrollWidth - region.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('one selection reviews separate NHSP backing reports and accepts each exact Trust scope', async ({ page }, testInfo) => {
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = { id: 'NHSP_FINAL_BACKING_V1', label: 'NHSP', finalise_label: 'Finalise report' };
    payload.context.cycle_state = 'Ready for finalisation';
    win.authFetch = async (url: string, options: Record<string, unknown> = {}) => {
      if (String(url).includes('/uploads/preview')) {
        const body = JSON.parse(String((options as any).body));
        win.__requests.push({ action: 'UPLOAD_PREVIEW', payload: body });
        const trust = body.original_filename.includes('Alpha') ? 'Alpha NHS Trust' : 'Beta NHS Trust';
        const id = trust.startsWith('Alpha') ? 'a' : 'b';
        return { ok: true, json: async () => ({
          ok: true,
          preview: { ok: true, profileId: 'NHSP_FINAL_BACKING_V1', rows: [{ date: '2026-09-08', start: '09:00', end: '17:00' }], scope: { trust }, reportNumber: `${id}123`, fatalErrors: [], warnings: [] },
          accept_context: { source_group_id: '11111111-1111-4111-8111-111111111111', source_cycle_id: '22222222-2222-4222-8222-222222222222', client_id: `${id.repeat(8)}-${id.repeat(4)}-4${id.repeat(3)}-8${id.repeat(3)}-${id.repeat(12)}`, report_scope_id: `${id.repeat(8)}-${id.repeat(4)}-4${id.repeat(3)}-9${id.repeat(3)}-${id.repeat(12)}` }
        }) };
      }
      if (String(url).includes('/uploads/accept')) {
        win.__requests.push({ action: 'UPLOAD_ACCEPT', payload: JSON.parse(String((options as any).body)) });
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => payload };
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open();
  }, fixtures.workspace);

  const input = page.locator('[data-ws-upload-input]');
  await expect(input).toHaveAttribute('multiple', '');
  await input.setInputFiles([
    { name: 'Alpha backing.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('alpha') },
    { name: 'Beta backing.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('beta') }
  ]);
  await expect(page.getByText('Alpha NHS Trust')).toBeVisible();
  await expect(page.getByText('Beta NHS Trust')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('nhsp-batch-review.png'), fullPage: true });
  await expect(page.getByRole('button', { name: 'Accept selected reports' })).toBeDisabled();
  await page.getByLabel('I confirm the selected reports and their Trusts.').check();
  await page.getByRole('button', { name: 'Accept selected reports' }).click();
  await expect(page.getByText('2 accepted · 0 selected')).toBeVisible();
  const accepted = await page.evaluate(() => (window as any).__requests.filter((entry: any) => entry.action === 'UPLOAD_ACCEPT'));
  const previews = await page.evaluate(() => (window as any).__requests.filter((entry: any) => entry.action === 'UPLOAD_PREVIEW'));
  expect(previews).toHaveLength(2);
  expect(previews.every((entry: any) => entry.payload.client_id === null && entry.payload.profile_id === 'NHSP_FINAL_BACKING_V1')).toBe(true);
  expect(accepted).toHaveLength(2);
  expect(accepted.map((entry: any) => entry.payload.client_id)).toEqual([
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ]);
  expect(accepted.map((entry: any) => entry.payload.report_scope_id)).toEqual([
    'aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb'
  ]);
});

test('same-Trust NHSP backing reports are held for separate review, not silently superseded', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = { id: 'NHSP_FINAL_BACKING_V1', label: 'NHSP', finalise_label: 'Finalise report' };
    payload.context.cycle_state = 'Ready for finalisation';
    win.authFetch = async (url: string, options: Record<string, unknown> = {}) => {
      if (String(url).includes('/uploads/preview')) return { ok: true, json: async () => ({
        ok: true,
        preview: { ok: true, profileId: 'NHSP_FINAL_BACKING_V1', rows: [{ date: '2026-09-08' }], scope: { trust: 'Alpha NHS Trust' }, reportNumber: '123', fatalErrors: [], warnings: [] },
        accept_context: { source_group_id: '11111111-1111-4111-8111-111111111111', source_cycle_id: '22222222-2222-4222-8222-222222222222', client_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', report_scope_id: 'aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa' }
      }) };
      if (String(url).includes('/uploads/accept')) throw new Error('Duplicate file must not be accepted');
      return { ok: true, json: async () => payload };
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open();
  }, fixtures.workspace);
  await page.locator('[data-ws-upload-input]').setInputFiles([
    { name: 'Alpha first.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('first') },
    { name: 'Alpha second.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('second') }
  ]);
  await expect(page.getByText(/Upload these separately/)).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Accept selected reports' })).toBeDisabled();
});

test('a rejected backing report does not prevent a separate valid Trust from being accepted', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = { id: 'NHSP_FINAL_BACKING_V1', label: 'NHSP', finalise_label: 'Finalise report' };
    win.authFetch = async (url: string, options: Record<string, unknown> = {}) => {
      if (String(url).includes('/uploads/preview')) {
        const body = JSON.parse(String((options as any).body));
        if (body.original_filename.includes('invalid')) return { ok: false, status: 409, json: async () => ({ message: 'This file does not contain one clear Trust.' }) };
        return { ok: true, json: async () => ({
          ok: true,
          preview: { ok: true, profileId: 'NHSP_FINAL_BACKING_V1', rows: [{ date: '2026-09-08' }], scope: { trust: 'Valid NHS Trust' }, reportNumber: '101', fatalErrors: [], warnings: [] },
          accept_context: { source_group_id: '11111111-1111-4111-8111-111111111111', source_cycle_id: '22222222-2222-4222-8222-222222222222', client_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', report_scope_id: 'aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa' }
        }) };
      }
      if (String(url).includes('/uploads/accept')) {
        win.__requests.push({ action: 'UPLOAD_ACCEPT', payload: JSON.parse(String((options as any).body)) });
        return { ok: true, json: async () => ({ ok: true }) };
      }
      return { ok: true, json: async () => payload };
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open();
  }, fixtures.workspace);
  await page.locator('[data-ws-upload-input]').setInputFiles([
    { name: 'valid backing.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('valid') },
    { name: 'invalid backing.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('invalid') }
  ]);
  await expect(page.getByText('This file does not contain one clear Trust.')).toBeVisible();
  await expect(page.locator('[data-wsa-batch-select="1"]')).toBeDisabled();
  await page.getByLabel('I confirm the selected reports and their Trusts.').check();
  await page.getByRole('button', { name: 'Accept selected reports' }).click();
  await expect(page.getByText('1 accepted · 0 selected')).toBeVisible();
  const accepted = await page.evaluate(() => (window as any).__requests.filter((entry: any) => entry.action === 'UPLOAD_ACCEPT'));
  expect(accepted).toHaveLength(1);
  expect(accepted[0].payload.client_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});

test('backing-report batch review remains readable without sideways panning on a phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loadFoundation(page);
  await page.evaluate((preview) => {
    const actions = (window as any).CloudTMSWeeklySourceWorkspaceActionsV1;
    actions.openBatchPreview([
      { filename: 'A very long NHSP backing report file name for Alpha Trust.xls', detail: preview },
      { filename: 'Another very long NHSP backing report file name for Beta Trust.xls', detail: {
        ...preview, accept_context: { ...preview.accept_context, original_filename: 'Beta backing.xls' },
        preview: { ...preview.preview, scope: { trust: 'Beta NHS Trust', backingReportNumber: '1741228' } }
      } }
    ]);
  }, fixtures.nhspPreview);
  await expect(page.getByText('Beta NHS Trust')).toBeVisible();
  const sizes = await page.locator('[data-wsa-screen="batch-preview"]').evaluate((node) => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    content: node.scrollWidth,
    width: node.clientWidth
  }));
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport);
  expect(sizes.content).toBeLessThanOrEqual(sizes.width);
  await page.screenshot({ path: testInfo.outputPath('nhsp-batch-review-phone.png'), fullPage: true });
});

for (const tab of ['imports', 'queries'] as const) {
  test(`${tab} appends the next cursor page on scrolling without numbered pages`, async ({ page }) => {
    await page.setViewportSize({ width: 1700, height: 900 });
    await loadFoundation(page);
    await page.addStyleTag({ content: '.ws-scroll{max-height:180px!important;overflow-y:auto!important}' });
    await page.evaluate(({ fixture, activeTab }) => {
      const win = window as any;
      const first = structuredClone(fixture);
      const second = structuredClone(fixture);
      const original = first[activeTab].rows[0];
      const makeRow = (index: number) => activeTab === 'imports'
        ? { ...original, row_key: `page-one-${index}`, file: `Page one ${index}.xlsx` }
        : { ...original, group_key: `page-one-${index}`, candidate: `Page one candidate ${index}`, expanded: false };
      first[activeTab].rows = Array.from({ length: 30 }, (_, index) => makeRow(index));
      first[activeTab].total_count = 31;
      first[activeTab].has_more = true;
      first[activeTab].next_cursor = 'cursor-page-two';
      second[activeTab].rows = [activeTab === 'imports'
        ? { ...original, row_key: 'page-two', file: 'Page two file.xlsx' }
        : { ...original, group_key: 'page-two', candidate: 'Page two candidate', expanded: false }];
      second[activeTab].total_count = 31;
      second[activeTab].has_more = false;
      second[activeTab].next_cursor = '';
      win.__cursorRequests = [];
      win.authFetch = async (url: string) => {
        const parsed = new URL(String(url), 'https://weekly-source.test/');
        const cursor = parsed.searchParams.get('cursor') || '';
        win.__cursorRequests.push({ tab: parsed.searchParams.get('tab'), cursor });
        return { ok: true, json: async () => cursor === 'cursor-page-two' ? second : first };
      };
    }, { fixture: fixtures.workspace, activeTab: tab });
    await page.evaluate(async (activeTab) => {
      await (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open();
      if (activeTab !== 'imports') await (window as any).__modalStack.at(-1).setTab(activeTab);
    }, tab);
    const scroll = page.locator(`.ws-workspace[data-ws-tab="${tab}"] [data-ws-scroll]`);
    await expect(scroll).toBeVisible();
    await expect(page.getByText(tab === 'imports' ? 'Page one 29.xlsx' : 'Page one candidate 29')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__cursorRequests.some((request: any) => request.cursor))).toBe(false);
    await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByText(tab === 'imports' ? 'Page two file.xlsx' : 'Page two candidate', { exact: true })).toBeVisible();
    const cursorRequests = await page.evaluate(() => (window as any).__cursorRequests.filter((request: any) => request.cursor));
    expect(cursorRequests).toEqual([{ tab, cursor: 'cursor-page-two' }]);
    await expect(page.getByText(tab === 'imports' ? 'Page one 0.xlsx' : 'Page one candidate 0', { exact: true })).toHaveCount(1);
    await expect(page.locator('.ws-workspace').getByRole('navigation', { name: /pagination/i })).toHaveCount(0);
  });
}

test('an ineligible candidate reminder stays disabled and explains its cooldown only on hover or focus', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await loadFoundation(page);
  await page.evaluate((workspaceFixture) => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.queries.rows[0].actions = [
      { label: 'Open', enabled: true, payload: { detail: { candidate: 'Jane Smith' } } },
      { label: 'Remind candidate', kind: 'COMMAND', command: 'REMIND_CANDIDATE', enabled: false,
        reason: 'A reminder can be sent after Wed 23 Sep 2026 22:46.', payload: {} }
    ];
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    document.getElementById('modalBody')!.innerHTML = api.renderWorkspace(api.normaliseWorkspace(payload), 'queries', api._session);
  }, fixtures.workspace);
  const reminder = page.getByRole('button', { name: 'Remind candidate' });
  await expect(reminder).toBeDisabled();
  await expect(reminder.locator('..')).toHaveAttribute('title', 'A reminder can be sent after Wed 23 Sep 2026 22:46.');
  expect(await page.locator('.ws-action-hint .sr-only').evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  expect(await page.locator('.ws-query-scroll').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});

test('Imports keeps signed-Timesheet checks inside the same weekly workspace', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.imports.journey = {
      authority_mode: 'TIMESHEET_AUTHORITY',
      title: 'Signed Timesheet decides hours',
      body: 'Timesheet hours are used. The client system is checked so matching references can be added.',
      attention_count: 2,
      attention_rows: [
        { row_key: 'authority-1', candidate: 'Abigail Jones', day_date: 'Mon 14 Sep 2026', attention: 'Hours are different', reference: 'Not added', status: { text: 'Manager correction needed', tone: 'warning' }, actions: [{ label: 'View Timesheet', enabled: true, payload: { timesheet_id: 'timesheet-1' } }, { label: 'Email manager', enabled: true, payload: { comparison_id: 'comparison-1' } }] },
        { row_key: 'authority-2', candidate: 'Jane Smith', day_date: 'Tue 15 Sep 2026', attention: 'Reference is missing', reference: 'Not added', status: { text: 'Reference needed', tone: 'warning' }, actions: [{ label: 'View Timesheet', enabled: true, payload: { timesheet_id: 'timesheet-2' } }] }
      ],
      waiting_count: 1,
      waiting_rows: [{ row_key: 'authority-waiting-4', candidate: 'Mary Brown', day_date: 'Week ending 20 Sep 2026', attention: 'Timesheet not yet completed', reference: 'Not added', status: { text: 'Waiting for completed Timesheet', tone: 'neutral' }, actions: [] }],
      ready_rows: [{ row_key: 'authority-ready-3', candidate: 'John Jones', day_date: 'Wed 16 Sep 2026', attention: 'Source reference added', reference: 'REF-3', status: { text: 'Ready for Office authorisation', tone: 'positive' }, actions: [{ label: 'View Timesheet', enabled: true, payload: { timesheet_id: 'timesheet-3' } }] }]
    };
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    await (window as any).__modalStack.at(-1).setTab('imports');
  }, fixtures.workspace);
  await expect(page.getByText('Signed Timesheet decides hours')).toBeVisible();
  await expect(page.getByText('Timesheet hours are used. The client system is checked so matching references can be added.')).toBeVisible();
  await expect(page.getByText('Hours are different')).toBeVisible();
  await expect(page.getByText('Reference is missing')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Checks (2)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Ready (1)' })).toBeEnabled();
  await expect(page.getByRole('tab', { name: 'Waiting (1)' })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: 'Select all visible rows' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Ready (1)' }).click();
  await expect(page.getByText('John Jones')).toBeVisible();
  await expect(page.getByText('Abigail Jones')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Checks (2)' }).click();
  await expect(page.getByText('Hours are different')).toBeVisible();
  await page.getByRole('tab', { name: 'Waiting (1)' }).click();
  await expect(page.getByText('Mary Brown')).toBeVisible();
  await expect(page.getByText('Waiting for completed Timesheet')).toBeVisible();
  await page.getByRole('tab', { name: 'Checks (2)' }).click();
  await page.screenshot({ path: testInfo.outputPath('weekly-imports-two-journeys.png'), fullPage: true });
});

async function loadCombinedFinaliseProof(page: import('@playwright/test').Page) {
  await loadFoundation(page);
  await page.evaluate(async fixture => {
    const win = window as any;
    const workspace = { ...fixture, combined_source_workspace: true };
    const zeroPayload = {
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      source_group_id: '11111111-1111-4111-8111-111111111111',
      client_id: '63333333-3333-4333-8333-333333333333',
      expected_cycle_version: 3,
      attestation_text: 'No shifts to import'
    };
    win.authFetch = async (url: string, options: any = {}) => {
      if (!url.includes('/commands')) return { ok: true, json: async () => workspace };
      const request = JSON.parse(options.body); win.__requests.push(request);
      if (request.action === 'COMBINED_FINALISE_WORKSPACE') return { ok: true, json: async () => ({
        contract: 'WEEKLY_SOURCE_COMBINED_FINALISE_V1', list: request.payload.list,
        counts: { ready: 0, blocked: 0 }, scopes: [], rows: [], has_more: false,
        scope_options: [
          { source_group_id: zeroPayload.source_group_id, source: 'Stage 8 NHSP Test', week_ending: '2026-09-27', period: '27 Sep 2026' },
          { source_group_id: zeroPayload.source_group_id, source: 'Stage 8 NHSP Test', week_ending: '2026-09-06', period: '6 Sep 2026' }
        ], summary: { missing_previous_reports: 1 },
        obligations: [{ key: 'zero-return', client: 'Royal Berkshire NHS Trust', source: 'Stage 8 NHSP Test',
          period: '27 Sep 2026', missing_previous_report: true,
          progress: { status: { text: 'Not finalised' }, actions: [{ label: 'No shifts to import', enabled: true,
            kind: 'COMMAND', command: 'NO_SHIFTS_TO_IMPORT', payload: zeroPayload }] } }]
      }) };
      return { ok: true, json: async () => ({ ok: true }) };
    };
    await win.CloudTMSWeeklySourceImportWorkspaceV1.open('finalise');
  }, fixtures.workspace);
}

test('combined Finalise keeps zero-return certification in client-and-period progress', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadCombinedFinaliseProof(page);
  await expect(page.getByRole('combobox', { name: 'Period' })).toBeVisible();
  await expect(page.getByText('1 missing finalisation report for previous weeks')).toBeVisible();
  await page.locator('[data-wsc-obligations] summary').click();
  await expect(page.getByText('Royal Berkshire NHS Trust')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('weekly-source-finalisation-progress.png'), fullPage: true });
  await page.getByRole('button', { name: 'No shifts to import' }).click();
  await expect(page.getByRole('heading', { name: 'No shifts to import' })).toBeVisible();
  await page.getByLabel('I confirm there are no shifts to import for this week.').check();
  await page.getByRole('button', { name: 'Confirm no shifts to import' }).click();
  expect(await page.evaluate(() => (window as any).__requests.find((request: any) => request.action === 'NO_SHIFTS_TO_IMPORT'))).toEqual({
    action: 'NO_SHIFTS_TO_IMPORT', payload: {
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      source_group_id: '11111111-1111-4111-8111-111111111111',
      client_id: '63333333-3333-4333-8333-333333333333',
      expected_cycle_version: 3, attestation_text: 'No shifts to import'
    }
  });
});

test('signed-Timesheet authority keeps its existing completed route', async ({ page }) => {
  await loadFoundation(page);
  const result = await page.evaluate(workspaceFixture => {
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.imports.journey = { authority_mode: 'TIMESHEET_AUTHORITY',
      title: 'Signed Timesheet decides hours' };
    payload.finalise.prepared = true;
    payload.finalise.ready = { total_count: 0, rows: [] };
    payload.finalise.blocked = { total_count: 0, rows: [] };
    payload.finalise.complete = { total_count: 1, rows: [{ candidate: 'Kier Arthur', day_date: '21 Sep 2026' }] };
    payload.finalise.active_list = 'complete';
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    const workspace = api.normaliseWorkspace(payload);
    return { active: workspace.finalise.active_list,
      html: api.renderWorkspace(workspace, 'finalise', api._session) };
  }, fixtures.workspace);
  expect(result.active).toBe('complete');
  expect(result.html).toContain('data-ws-finalise-list="complete"');
  expect(result.html).toContain('1 complete');
});

for (const width of [360, 720, 1120]) {
  test(`combined Finalise period filter stays compact and selects the earlier cutoff at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 820 });
    await loadCombinedFinaliseProof(page);
    const filter = page.getByRole('combobox', { name: 'Period' });
    await expect(filter).toBeVisible();
    const bounds = await filter.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await filter.selectOption('2026-09-06');
    await expect.poll(() => page.evaluate(() => (window as any).__requests.filter((request: any) => request.action === 'COMBINED_FINALISE_WORKSPACE').at(-1)?.payload.week_ending)).toBe('2026-09-06');
    await page.screenshot({ path: testInfo.outputPath(`nhsp-finalisation-period-${width}.png`), fullPage: true });
  });
}

test('Weekly Source sort headings stay flat inside the real modern Office modal', async ({ page }) => {
  await mountOfficeShell(page);
  await page.evaluate(() => {
    const modal = document.getElementById('modal')!;
    modal.classList.add('ctms-modern-modal');
    modal.innerHTML = '<div id="modalBody"><table class="grid mini ws-grid ws-import-grid"><thead><tr><th><button type="button" data-ws-sort="uploaded">Uploaded <span aria-hidden="true">↓</span></button></th><th>Rows</th></tr></thead><tbody><tr><td><span class="ws-import-filename" title="NHSP_STAGE8_PREVIOUSLY_RELEASED_KIER_ARTHUR_2026-09-08_FORMAT_PRESERVED.xlsx">NHSP_STAGE8_PREVIOUSLY_RELEASED_KIER_ARTHUR_2026-09-08_FORMAT_PRESERVED.xlsx</span></td><td>2</td></tr></tbody></table></div>';
    document.getElementById('modalBack')!.style.display = 'flex';
    (window as any).__applyCloudTmsModalModernisation();
  });
  const header = page.locator('#modal .ws-grid th button[data-ws-sort]');
  await expect(header).toBeVisible();
  expect((await header.getAttribute('class')) || '').not.toContain('ctms-action-primary');
  const appearance = await header.evaluate((node) => {
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, background: style.backgroundColor, radius: style.borderRadius, padding: style.paddingLeft };
  });
  expect(appearance).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)', radius: '0px', padding: '0px' });
  const filename = await page.locator('#modal .ws-import-filename').evaluate((node) => ({
    cellWidth: node.getBoundingClientRect().width,
    contentWidth: node.scrollWidth,
    wrapping: getComputedStyle(node).overflowWrap,
    lineClamp: getComputedStyle(node).webkitLineClamp,
    fullName: node.getAttribute('title')
  }));
  expect(filename.contentWidth).toBeLessThanOrEqual(Math.ceil(filename.cellWidth));
  expect(filename.wrapping).toBe('anywhere');
  expect(filename.lineClamp).toBe('2');
  expect(filename.fullName).toContain('FORMAT_PRESERVED.xlsx');
});

test('History keeps the current pay cycle and long details compact but accessible', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(async () => {
    const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    await (window as any).__modalStack.at(-1).setTab('history');
  });
  await expect(page.getByRole('combobox', { name: 'Period' })).toHaveValue('CURRENT_PAY_CYCLE');
  const detail = page.locator('.ws-history-grid .ws-history-detail').first();
  await expect(detail).toBeVisible();
  expect(await detail.getAttribute('title')).toContain('Backing report 1741227.xlsx');
  const measured = await detail.evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    contentWidth: node.scrollWidth,
    wrapping: getComputedStyle(node).overflowWrap,
    lineClamp: getComputedStyle(node).webkitLineClamp
  }));
  expect(measured.contentWidth).toBeLessThanOrEqual(Math.ceil(measured.width));
  expect(measured.wrapping).toBe('anywhere');
  expect(measured.lineClamp).toBe('2');
});

test('before cutoff deliberately locks finalisation against the shared modal control reset', async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.context.cycle_state = 'Before cutoff';
    payload.finalise.active_list = 'ready';
    payload.finalise.ready = { total_count: 2, rows: [] };
    payload.finalise.blocked = { total_count: 0, rows: [] };
    payload.finalise.finalise_enabled = false;
    payload.finalise.finalise_payload = {
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      report_scope_id: '33333333-3333-4333-8333-333333333333'
    };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');

    // Recreate the shared modal's normal editable-mode pass. Only controls
    // explicitly marked as policy locks are allowed to remain disabled.
    document.querySelectorAll('#modalBody input, #modalBody button').forEach((control: any) => {
      control.disabled = control.dataset.ctmsIntentionalLock === '1';
    });
  }, fixtures.workspace);

  const confirmation = page.getByLabel(/I confirm this is the complete final NHSP backing report/);
  const action = page.getByRole('button', { name: 'Finalise report', exact: true });
  await expect(confirmation).toBeDisabled();
  await expect(action).toBeDisabled();

  // The command handler independently refuses the action if another UI layer
  // ever disturbs the disabled property.
  await action.evaluate((button: HTMLButtonElement) => {
    button.disabled = false;
    button.click();
  });
  await page.waitForTimeout(25);
  const finaliseRequests = await page.evaluate(() => (window as any).__requests.filter((request: any) => request.action === 'FINALISE_WEEK'));
  expect(finaliseRequests).toEqual([]);
  await expect(action).toBeDisabled();
});

test('final NHSP charge decisions live once in Blocked with inline review and explicit acceptance', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.finalise.ready = { total_count: 0, rows: [] };
    payload.finalise.blocked = { total_count: 2, rows: [
      { row_key: 'zero-row', candidate: 'Amara Patel', day_date: 'Mon 14 Sep 2026', problem: 'Accept the final NHSP source charge', issue_count: 1, charge_warning_key: 'charge-check:zero-row', actions: [] },
      { row_key: 'different-row', candidate: 'Elliot James', day_date: 'Tue 15 Sep 2026', problem: 'Accept the final NHSP source charge', issue_count: 1, charge_warning_key: 'charge-check:different-row', actions: [] }
    ] };
    payload.finalise.active_list = 'blocked';
    payload.finalise.rate_warnings = {
      contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'FINAL_AWAITING_ACCEPTANCE', total_count: 2,
      notice: { title: 'Possible Trust rate card issue', body: 'One shift has a £0 source charge. Check the Trust rate card in NHSP before accepting.' },
      rows: [
        { warning_key: 'charge-check:zero-row', source_row_id: 'zero-row', candidate: 'Amara Patel', day_date: 'Mon 14 Sep 2026', source_charge: '£0.00', commission: '£0.00', total_cost: '£0.00', calculated_charge: '£200.00', difference: '-£200.00', contract: 'Band 6 · Ward A', warning: 'Possible NHSP rate card issue', accept_eligible: true },
        { warning_key: 'charge-check:different-row', source_row_id: 'different-row', candidate: 'Elliot James', day_date: 'Tue 15 Sep 2026', source_charge: '£248.00', commission: '£48.00', total_cost: '£200.00', calculated_charge: '£250.00', difference: '-£2.00', contract: 'Band 6 · Ward B', warning: 'Rate card expired or wrong Contract rate', accept_eligible: true }
      ],
      acceptance: {
        enabled: true, action: 'ACCEPT_NHSP_SOURCE_CHARGES',
        payload: { source_cycle_id: '22222222-2222-4222-8222-222222222222', projection_publication_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
        selection: { key: 'warning_keys', proof_key: 'selection_proof', proof: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' }
      }
    };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  await page.waitForTimeout(50);

  await expect(page.locator('[data-ws-finalise-row]')).toHaveCount(2);
  await expect(page.locator('.ws-rate-warnings')).toHaveCount(0);
  await page.locator('[data-ws-finalise-row="different-row"] [data-ws-rate-expand]').click();
  await expect(page.getByText('Rate card expired or wrong Contract rate')).toBeVisible();
  await expect(page.getByText('£48.00')).toBeVisible();
  await expect(page.getByText('-£2.00')).toBeVisible();
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('weekly-source-nhsp-final-rate-warnings.png'), fullPage: true });
  const header = page.getByRole('checkbox', { name: 'Select all eligible charges' });
  await expect(header).toHaveCount(1);
  await header.check();
  await expect(page.getByLabel('Select charge for Amara Patel on Mon 14 Sep 2026')).toBeChecked();
  await expect(page.getByLabel('Select charge for Elliot James on Tue 15 Sep 2026')).toBeChecked();
  const accept = page.getByRole('button', { name: 'Accept selected source charges' });
  await expect(accept).toBeDisabled();
  await page.getByLabel('I have checked the selected NHSP charges.').check();
  await expect(accept).toBeEnabled();
  await accept.click();
  await page.waitForTimeout(50);
  const request = await page.evaluate(() => (window as any).__requests.at(-1));
  expect(request).toEqual({
    action: 'ACCEPT_NHSP_SOURCE_CHARGES',
    payload: {
      source_cycle_id: '22222222-2222-4222-8222-222222222222',
      projection_publication_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      warning_keys: ['charge-check:zero-row', 'charge-check:different-row'],
      selection_proof: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    }
  });
});

test('pre-final NHSP warnings stay in Queries and never offer final-charge acceptance', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile.id = 'NHSP_PREFINAL_RELEASED_V1';
    payload.finalise.prepared = false;
    payload.queries.office_checks = { total_count: 1, rows: [{ row_key: 'warning-1', candidate: 'Elliot James', day_date: 'Tue 15 Sep 2026', client: "St Mary's NHS Trust", source_reference: 'CCR-001', booking_reference: 'BK-1', system_hours: '09:00–17:00', problem: 'Check the charge for this shift', actions: [] }] };
    payload.finalise.rate_warnings = {
      contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'PREFINAL', total_count: 2,
      notice: { title: 'Possible Trust rate card issue', body: 'One shift has a £0 source charge. Check the Trust rate card in NHSP.' },
      rows: [
        { warning_key: 'zero-row', candidate: 'Amara Patel', day_date: 'Mon 14 Sep 2026', source_charge: '£0.00', warning: 'Possible NHSP rate card issue', accept_eligible: false },
        { warning_key: 'different-row', candidate: 'Elliot James', day_date: 'Tue 15 Sep 2026', source_charge: '£248.00', warning: 'Rate card expired or wrong Contract rate', accept_eligible: false }
      ],
      acceptance: { enabled: false }
    };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  await page.waitForTimeout(50);

  await expect(page.getByText('No finalisation report has been prepared')).toBeVisible();
  await page.evaluate(async () => {
    const win = window as any;
    win.CloudTMSWeeklySourceImportWorkspaceV1._session.loadedTab = 'queries';
    await win.__modalStack.at(-1).setTab('queries');
  });
  await expect(page.getByText('Check the charge for this shift')).toBeVisible();
  await expect(page.locator('.ws-rate-warnings')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Accept selected source charges' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('nhsp-prefinal-rate-warnings.png'), fullPage: true });
});

test('a shift with mapping and charge issues is one Blocked row until mapping is resolved', async ({ page }) => {
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.finalise.active_list = 'blocked';
    payload.finalise.ready = { total_count: 0, rows: [] };
    payload.finalise.blocked = { total_count: 1, rows: [{
      row_key: 'both-issues', candidate: 'Amara Patel', day_date: 'Mon 14 Sep 2026',
      problem: 'Review the source row matching', issue_count: 2,
      charge_warning_key: 'charge-check:both-issues', actions: [{ label: 'Link candidate', enabled: true }]
    }] };
    payload.finalise.rate_warnings = {
      contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'FINAL_AWAITING_ACCEPTANCE',
      rows: [{ warning_key: 'charge-check:both-issues', source_row_id: 'both-issues',
        candidate: 'Amara Patel', warning: 'Rate card expired or wrong Contract rate', accept_eligible: true }],
      acceptance: { enabled: true, action: 'ACCEPT_NHSP_SOURCE_CHARGES', payload: {},
        selection: { key: 'warning_keys', proof_key: 'selection_proof', proof: 'e'.repeat(64) } }
    };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  await expect(page.locator('[data-ws-finalise-row]')).toHaveCount(1);
  await expect(page.getByText('2 issues')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review charge' })).toHaveCount(0);
  await expect(page.locator('[data-ws-rate-warning-select]')).toHaveCount(0);
});

test('HealthRoster finalisation uses the same simple finalise workspace with the client source label', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);
  await page.evaluate(async (workspaceFixture) => {
    const win = window as any;
    const payload = JSON.parse(JSON.stringify(workspaceFixture));
    payload.profile = {
      id: 'HEALTHROSTER_WEEKLY_FROM_TO_ACTUAL_V1',
      label: 'HealthRoster Timesheet Export',
      finalise_label: 'Finalise source'
    };
    payload.context.controls[0] = {
      key: 'source_group', label: 'Source', value: 'roster',
      options: [{ value: 'roster', label: 'HealthRoster Timesheet Export' }]
    };
    payload.context.controls[1].label = 'Client';
    payload.finalise.source_summary = 'HealthRoster final source · week ending 20 Sep 2026';
    payload.finalise.active_list = 'blocked';
    payload.finalise.ready = { total_count: 0, rows: [] };
    payload.finalise.blocked = { total_count: 1, rows: [{ candidate: 'Abigail Jones', day_date: 'Mon 14 Sep 2026', system_hours: '20:00-08:00 · 60 min break · 11 hours', status: { text: 'Not finalised', tone: 'warning' }, actions: [{ label: 'Open', enabled: true }] }] };
    payload.finalise.confirmation_text = 'I confirm this is the final source for this week.';
    payload.finalise.tracker = {
      title: 'Finalisation progress', cycle_label: 'Week ending 20 Sep 2026', complete: false,
      rows: [
        { source: 'HealthRoster Timesheet Export', client: "St Mary's NHS Trust", status: { text: 'Finalised', tone: 'positive' }, detail: '20 Sep 2026 15:06', actions: [] },
        { source: 'HealthRoster Timesheet Export', client: 'Royal Berkshire NHS Trust', status: { text: 'Not finalised', tone: 'warning' }, detail: '', actions: [{ label: 'No shifts to import', enabled: true }] }
      ]
    };
    payload.finalise.rate_warnings = { contract: 'NHSP_RATE_WARNING_WORKSPACE_V1', phase: 'NONE', total_count: 0, rows: [], acceptance: { enabled: false } };
    const api = win.CloudTMSWeeklySourceImportWorkspaceV1;
    await api.open();
    api._session.workspace = api.normaliseWorkspace(payload);
    api._session.loadedTab = 'finalise';
    await win.__modalStack.at(-1).setTab('finalise');
  }, fixtures.workspace);
  await expect(page.getByText('HealthRoster final source · week ending 20 Sep 2026')).toBeVisible();
  const finaliseTable = page.locator('.ws-scroll table');
  for (const heading of ['Candidate', 'Day/date', 'System hours', 'Status', 'Action']) {
    await expect(finaliseTable.getByRole('columnheader', { name: heading })).toBeVisible();
  }
  await expect(page.getByText('20:00-08:00 · 60 min break · 11 hours')).toBeVisible();
  await expect(finaliseTable.getByText('Not finalised')).toBeVisible();
  await expect(finaliseTable.getByRole('columnheader', { name: 'Problem' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Finalise source' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('healthroster-finalise.png'), fullPage: true });
});

test('preview, contract choice and Correct final source follow deterministic policy screens', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1120, height: 900 });
  await loadFoundation(page);

  await page.evaluate((preview) => window.dispatchEvent(new CustomEvent('cloudtms:weekly-source-preview', { detail: preview })), fixtures.nhspPreview);
  await page.waitForTimeout(25);
  await expect(page.getByRole('heading', { name: 'Review source file' })).toBeVisible();
  await expect(page.getByText("St Mary's NHS Trust", { exact: true }).first()).toBeVisible();
  await expect(page.getByText('1741227', { exact: true })).toBeVisible();
  await page.getByLabel(/I confirm this is the complete final NHSP backing report/).check();
  await expect(page.getByRole('button', { name: 'Accept source file' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('nhsp-ready-finalise.png'), fullPage: true });

  await page.evaluate(() => { (window as any).__modalStack.at(-1).isDirty = true; });
  await page.getByRole('button', { name: 'Accept source file' }).click();
  await expect(page.locator('#modalBody')).toBeEmpty();
  expect(await page.evaluate(() => (window as any).__modalStack.length)).toBe(0);
  expect(await page.evaluate(() => (window as any).__nativeConfirmCalls)).toBe(0);
  expect(await page.evaluate(() => (window as any).__requests.some((request: any) => request.action === 'UPLOAD_ACCEPT'))).toBe(true);

  await page.evaluate((payload) => (window as any).CloudTMSWeeklySourceWorkspaceActionsV1.handleAction({ label: 'Choose contract', payload }), fixtures.contractChooser);
  await page.waitForTimeout(25);
  const choices = page.getByRole('radio');
  await expect(choices).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await expect(choices.nth(index)).not.toBeChecked();
  await choices.nth(1).check();
  await expect(page.getByRole('button', { name: 'Use selected contract' })).toBeEnabled();
  const contractText = await page.locator('#modalBody').innerText();
  expect(contractText).not.toMatch(/£|hourly rate|source charge|calculated charge|source_row_ordinal/i);
  await page.screenshot({ path: testInfo.outputPath('choose-contract.png'), fullPage: true });

  await page.evaluate(() => (window as any).closeModal());
  await page.evaluate((payload) => (window as any).CloudTMSWeeklySourceWorkspaceActionsV1.handleAction({ label: 'Correct final source', payload }), fixtures.correctFinal);
  await page.waitForTimeout(25);
  await expect(page.getByText('The previous final version will remain in History.')).toBeVisible();
  await expect(page.getByText('Upload the replacement source file again')).toBeVisible();
  await expect(page.getByText('Backing report 1741228 · uploaded 16 Sep 2026 16:10')).toHaveCount(0);
  await expect(page.getByText('This shift is already on an invoice.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review replacement' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /remove|exclude|ignore/i })).toHaveCount(0);
  await page.locator('[data-wsa-replacement-file]').setInputFiles({
    name: 'replacement-report.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('replacement-source-bytes')
  });
  await expect(page.getByRole('button', { name: 'Review replacement' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review replacement' }).click();
  await expect(page.getByRole('tab', { name: 'Changes (1)' })).toBeVisible();
  await expect(page.getByText('Jane Smith')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply corrected final source' })).toBeDisabled();
  await page.getByLabel('Reason').fill('The wrong report was finalised.');
  await page.getByLabel(fixtures.correctFinalPreview.confirmation_text).check();
  await expect(page.getByRole('button', { name: 'Apply corrected final source' })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('weekly-source-correct-final.png'), fullPage: true });
  await page.getByRole('button', { name: 'Apply corrected final source' }).click();
  await page.waitForTimeout(50);
  const correctionRequests = await page.evaluate(() => (window as any).__requests.slice(-2));
  expect(correctionRequests.map((request: any) => request.action)).toEqual([
    'PREVIEW_CORRECT_FINAL_SOURCE', 'APPLY_CORRECT_FINAL_SOURCE'
  ]);
  expect(correctionRequests[0].payload.replacement_source.file_key).toBe('mock/replacement-report.xlsx');
  expect(correctionRequests[1].payload.reason).toBe('The wrong report was finalised.');
  expect(correctionRequests[1].payload.confirmation_text).toBe(fixtures.correctFinalPreview.confirmation_text);
  expect(correctionRequests[1].payload).not.toHaveProperty('root_service_snapshots');
});

for (const viewport of [
  { name: 'fold', width: 280, height: 653 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 }
]) {
  test(`${viewport.name} query workspace is readable without horizontal panning`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loadFoundation(page);
    await page.evaluate((payload) => {
      const api = (window as any).CloudTMSWeeklySourceImportWorkspaceV1;
      const model = api.normaliseWorkspace(payload);
      document.getElementById('modalBody')!.innerHTML = api.renderWorkspace(model, 'queries', api._session);
    }, fixtures.workspace);

    await expect(page.locator('.ws-mobile-sort')).toBeVisible();
    await expect(page.getByLabel('Sort by')).toHaveValue('candidate');
    await expect(page.locator('.ws-sticky-footer')).toHaveCSS('position', 'static');
    await expect(page.getByLabel('Select all query groups')).toBeVisible();
    await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible();
    const widths = await page.evaluate(() => {
      const pageRoot = document.documentElement;
      const region = document.querySelector('[data-ws-scroll]')!;
      return {
        pageClient: pageRoot.clientWidth,
        pageScroll: pageRoot.scrollWidth,
        regionClient: region.clientWidth,
        regionScroll: region.scrollWidth
      };
    });
    expect(widths.pageScroll).toBe(widths.pageClient);
    expect(widths.regionScroll).toBeLessThanOrEqual(widths.regionClient + 1);
    const groupToggle = page.locator('[data-ws-expand]').first();
    if (await groupToggle.getAttribute('aria-expanded') !== 'true') await groupToggle.click();
    await expect(page.getByText('09:00-18:00 (30 min break)', { exact: true })).toBeVisible();
    await expect(page.getByText('09:00-17:00 (30 min break)', { exact: true }).first()).toBeVisible();
    const expandedWidths = await page.evaluate(() => {
      const region = document.querySelector('[data-ws-scroll]')!;
      return { client: region.clientWidth, scroll: region.scrollWidth };
    });
    expect(expandedWidths.scroll).toBeLessThanOrEqual(expandedWidths.client + 1);
    await page.screenshot({ path: testInfo.outputPath(`weekly-source-queries-${viewport.name}.png`), fullPage: true });
  });
}

test('Stage 11: real Office import modal keeps mobile query controls compact and complete', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await mountOfficeShell(page, {
    broker(pathname) {
      if (pathname.startsWith('/api/weekly-source/v1/workspace')) return fixtures.workspace;
      return undefined;
    }
  });

  await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open === 'function', null, { timeout: 30_000 });
  await page.evaluate(() => { void (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open(); });
  await expect(page.locator('#modal')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#modalTitle')).toContainText('Weekly source imports');
  await page.locator('#modalTabs').getByRole('button', { name: /^Queries(?:\s|$)/ }).click();
  await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible();

  const filters = page.locator('.ws-query-filter-menu');
  const actions = page.locator('.ws-query-actions-menu');
  await expect(filters).not.toHaveAttribute('open', '');
  await expect(actions).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Ask selected candidates' })).toBeHidden();
  await expect(page.locator('[data-ws-bulk-action="ASK_CANDIDATES"]')).toBeDisabled();
  await expect(page.locator('[data-ws-bulk-action="SEND_MANAGER_NOW"]')).toBeDisabled();

  await page.getByLabel('Select Jane Smith').check();
  await expect(page.locator('[data-ws-actions-summary]')).toContainText('Actions for 1 selected');
  await expect(page.locator('[data-ws-bulk-action="ASK_CANDIDATES"]')).toBeEnabled();
  await page.getByLabel('Select Jane Smith').uncheck();
  await expect(page.locator('[data-ws-bulk-action="ASK_CANDIDATES"]')).toBeDisabled();
  await expect(page.locator('[data-ws-bulk-action="SEND_MANAGER_NOW"]')).toBeDisabled();
  await page.getByLabel('Select Jane Smith').check();
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    modalClient: document.querySelector('#modal')?.clientWidth || 0,
    modalScroll: document.querySelector('#modal')?.scrollWidth || 0
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client);
  expect(size.modalScroll).toBeLessThanOrEqual(size.modalClient + 1);
  expect(await page.locator('.ws-query-scroll').evaluate((region) => region.scrollWidth - region.clientWidth)).toBeLessThanOrEqual(1);
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('UI-064-real-query-phone.png') });

  await page.locator('[data-ws-actions-summary]').click();
  await expect(page.getByRole('button', { name: 'Ask selected candidates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send selected to manager now' })).toBeVisible();
  await expect(page.getByRole('button', { name: /select all|unselect all/i })).toHaveCount(0);
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('UI-075-real-query-actions-phone.png') });

  for (const width of [280, 768]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
    const queryOverflow = await page.locator('.ws-query-scroll')
      .evaluate((region) => region.scrollWidth - region.clientWidth);
    expect(queryOverflow, `${width}px query cards`).toBeLessThanOrEqual(1);
    await expect(page.locator('[data-ws-bulk-action="ASK_CANDIDATES"]')).toBeEnabled();
  }

  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(page.locator('.ws-query-grid > tbody > tr[data-ws-group-key]')).toHaveCSS('display', 'grid');
  await expect(page.locator('.ws-query-grid > tbody > tr[data-ws-group-key] > td.ws-actions').first()).toBeVisible();
  const intermediate = await page.evaluate(() => {
    const region = document.querySelector('.ws-query-scroll')!;
    const actionsCell = document.querySelector('.ws-query-grid > tbody > tr[data-ws-group-key] > td.ws-actions')!;
    const box = actionsCell.getBoundingClientRect();
    const row = actionsCell.closest('tr')!.getBoundingClientRect();
    return { pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      regionOverflow: region.scrollWidth - region.clientWidth, actionRight: box.right, rowRight: row.right };
  });
  expect(intermediate.pageOverflow).toBeLessThanOrEqual(1);
  expect(intermediate.regionOverflow).toBeLessThanOrEqual(1);
  expect(intermediate.actionRight).toBeLessThanOrEqual(intermediate.rowRight + 1);
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('UI-075-real-query-actions-intermediate.png') });

  expect(errors).toEqual([]);
  expect(externalRequests(page)).toEqual([]);
});

test('policy v2: real Office desktop queries fit the modal with stacked actions', async ({ page }, testInfo) => {
  const policy = JSON.parse(readFileSync(resolve(__dirname, '../../docs/weekly-source-import-query-policy-v2.json'), 'utf8'));
  const workspace = structuredClone(fixtures.workspace);
  const row = workspace.queries.rows[0];
  row.expanded = false;
  row.client = 'CloudTMS Stage 8 NHSP Test Trust';
  row.status = { text: 'Needs action', tone: 'warning' };
  row.actions = policy.layout.actionOrder.map((label: string) => ({ label, enabled: true,
    payload: { detail: { candidate: row.candidate, client: row.client } } }));
  await page.setViewportSize(policy.layout.desktopViewport);
  await mountOfficeShell(page, { broker(pathname) {
    if (pathname.startsWith('/api/weekly-source/v1/workspace')) return workspace;
    return undefined;
  } });
  await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open === 'function');
  await page.evaluate(() => { void (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open(); });
  await page.locator('#modalTabs').getByRole('button', { name: /^Queries(?:\s|$)/ }).click();
  await expect(page.getByText('Jane Smith', { exact: true })).toBeVisible();
  const metrics = await page.locator('.ws-query-grid').evaluate((table) => {
    const row = table.querySelector('tbody > tr[data-ws-group-key]')!;
    const actions = row.querySelector('td.ws-actions')!;
    const buttons = [...actions.querySelectorAll('button')].map(el => el.getBoundingClientRect().toJSON());
    const header = table.querySelector('thead th:last-child')!.getBoundingClientRect();
    const status = [...row.querySelectorAll('td')].find(el => el.textContent?.trim() === 'Needs action')!;
    const badge = status.querySelector('.badge') || status.firstElementChild!;
    const region = table.closest('.ws-query-scroll')!;
    return { overflow: region.scrollWidth - region.clientWidth, buttons,
      headerRight: header.right, actionsRight: actions.getBoundingClientRect().right,
      statusWrap: getComputedStyle(badge).whiteSpace,
      modalWidth: document.querySelector('#modal')!.getBoundingClientRect().width };
  });
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.modalWidth).toBeGreaterThan(1400);
  expect(metrics.buttons).toHaveLength(2);
  expect(metrics.buttons[1].top).toBeGreaterThanOrEqual(metrics.buttons[0].bottom);
  expect(Math.abs(metrics.headerRight - metrics.actionsRight)).toBeLessThanOrEqual(1);
  expect(metrics.statusWrap).toBe('nowrap');
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('weekly-source-policy-v2-desktop.png') });
  expect(externalRequests(page)).toEqual([]);
});

test('policy v2: Trust filter can be cleared and keyboard focus survives refresh in every tab', async ({ page }) => {
  const trustId = '33333333-3333-4333-8333-333333333333';
  await mountOfficeShell(page, { broker(pathname, _method, _body, route) {
    if (!pathname.startsWith('/api/weekly-source/v1/workspace')) return undefined;
    const workspace = structuredClone(fixtures.workspace);
    const selected = new URL(route.request().url()).searchParams.get('client_id') || '';
    workspace.context.client_id = selected;
    workspace.context.controls.find((control: any) => control.key === 'client').value = selected;
    return workspace;
  } });
  await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open === 'function');
  await page.evaluate(() => { void (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open(); });
  for (const tab of [/^Imports(?:\s|$)/, /^Queries(?:\s|$)/, /^Finalise report(?:\s|$)/, /^History(?:\s|$)/]) {
    await page.locator('#modalTabs').getByRole('button', { name: tab }).click();
    const select = page.getByRole('combobox', { name: 'Trust', exact: true });
    await expect(select).toHaveValue('');
    await select.selectOption(trustId);
    await expect(select).toHaveValue(trustId);
    try { await expect(select).toBeFocused(); } catch (error) {
      console.log('focus diagnostic', await page.evaluate(() => ({
        active: document.activeElement?.outerHTML?.slice(0, 250),
        controls: [...document.querySelectorAll('[data-ws-context="client"]')].map(el => ({ connected: el.isConnected, visible: !!(el as HTMLElement).offsetParent, html: el.outerHTML.slice(0, 200) })),
        tab: (window as any).modalCtx?.weeklySourceState?.activeTab,
        sequence: (window as any).modalCtx?.weeklySourceState?.requestSequence,
        loading: (window as any).modalCtx?.weeklySourceState?.loading
      })));
      throw error;
    }
    await select.press('Home');
    await select.press('Enter');
    await expect(select).toHaveValue('');
    await expect(select).toBeFocused();
    await expect(select.locator('option:checked')).toHaveText('All trusts');
  }
  expect(externalRequests(page)).toEqual([]);
});

test('policy v2: unmatched source work is visible in Queries but never in checking-only Finalise', async ({ page }, testInfo) => {
  const workspace = structuredClone(fixtures.workspace);
  workspace.profile.id = 'NHSP_PREFINAL_RELEASED_V1';
  workspace.profile.label = 'NHSP previously released shifts';
  workspace.finalise.prepared = false;
  workspace.queries.office_checks = { total_count: 1, rows: [{
    row_key: 'source-row', candidate: 'Rai-Baptiste Baljit', source_reference: 'CCR-02611',
    client: 'Berkshire Healthcare NHS Foundation Trust', booking_reference: '155154209',
    day_date: 'Mon 21 Sep 2026', system_hours: '09:00–17:00 (30 min break)',
    problem: 'No active candidate matches this source row',
    status: { text: 'Needs correction', tone: 'danger' },
    actions: [{ label: 'Link candidate', enabled: true, payload: { recheck_payload: { request_id: 'test' } } }]
  }] };
  await page.setViewportSize({ width: 1600, height: 1000 });
  await mountOfficeShell(page, { broker(pathname) {
    if (pathname.startsWith('/api/weekly-source/v1/workspace')) return workspace;
    return undefined;
  } });
  await page.waitForFunction(() => typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open === 'function');
  await page.evaluate(() => { void (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open(); });
  await page.locator('#modalTabs').getByRole('button', { name: /^Queries(?:\s|$)/ }).click();
  await expect(page.locator('#modalTabs').getByRole('button', { name: 'Finalise report', exact: true })).toBeVisible();
  await expect(page.getByText('Rai-Baptiste Baljit', { exact: true })).toBeVisible();
  await expect(page.getByText('CCR-02611', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Link candidate', exact: true })).toBeVisible();
  const overflow = await page.locator('.ws-office-checks .ws-inner-scroll').evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.locator('#modal').screenshot({ path: testInfo.outputPath('weekly-source-office-checks.png') });
  await page.locator('#modalTabs').getByRole('button', { name: /^Finalise report(?:\s|$)/ }).click();
  await expect(page.getByText('No finalisation report has been prepared', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ready \(/ })).toHaveCount(0);
  expect(externalRequests(page)).toEqual([]);
});

test('hosted TEST Office query modal fits phone and Fold widths without horizontal panning', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`https://testmode.arthur-rai.co.uk/?weekly-query-responsive-proof=${Date.now()}`, {
    waitUntil: 'domcontentloaded'
  });
  if (await page.locator('#loginOverlay').isVisible()) {
    const email = process.env.E2E_USER_EMAIL;
    const password = process.env.E2E_USER_PASSWORD;
    if (!email || !password) throw new Error('Hosted TEST credentials are required for this read-only check.');
    await page.locator('#loginEmail').fill(email);
    await page.locator('#loginPassword').fill(password);
    await page.locator('#loginForm button[type="submit"]').click();
  }
  await expect(page.locator('#loginOverlay')).toBeHidden({ timeout: 30_000 });
  await page.waitForFunction(
    () => typeof (window as any).CloudTMSWeeklySourceImportWorkspaceV1?.open === 'function',
    null, { timeout: 30_000 }
  );
  await page.evaluate(() => { void (window as any).CloudTMSWeeklySourceImportWorkspaceV1.open(); });
  await expect(page.locator('#modal')).toBeVisible({ timeout: 30_000 });
  await page.locator('#modalTabs').getByRole('button', { name: /^Queries(?:\s|$)/ }).click();
  await expect(page.locator('[data-wsr-table], .ws-query-scroll').first()).toBeVisible();
  for (const width of [390, 280, 768]) {
    await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
    const sizes = await page.evaluate(() => {
      const root = document.documentElement;
      const modal = document.querySelector('#modal')!;
      const region = document.querySelector('[data-wsr-table], .ws-query-scroll')!;
      return {
        pageOverflow: root.scrollWidth - root.clientWidth,
        modalOverflow: modal.scrollWidth - modal.clientWidth,
        queryOverflow: region.scrollWidth - region.clientWidth
      };
    });
    expect(sizes.pageOverflow, `${width}px page`).toBe(0);
    expect(sizes.modalOverflow, `${width}px modal`).toBe(0);
    expect(sizes.queryOverflow, `${width}px query`).toBe(0);
    await expect(page.locator('[data-wsr-outreach="ASK_CANDIDATES"], [data-ws-bulk-action="ASK_CANDIDATES"]').first()).toBeDisabled();
    await expect(page.locator('[data-wsr-outreach="SEND_MANAGER_NOW"], [data-ws-bulk-action="SEND_MANAGER_NOW"]').first()).toBeDisabled();
  }
});
