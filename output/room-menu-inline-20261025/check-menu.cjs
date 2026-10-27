const { chromium,expect }=require('@playwright/test');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true});const results=[];
for(const width of [390,320,1200]){
 const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8810/?install=1&qa=1');const opener=page.getByRole('button',{name:'대화 메뉴',exact:true});await opener.click();
 const drawer=page.getByRole('dialog',{name:'대화 메뉴',exact:true});await expect(drawer).toBeVisible();
 const design=drawer.getByRole('region',{name:'채팅방 디자인 라이브러리',exact:true}),persona=drawer.getByRole('region',{name:'페르소나 설정',exact:true});
 await expect(design.getByRole('button')).toHaveCount(4);await expect(persona.getByRole('textbox',{name:'이름',exact:true})).toBeVisible();await expect(persona.getByRole('textbox',{name:'나에 대해',exact:true})).toBeAttached();
 const appearance=await drawer.evaluate(el=>({background:getComputedStyle(el).backgroundColor,borders:[getComputedStyle(el).borderLeftWidth,getComputedStyle(el.querySelector('header')).borderBottomWidth],scrollWidth:el.scrollWidth,width:el.clientWidth,groupBackground:getComputedStyle(el.querySelector('section')).backgroundColor}));
 expect(appearance.background).toBe('rgb(37, 37, 37)');expect(appearance.borders).toEqual(['0px','0px']);expect(appearance.groupBackground).toBe('rgb(48, 48, 48)');expect(appearance.scrollWidth).toBeLessThanOrEqual(appearance.width);
 await drawer.getByRole('button',{name:'음성 모드',exact:true}).click();await expect(drawer).toBeVisible();await expect(drawer.getByRole('button',{name:'음성 모드',exact:true})).toHaveAttribute('aria-pressed','true');
 await drawer.getByRole('button',{name:'채팅 모드',exact:true}).click();await expect(drawer).toBeVisible();
 await design.getByRole('button',{name:'카톡 스타일',exact:true}).click();await expect(page.locator('[data-chat-theme]')).toHaveAttribute('data-chat-theme','talk');await expect(drawer).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(1);
 await design.getByRole('button',{name:'미로 기본',exact:true}).click();
 await persona.getByRole('textbox',{name:'이름',exact:true}).fill('지우');await persona.getByRole('textbox',{name:'나에 대해',exact:true}).fill('함께 천천히 이야기하고 싶어요.');
 await persona.getByRole('button',{name:'저장',exact:true}).click();await expect(persona.getByRole('alert')).toHaveText('미리보기에서는 저장하지 않아요.');await expect(drawer).toBeVisible();
 await drawer.getByRole('link',{name:'메시지 창으로 이동'}).scrollIntoViewIfNeeded();await expect(drawer.getByRole('link',{name:'메시지 창으로 이동'})).toHaveAttribute('href','/messages/local-preview');await expect(drawer.getByRole('button',{name:'홈 화면에 추가',exact:true})).toBeVisible();
 await drawer.getByRole('heading',{name:'대화 메뉴',exact:true}).scrollIntoViewIfNeeded();
 await design.getByRole('heading').scrollIntoViewIfNeeded();await page.screenshot({path:`output/room-menu-inline-20261025/menu-${width}.png`});
 await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(opener).toBeFocused();
 await opener.click();await expect(drawer).toBeVisible();await expect(drawer.getByRole('textbox',{name:'이름',exact:true})).toHaveValue('');
 await drawer.getByRole('button',{name:'홈 화면에 추가',exact:true}).click();await expect(drawer).toHaveCount(0);await expect(page.getByRole('dialog',{name:'MIRO를 홈 화면에 추가'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(errors).toEqual([]);results.push({width,appearance,inlineDesignChoices:4,inlinePersona:true,modeKeepsDrawerOpen:true,themeAppliesInPlace:true,personaSaveUsesExistingAction:true,previewDoesNotPersist:true,navigation:true,installGuide:true,escapeRestoresFocus:true,errors});await page.close();
}
await browser.close();fs.writeFileSync('output/room-menu-inline-20261025/CHECKS.json',JSON.stringify({results,paidCalls:0,productionDeployed:false},null,2));console.log('Inline drawer checks passed at320/390/1200px.');})().catch(e=>{console.error(e);process.exit(1)})
