import { expect, test } from "@playwright/test";

/**
 * T10 done-when, with a real mouse click: the operator walks from the helipad into the panic room. (This caught a missing
 * Babylon side-effect import that bridge.moveTo-based checks could not see.)
 */
test("clicking the panic room walks the operator there", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/?peaceful=1"); // no defenders: one who sees the operator on the way would start a firefight
  await page.waitForFunction(() => {
    const v = (window as unknown as { __warRoom?: { bridge: { ready: boolean } } }).__warRoom;
    return v?.bridge.ready === true;
  });
  await page.keyboard.press("3"); // hide the upper floor and the roof so the click lands on the ground floor
  await page.keyboard.press("4");

  const target = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const v = (window as any).__warRoom;
    const V3 = v.camera.target.constructor;
    const viewport = v.camera.viewport.toGlobal(v.engine.getRenderWidth(), v.engine.getRenderHeight());
    const p = V3.Project(new V3(71, 0, 36), v.scene.getTransformMatrix().constructor.Identity(), v.scene.getTransformMatrix(), viewport);
    const c = document.querySelector("canvas")!.getBoundingClientRect();
    return { x: c.left + (p.x * c.width) / v.engine.getRenderWidth(), y: c.top + (p.y * c.height) / v.engine.getRenderHeight() };
  });
  await page.mouse.click(target.x, target.y);

  const arrived = await page.waitForFunction(
    () => {
      const v = (window as any).__warRoom;
      const u = v.bridge.units(performance.now()).find((x: { id: string }) => x.id === "op.alpha.1");
      return u.state === "idle" && u.floor === "ground" && Math.abs(u.x - 71) < 0.5 && Math.abs(u.y - 36) < 0.5;
    },
    undefined,
    { timeout: 80_000, polling: 500 },
  );
  expect(arrived).toBeTruthy();
  expect(errors).toEqual([]);
});
