# Business data

Memo keeps the money side of a small business beside your messages and notes: what you sell or buy, the contracts
and subscriptions behind it, your bank accounts and what moved through them. Invoices, payments and orders are on
[Usage](./usage.md#keep-track-of-money), and deals and leads on [Usage](./usage.md#track-deals-and-leads).

Every list here narrows with words such as `status:active`, never with flags. Each command's options are in the
[command reference](./commands.md).

## Amounts and currencies

An amount is a decimal with at most as many decimals as its currency has: `50000.00` RUB, `1200` JPY (none),
`1.250` BHD (three). Memo keeps it as a whole number of the currency's smallest unit, so nothing is lost to
rounding, and it refuses an amount with more decimals or a currency it does not know. It never converts one currency
to another: every total is per currency.

What an invoice was paid is net: its confirmed payments minus their confirmed refunds. A refund is a payment the other
way, and never more than the payment it gives back for:

```sh
memo payments add 5000.00 RUB --kind out --organization organization:3 --refund-of payment:9
memo invoices show invoice:4
```

An invoice refunded in full is `issued` again, and still owed, until you void it.

## Products

A product is a good or a service you sell or buy, with its price. Anyone writes one at once, with no review.

```sh
memo products add 'Bike rental, month' 10000.00 RUB --kind service --unit month
memo products list kind:service
memo orders lines add order:3 12 --product product:4
```

A line made from a product copies its name and price, so a later price change leaves the line as it was.

## Contracts

A contract keeps its dates, whether it renews, and the days of notice it needs. `contracts show` gives the last day
to give notice.

```sh
memo contracts add 'Rental agreement' --kind service --start-date 2026-11-01 --end-date 2027-10-31 --auto-renew on --notice-days 30 --amount 120000.00 --currency RUB
memo contracts list expires:2026-12-31
```

One your agent adds with an amount waits for you in `memo review kind:contract`.

## Subscriptions

A subscription is something you bill or pay again and again: who supplies it, who pays, how often and every price it
had. A new price is a row of its own from the day it starts, never an edit of the old one.

```sh
memo subscriptions add Hosting 990.00 RUB --kind payable --supplier organization:3 --period 1-month --start-date 2026-11-01
memo subscriptions prices add subscription:5 1190.00 RUB --start-date 2027-01-01
memo subscriptions show subscription:5
```

Your agent's subscriptions and prices wait for you in `memo review`.

## Wallets and transactions

A wallet is a bank account, a card or cash, in one currency. A transaction is what the bank says moved; a payment is
what it settles. They meet only when you link them.

```sh
memo wallets add 'Main card' RUB --kind card --institution 'Bank One'
memo wallets update wallet:2 --opening-balance 15000.00 --opening-date 2026-01-01
memo transactions add wallet:2 500.00 --kind out --occurred-time 2026-11-14 --description 'Coffee shop'
memo transactions update transaction:12 --payment payment:9
memo transactions splits add transaction:12 300.00 Rent --project HRB
memo wallets show wallet:2
```

`wallets show` adds up the opening balance and the confirmed, booked transactions. What is pending or proposed is
shown beside the balance, never in it. Only you set the opening balance: over MCP, `wallets update` is refused unless
you allow it.

## Bring data in from another system

A CRM, an accounting program or a bank export comes in as a records file (JSON, or JSONL with a header line). Check it
first, then import it:

```sh
memo records check erp.jsonl --account example-erp:demo
memo records import erp.jsonl --account example-erp:demo
memo review list kind:invoice,payment,order,contract
```

A spreadsheet works too, one type a sheet. `memo records templates list` lists the types and their columns;
`memo records templates show invoice --locale ru` writes the header row to fill with `;` between cells, as Excel in
Russian or Spanish expects, and `--format json` writes an example envelope instead. The sheet is checked and imported with its type:

```sh
memo records templates show invoice --locale ru > invoices.csv
memo records check invoices.csv --type invoice --account sheet:rentals
memo records import invoices.csv --type invoice --account sheet:rentals
```

A role takes the target's external id (`wallet` = `W-1`), or `organization:C-1` where it may be a person or an
organization. A row that repeats an invoice's `external_id` adds one more line to it. `10 000,50` and `09.11.2026` are
read as Excel writes them. Each refusal names the sheet's line and column.

The same file twice changes nothing. The people and organizations it names are matched by one exact e-mail, phone or
other identifier, or made; never by name. Its invoices, payments, orders, contracts with an amount, subscriptions and
transactions wait for you in `memo review`.

To see where an entry came from, open it. `memo show` and each entry's `show` list its `sources`: the records of the
file it was made from, and the records that name it, such as a quote made for a deal:

```sh
memo show contract:1 deal:1
memo deals show deal:1 --json
memo records show custom:quote:Q-7 --account example-erp:demo
```

## Find it again

`memo search all` finds invoices, payments, orders, contracts, subscriptions, products and wallets by the words of
their numbers and names, beside your messages, mail and notes. `--only business` searches them alone:

```sh
memo search all 'Rental agreement' --only business
```

Bank transactions are not searched: there are too many. `memo transactions list` narrows them by wallet, status,
category or project. A search word with an operator, such as `budg*`, leaves business data out and says why.

Over MCP, an agent's search reads business data unless you deny it: set the `business.list` key in
[`permissions`](./configuration.md#permissions) to `deny`, and `search all` leaves it out and says so.
