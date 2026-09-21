# O que cada número pede ao relógio

Dentro de uma máscara `.hwt` o desenho é protobuf. Cada elemento é
`{1: índice, 2: tipo, (3+tipo): conteúdo}`. Nos elementos de **valor**
(tipo 3) o campo **5** diz ao relógio que dado ir buscar; nos **anéis e
ponteiros** (tipos 5 e 7) esse papel cabe aos campos **6** e **8**.

Esta tabela foi levantada a 20/09/2026 com máscaras que funcionam — a
CASIO240DW5200 e a Fenix8W5 — e confirmada no pulso do Pedro com duas
máscaras de sondagem.

## Valores (tipo 3, campo 5)

| nº | dado |
|---|---|
| 0 | passos |
| 1 | calorias |
| 2 | batimentos |
| 9 | bateria do relógio, em % |
| 12 | hora |
| 13 | minuto |
| 14 | segundo |
| 17 | dia do mês |
| 24 | mês |
| 25 | dia da semana (segunda = 0, domingo = 6) |

Prova das horas: nas duas fotografias da sonda os números 12, 13 e 14
deram 10·03·42 e 10·06·12 — os três minutos e meio que passaram entre
uma instalação e a outra.

## Anéis e ponteiros (tipo 5 campo 6, tipo 7 campo 8)

| nº | dado |
|---|---|
| 150 | ponteiro das horas |
| 153 | ponteiro dos minutos |
| 154 | ponteiro/anel dos segundos |
| 158 | anel de calorias |
| 161 | anel de passos |
| 163 | anel de bateria |

## Por confirmar

| nº | o que deu na sonda | suspeita |
|---|---|---|
| 4 | vazio | bateria do telemóvel (tem ícone de telemóvel na Fenix) |
| 7 | 1005, quieto | pressão do ar em hPa |
| 8 | 71, quieto | medida em repouso |
| 15 | 2 | — |
| 23 | 0 | — |
| 29·30·31·33 | 20·19·21·20 | dias vizinhos num calendário |
| 34 | 14 | — |

Vazios na sondagem (sem valor ou inexistentes): 3, 5, 6, 10, 11, 16,
18, 19, 20, 21, 22, 26, 27, 28, 32.

## Bandeira do sempre ligado

O número do campo que marca "este elemento aparece no ecrã sempre
ligado" muda com o tipo: **imagens 5, dígitos 6, valores 13,
ponteiros 9**. Ver `ci/sempre_ligado.py`.
