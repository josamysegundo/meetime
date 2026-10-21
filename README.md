# Painel de Metas

Painel de metas de prospecção por vendedor e equipe, filtrável por tipo de cadência (`?cadenceTypes=STANDARD`), período, equipe e vendedor. Os filtros ficam na URL, então um link compartilhado abre com a mesma visão.

## Rodar

Não precisa de build. Sirva a pasta e abra no navegador:

```
python3 -m http.server 8000
# http://localhost:8000/?cadenceTypes=STANDARD
```

## Onde mexer

- `loadData()` em `app.js` gera dados de exemplo. Troque pela sua API mantendo o formato `{ users, records, defaultGoals }`.
- `CADENCE_TYPES` e `METRICS` no topo de `app.js` definem os tipos de cadência e os indicadores.
- As metas são mensais. Para semana e dia, o painel calcula a parte proporcional aos dias úteis. Metas editadas pelo botão "Editar metas" ficam salvas no navegador.
