# Contributing

Follow `docs/AGENT_GUIDELINE.md` and `.cursor/rules/erp-pos-core.mdc`.

- Do not invent business rules that are not in §9.
- Do not update `inventory_balances` outside the inventory ledger service.
- Do not mutate historical sales, purchases, refunds, or payments during a currency switch.
- Add a shop-isolation test for every new shop-scoped endpoint.
