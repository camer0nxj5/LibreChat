import {expect,test} from '@playwright/test';
import {NEW_CHAT_PATH,selectModelSpec,sendMessage,mockReply} from './helpers';
test('current-sources toggle persists and is submitted with search',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/agents/tools/web_search/auth',route=>route.fulfill({json:{authenticated:true}}));
 await page.goto(NEW_CHAT_PATH);await selectModelSpec(page,'E2E Icon Spec');
 const toggle=page.getByRole('checkbox',{name:'Check current sources',exact:true});
 await expect(toggle).toBeVisible();await expect(toggle).not.toBeChecked();await toggle.click();await expect(toggle).toBeChecked();
 await sendMessage(page,'Current sources persistence fixture');await expect(mockReply(page)).toBeVisible();
 await page.reload();await expect(toggle).toBeChecked();
 let resolve!:(x:any)=>void;const request=new Promise<any>(r=>resolve=r);
 await page.route('**/api/agents/chat/**',async(route)=>{if(route.request().method()!=='POST'||route.request().url().endsWith('/abort'))return route.continue();resolve(route.request().postDataJSON());await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Stopped before inference"}'});});
 await page.getByTestId('text-input').fill('Latest Ubuntu release');await page.getByTestId('send-button').click();const body=await request;expect(body.ephemeralAgent.current_sources).toBe(true);expect(body.ephemeralAgent.web_search).toBe(true);
 await page.screenshot({path:'/tmp/current-sources-mobile.png'});
});
