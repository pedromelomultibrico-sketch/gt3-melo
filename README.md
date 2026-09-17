# GT3 Melo

App Android para gerir o relógio **Huawei Watch GT 3** sem a Huawei Health.

- `nucleo/` — alterações ao Gadgetbridge (ligação Bluetooth ao relógio, ponte JavaScript, atualizador).
- `web/` — interface da app (servida pelo Worker Cloudflare `gt3-melo`); atualiza sem reinstalar.
- `worker/` — código do Worker Cloudflare.

Baseado no [Gadgetbridge](https://codeberg.org/Freeyourgadget/Gadgetbridge) — licença AGPL-3.0.
