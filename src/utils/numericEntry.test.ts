import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { formatBDT } from './formatters';
import { roundMoney } from './money';
import { calculateStaffEarnings } from './staffPayroll';

test('money preserves whole amounts and decimal taka without rounding to the next taka', () => {
  assert.equal(formatBDT(154), '৳154');
  assert.equal(formatBDT(155), '৳155');
  assert.equal(formatBDT(123.3), '৳123.3');
  assert.equal(formatBDT(123.45), '৳123.45');
  assert.equal(roundMoney(123.3 * 0.1), 12.33);
  assert.equal(roundMoney(123.3 - 12.33 - 0.25), 110.72);
  assert.equal(roundMoney(1.5 * 123.3), 184.95);
  assert.equal(calculateStaffEarnings({ id: 's', name: 'Staff', role: 'Chef', phone: '', salaryType: 'daily', baseSalary: 123.3, joinDate: '2026-01-01', active: true }, [{ id: 'a', staffId: 's', date: '2026-10-01', status: 'half_day', advancePaid: 0, overtimeHours: 0 }], [], '2026-10').earned, 61.65);
});

test('numeric inputs accept arbitrary decimals, remain clearable, and preserve typed decimal strings', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../components/NumericInput.tsx', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external' });
  const state: any[] = [];
  let cursor = 0;
  let value = 0;
  const module = { exports: {} as any };
  const useState = (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (v: any) => { state[i] = v; }]; };
  const element = (type: any, props: any) => ({ type, props });
  vm.runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: (name: string) => name === 'react' ? { useState, createElement: element } : { jsx: element, jsxs: element }, Number, String });
  const render = (extra = {}) => { cursor = 0; return module.exports.NumericInput({ value, onChange: (event: any) => { value = Number(event.target.value); }, ...extra }).props; };
  let input = render();
  assert.equal(input.value, '');
  assert.equal(input.step, 'any');
  input.onFocus({ target: { value: '' } });
  for (const text of ['154', '155', '', '123', '123.', '123.3', '0']) {
    input = render(); input.onChange({ target: { value: text } });
    assert.equal(render().value, text);
    assert.equal(value, Number(text));
  }
  input = render(); input.onBlur({ target: { value: '0' } });
  assert.equal(render().value, '');
  assert.equal(render({ step: 1 }).step, 1);
  assert.equal(render({ min: 1, required: true }).required, true);
});
