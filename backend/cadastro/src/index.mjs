// Recebe o pré-cadastro do jogo, grava no DynamoDB e avisa o organizador por e-mail (SES).
// O endereço de e-mail vem de variável de ambiente: não aparece no site nem no repositório.
const NOME = /^[\p{L}][\p{L} '.-]{1,39}$/u;
const resposta = (status, corpo) => ({ statusCode: status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(corpo) });

export function validar(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { erro: 'Dados inválidos.' };
  const nome = String(d.nome ?? '').trim(), sobrenome = String(d.sobrenome ?? '').trim(), tel = String(d.telefone ?? '').replace(/\D/g, '');
  if (!NOME.test(nome)) return { erro: 'Nome inválido.' };
  if (!NOME.test(sobrenome)) return { erro: 'Sobrenome inválido.' };
  if (tel.length < 10 || tel.length > 11 || tel[0] === '0' || /^(\d)\1+$/.test(tel)) return { erro: 'Telefone inválido.' };
  if (d.aceite !== true) return { erro: 'Falta a autorização de envio.' };
  return { nome, sobrenome, telefone: tel };
}
export const formatarTelefone = t => t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;

// gravar(dados, agora) -> { primeiro: boolean }; avisar(dados, agora) -> Promise; marcar(telefone) -> Promise
export function criarHandler({ gravar, avisar, marcar, agora = () => new Date().toISOString(), log = console }) {
  return async function handler(evento) {
    const metodo = evento?.requestContext?.http?.method ?? 'POST';
    if (metodo !== 'POST') return resposta(405, { ok: false, erro: 'Use POST.' });
    let texto = evento?.body ?? '';
    if (evento?.isBase64Encoded) texto = Buffer.from(texto, 'base64').toString('utf8');
    if (texto.length > 2048) return resposta(413, { ok: false, erro: 'Dados grandes demais.' });
    let dados; try { dados = JSON.parse(texto); } catch { return resposta(400, { ok: false, erro: 'JSON inválido.' }); }
    const v = validar(dados); if (v.erro) return resposta(400, { ok: false, erro: v.erro });
    const quando = agora();
    let primeiro;
    try { ({ primeiro } = await gravar(v, quando)); }
    catch (e) { log.error('falha ao gravar', e?.name); return resposta(500, { ok: false, erro: 'Não foi possível gravar agora.' }); }
    if (primeiro) {
      // o cadastro já está salvo: se o e-mail falhar, fica marcado como pendente na tabela
      try { await avisar(v, quando); await marcar(v.telefone); }
      catch (e) { log.error('cadastro salvo, e-mail pendente', e?.name); }
    }
    return resposta(200, { ok: true });
  };
}

let real;
export async function handler(evento) {
  if (!real) {
    const { DynamoDBClient, UpdateItemCommand } = await import('@aws-sdk/client-dynamodb');
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    const db = new DynamoDBClient({}), ses = new SESv2Client({}), tabela = process.env.TABELA, email = process.env.EMAIL_DESTINO;
    real = criarHandler({
      async gravar(d, quando) {
        const r = await db.send(new UpdateItemCommand({
          TableName: tabela, Key: { telefone: { S: d.telefone } },
          UpdateExpression: 'SET nome = :n, sobrenome = :s, atualizado_em = :a, criado_em = if_not_exists(criado_em, :a), aceite_em = if_not_exists(aceite_em, :a), email_enviado = if_not_exists(email_enviado, :f) ADD envios :um',
          ExpressionAttributeValues: { ':n': { S: d.nome }, ':s': { S: d.sobrenome }, ':a': { S: quando }, ':f': { BOOL: false }, ':um': { N: '1' } },
          ReturnValues: 'UPDATED_NEW',
        }));
        return { primeiro: r.Attributes?.envios?.N === '1' };
      },
      avisar: (d, quando) => ses.send(new SendEmailCommand({
        FromEmailAddress: email, Destination: { ToAddresses: [email] },
        Content: { Simple: { Subject: { Data: `Novo cadastro no jogo: ${d.nome} ${d.sobrenome}`, Charset: 'UTF-8' }, Body: { Text: { Charset: 'UTF-8', Data: `Novo pré-cadastro em Leonida no Trombetas: Oriximiná\n\nNome: ${d.nome}\nSobrenome: ${d.sobrenome}\nTelefone: ${formatarTelefone(d.telefone)}\nData (UTC): ${quando}\n\nO jogador autorizou o envio destes dados na tela de cadastro.` } } } },
      })),
      marcar: tel => db.send(new UpdateItemCommand({ TableName: tabela, Key: { telefone: { S: tel } }, UpdateExpression: 'SET email_enviado = :t', ExpressionAttributeValues: { ':t': { BOOL: true } } })),
    });
  }
  return real(evento);
}
