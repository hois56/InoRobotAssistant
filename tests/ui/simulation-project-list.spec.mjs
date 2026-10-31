import { test, expect } from '@playwright/test';

async function setup(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/2_3DSimulation/main.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: await response.text() + '\nwindow.__projectList = { state, createPrimitiveShapeRoot, createWorkspaceRecord, serializeWorkspaceSnapshot, updateUIStatus };' });
    });
    await page.goto('/2_3DSimulation/index.html');
    await page.waitForFunction(() => window.__projectList?.state.workspaceRecovery.ready);
    return errors;
}

async function addProjects(page) {
    return page.evaluate(async () => {
        const a = window.__projectList;
        const other = a.createPrimitiveShapeRoot('box', { x: 20, y: 20, z: 20 }, { name: 'Saved B' });
        a.state.scene.add(other); a.state.models.push(other);
        await a.state.workspaceRecovery.db.putWorkspace(a.createWorkspaceRecord('project-list-saved-b', a.serializeWorkspaceSnapshot()));
        a.state.models.pop(); other.removeFromParent();
        const current = a.createPrimitiveShapeRoot('box', { x: 30, y: 30, z: 30 }, { name: 'Current A' });
        a.state.scene.add(current); a.state.models.push(current); a.updateUIStatus();
        return a.state.workspaceRecovery.workspaceId;
    });
}

test('초기화 왼쪽의 목록은 기존 프로젝트 창을 열고 빈 목록에서 취소할 수 있다', async ({ page }) => {
    const errors = await setup(page);
    const button = page.locator('#btn-workspace-list');
    await expect(button).toHaveCount(1);
    await expect(button).toHaveText('목록');
    expect(await button.evaluate(node => node.nextElementSibling.id)).toBe('btn-reset-simulation');
    const workspaceId = await page.evaluate(() => window.__projectList.state.workspaceRecovery.workspaceId);
    await page.evaluate(() => { window.__projectList.state.workspaceRecovery.db.listWorkspaces = async () => []; });
    await button.click();
    await expect(page.locator('#workspace-recovery-dialog')).toBeVisible();
    await expect(page.locator('#workspace-recovery-description')).toHaveText('저장된 프로젝트가 없습니다.');
    await expect(page.locator('#btn-workspace-restore')).toBeDisabled();
    await page.locator('#btn-workspace-cancel').click();
    await expect(page.locator('#workspace-recovery-dialog')).not.toBeVisible();
    await button.click();
    await expect(page.locator('#workspace-recovery-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#workspace-recovery-dialog')).not.toBeVisible();
    expect(await page.evaluate(() => window.__projectList.state.workspaceRecovery.workspaceId)).toBe(workspaceId);
    expect(errors).toEqual([]);
});

test('목록에서 다른 프로젝트를 불러와도 현재 작업을 보존하고 시작 목록을 중복 표시하지 않는다', async ({ page }) => {
    const errors = await setup(page);
    const currentId = await addProjects(page);
    await page.locator('#btn-workspace-list').click();
    await expect(page.locator('#workspace-recovery-list input[type="radio"]')).toHaveCount(2);
    await expect(page.locator(`#workspace-recovery-list input[type="checkbox"][value="${currentId}"]`)).toBeDisabled();
    await page.locator('#workspace-recovery-list input[type="radio"][value="project-list-saved-b"]').check();
    await Promise.all([page.waitForEvent('load'), page.locator('#btn-workspace-restore').click()]);
    await page.waitForFunction(() => window.__projectList?.state.workspaceRecovery.ready);
    await expect(page.locator('#workspace-recovery-dialog')).not.toBeVisible();
    expect(await page.evaluate(() => window.__projectList.state.models.map(model => model.userData.modelName))).toEqual(['Saved B']);
    expect(await page.evaluate(async id => JSON.stringify((await window.__projectList.state.workspaceRecovery.db.getWorkspace(id)).state), currentId)).toContain('Current A');
    await page.reload();
    await expect(page.locator('#workspace-recovery-dialog')).toBeVisible();
    await expect(page.locator('#btn-workspace-cancel')).not.toBeVisible();
    expect(errors).toEqual([]);
});

test('목록에서 새 작업을 시작해도 기존 프로젝트를 삭제하지 않는다', async ({ page }) => {
    const errors = await setup(page);
    const currentId = await addProjects(page);
    await page.locator('#btn-workspace-list').click();
    await expect(page.locator('#workspace-recovery-dialog')).toBeVisible();
    await Promise.all([page.waitForEvent('load'), page.locator('#btn-workspace-new').click()]);
    await page.waitForFunction(() => window.__projectList?.state.workspaceRecovery.ready);
    expect(await page.evaluate(() => window.__projectList.state.models.length)).toBe(0);
    expect(await page.evaluate(async id => JSON.stringify((await window.__projectList.state.workspaceRecovery.db.getWorkspace(id)).state), currentId)).toContain('Current A');
    expect(errors).toEqual([]);
});

test('현재 작업 저장이 실패하면 목록 전환으로 작업을 잃지 않는다', async ({ page }) => {
    const errors = await setup(page);
    await addProjects(page);
    await page.evaluate(() => {
        window.__projectList.state.workspaceRecovery.db.saveWorkspaceWithLease = async () => { throw new Error('Save unavailable'); };
    });
    await page.locator('#btn-workspace-list').click();
    await expect(page.locator('#btn-workspace-list')).toBeEnabled();
    await expect(page.locator('#workspace-recovery-dialog')).not.toBeVisible();
    await expect(page.locator('#stat-status')).toContainText('작업을 자동 저장하지 못했습니다.');
    expect(await page.evaluate(() => window.__projectList.state.models.map(model => model.userData.modelName))).toEqual(['Current A']);
    expect(errors).toEqual([]);
});
