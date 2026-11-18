import test from 'node:test';
import assert from 'node:assert/strict';
import { validar, formatarTelefone, criarHandler } from '../src/index.mjs';

const ok = { nome: 'Ana Lúcia', sobrenome: "D'Ávila", telefone: '(93) 99123-4567', aceite: true };
const ev = (corpo, metodo = 'POST') => ({ requestContext: { http: { method: metodo } }, body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });
function montar({ primeiro = true, falhaGravar = false, falhaEmail = false } = {}) {
  const reg = { gravou: [], avisou: [], marcou: [] };
  const h = criarHandler({
    gravar: async d => { if (falhaGravar) throw new Error('db'); reg.gravou.push(d); return { primeiro }; },
    avisar: async d => { if (falhaEmail) throw new Error('ses'); reg.avisou.push(d); },
    marcar: async t => { reg.marcou.push(t); }, agora: () => '2026-11-18T20:00:00.000Z', log: { error() {} },
  });
  return { h, reg };
}

test('valida e normaliza', () => {
  assert.deepEqual(validar(ok), { nome: 'Ana Lúcia', sobrenome: "D'Ávila", telefone: '93991234567' });
  for (const ruim of [{ ...ok, nome: '' }, { ...ok, sobrenome: '<b>x</b>' }, { ...ok, telefone: '9399' }, { ...ok, telefone: '11111111111' }, { ...ok, telefone: '09991234567' }, { ...ok, aceite: 'true' }, null, [], 'x'])
    assert.ok(validar(ruim).erro);
  assert.ok(validar({ ...ok, nome: 'Ana\nBcc: x@y.z' }).erro, 'quebra de linha não entra no assunto do e-mail');
  assert.equal(formatarTelefone('93991234567'), '(93) 99123-4567'); assert.equal(formatarTelefone('9335441234'), '(93) 3544-1234');
});
test('primeiro cadastro grava, avisa e marca', async () => {
  const { h, reg } = montar(); const r = await h(ev(ok));
  assert.equal(r.statusCode, 200); assert.deepEqual(JSON.parse(r.body), { ok: true });
  assert.equal(reg.gravou.length, 1); assert.equal(reg.avisou.length, 1); assert.deepEqual(reg.marcou, ['93991234567']);
});
test('cadastro repetido não manda outro e-mail', async () => {
  const { h, reg } = montar({ primeiro: false }); assert.equal((await h(ev(ok))).statusCode, 200); assert.equal(reg.avisou.length, 0);
});
test('e-mail falhou: cadastro continua salvo e a resposta é 200', async () => {
  const { h, reg } = montar({ falhaEmail: true }); assert.equal((await h(ev(ok))).statusCode, 200); assert.equal(reg.gravou.length, 1); assert.equal(reg.marcou.length, 0);
});
test('recusas', async () => {
  const { h, reg } = montar();
  assert.equal((await h(ev(ok, 'GET'))).statusCode, 405);
  assert.equal((await h(ev('{nao json'))).statusCode, 400);
  assert.equal((await h(ev({ ...ok, aceite: false }))).statusCode, 400);
  assert.equal((await h(ev('x'.repeat(3000)))).statusCode, 413);
  assert.equal(reg.gravou.length, 0);
  assert.equal((await montar({ falhaGravar: true }).h(ev(ok))).statusCode, 500);
});
test('corpo em base64', async () => {
  const { h } = montar(); const e = ev(ok); e.body = Buffer.from(e.body).toString('base64'); e.isBase64Encoded = true;
  assert.equal((await h(e)).statusCode, 200);
});
test('resposta nunca devolve dados de cadastro', async () => {
  const { h } = montar(); const r = await h(ev(ok)); assert.ok(!r.body.includes('Ana') && !r.body.includes('9912'));
});
