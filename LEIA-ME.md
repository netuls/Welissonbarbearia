# Wellisson Barbearia — como colocar no ar

Todos os arquivos desta pasta vão juntos para a hospedagem, na mesma pasta.

## 1. Firestore: publicar as regras

No console do Firebase (projeto `welisson-77143`), vá em **Firestore > Regras**,
apague o que estiver lá, cole o conteúdo de `firestore.rules` e clique em **Publicar**.

Mudou uma coisa em relação às regras anteriores: agora o dono logado pode criar
agendamento e cliente sem passar pelo filtro do formulário público. Sem isso, o
botão "Atendimento avulso" do painel dava erro de permissão.

## 2. Authentication: criar o acesso do dono

O painel pede só a senha — por trás, ela entra com um e-mail fixo que já está no
código, que você não vê nem digita. No console do Firebase:

1. **Authentication > Método de login > E-mail/senha > Ativar**
2. **Authentication > Users > Adicionar usuário**
   - E-mail: `admin@wellissonbarbearia.app` (exatamente assim, é só uma chave interna)
   - Senha: a que você quiser que o Wellisson digite no painel

Para trocar a senha depois, é no próprio console, em Users. Quem não estiver logado
não consegue apagar, editar nem listar clientes: as regras bloqueiam.

## 3. Notificações push

A chave VAPID já está preenchida em `admin.html`, então o painel já pede permissão
ao navegador e registra o aparelho em `_config/fcmTokens`.

Quem **envia** o push quando chega um agendamento é a Cloud Function em
`functions/index.js`. Ela não está ativa até você publicá-la — veja o passo 4.

## 4. Publicar a Cloud Function (envio automático do push)

Isso precisa do **plano Blaze** (pagamento por uso) no projeto `welisson-77143`.
O Blaze tem uma faixa gratuita generosa; para o volume de uma barbearia, o custo
normalmente fica em zero. Ative em: console do Firebase > engrenagem >
**Uso e faturamento > Detalhes e configurações > Alterar plano**.

Com o Blaze ativo, publique a função (é só rodar uma vez, e de novo sempre que eu
mudar o arquivo `functions/index.js`):

```bash
npm install -g firebase-tools     # só na primeira vez, se ainda não tiver
firebase login                    # abre o navegador para você entrar com a conta do projeto
cd wellisson-barbearia            # a pasta que veio com este LEIA-ME
firebase deploy --only functions
```

O que essa função faz: toda vez que um agendamento novo é criado no Firestore, ela
lê os aparelhos registrados em `_config/fcmTokens` e manda a notificação "Novo
agendamento!" com o nome do cliente, o serviço e o horário. Agendamentos lançados
pelo botão "Atendimento avulso" do painel não geram aviso, porque já entram como
concluídos. Tokens que o Firebase reportar como inválidos (app desinstalado, etc.)
são removidos automaticamente.

Se preferir, eu não preciso que você rode o comando — você pode me mandar acesso de
colaborador no projeto do Firebase e eu publico a função por lá também.

## 4. Arquivos

| Arquivo | O que é |
|---|---|
| `index.html`, `style.css`, `app.js` | site do cliente |
| `admin.html`, `admin.css` | painel do dono |
| `sw.js`, `manifest-client.json` | app instalável do cliente |
| `firebase-messaging-sw.js`, `manifest.json` | push e app instalável do painel |
| `logo.png` | logo completa, fundo transparente |
| `logo_emblema.png` | só o brasão (menu e barra lateral) |
| `logo_192/512/180.png` | ícones do app instalado |
| `firestore.rules` | regras para colar no console |
| `functions/`, `firebase.json`, `.firebaserc` | Cloud Function do push automático (veja o passo 4) |

## 5. Detalhes que talvez você queira mexer

- **WhatsApp**: no topo do `app.js`, em `WHATSAPP_NUMBER` e `WHATSAPP_NOTIFY`
  (está `5585982358729`).
- **Serviços e preços**: listas `SERVICES` e `PLANS`, no topo do `app.js` e também
  dentro do `admin.html`. As duas precisam bater.
- **Horários de funcionamento**: direto no painel, aba Horários.
- O modo demonstração está desligado, então os agendamentos gravam de verdade.

## 6. Um aviso sobre privacidade

A leitura de agendamentos é pública, porque o site precisa mostrar quais horários já
estão ocupados e a lista "meus agendamentos". Na prática, quem souber consultar o
Firestore consegue ler nome e telefone dos agendamentos. Dá para fechar isso depois,
criando uma coleção separada só com data e horário ocupados. Me fala se quiser.
