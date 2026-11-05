#!/usr/bin/env python3
# Uso: coloque este arquivo na mesma pasta do admin.js e do app.js e rode:
#   python corrigir_plano_vitalicio.py
# Ele faz uma cópia de segurança (.bak) de cada arquivo e aplica a correção.
import sys, shutil, os

NOVA_VERSAO = "2026.11.1"
VERSAO_ANTIGA = "const VERSAO_SISTEMA = '2026.10.1';"
VERSAO_NOVA = "const VERSAO_SISTEMA = '%s';" % NOVA_VERSAO

ADMIN = [
    (VERSAO_ANTIGA, VERSAO_NOVA),
    (
        "return [ini, fim];",
        "if (fim === VENCIMENTO_VITALICIO) return mesDeISO(dataISO);   // plano vitalício: o limite reinicia todo mês\n  return [ini, fim];",
    ),
    (
        "(lim.por === 'semana' ? ' nesta semana' : lim.por === 'mes' ? ' neste mês' : ' neste período')",
        "(lim.por === 'semana' ? ' nesta semana' : (lim.por === 'mes' || c.planoVenceEm === VENCIMENTO_VITALICIO) ? ' neste mês' : ' neste período')",
    ),
]

APP = [
    (VERSAO_ANTIGA, VERSAO_NOVA),
    (
        "lim.por === 'mes' ? mesDe(data) : [u.planoPagoEm || '0000-00-00', u.planoVenceEm];",
        "lim.por === 'mes' ? mesDe(data) : (u.planoVenceEm >= '2099-01-01' ? mesDe(data) : [u.planoPagoEm || '0000-00-00', u.planoVenceEm]);   // vitalício: reinicia todo mês",
    ),
]


def aplicar(caminho, trocas):
    if not os.path.exists(caminho):
        print("NÃO ENCONTRADO:", caminho)
        return False
    with open(caminho, "r", encoding="utf-8", newline="") as f:
        txt = f.read()
    for antigo, novo in trocas:
        qtd = txt.count(antigo)
        if qtd == 0 and novo in txt:
            print("  já aplicado:", antigo[:50])
            continue
        if qtd != 1:
            print("  ERRO em %s: trecho encontrado %d vez(es): %s" % (caminho, qtd, antigo[:60]))
            return False
        txt = txt.replace(antigo, novo)
    shutil.copyfile(caminho, caminho + ".bak")
    with open(caminho, "w", encoding="utf-8", newline="") as f:
        f.write(txt)
    print("OK:", caminho)
    return True


if __name__ == "__main__":
    pasta = sys.argv[1] if len(sys.argv) > 1 else "."
    a = aplicar(os.path.join(pasta, "admin.js"), ADMIN)
    b = aplicar(os.path.join(pasta, "app.js"), APP)
    sys.exit(0 if (a and b) else 1)
