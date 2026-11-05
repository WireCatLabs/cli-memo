# memo — Money: payments, invoices and a source's records

Money is not a fact. A payment you read is a finding of kind `payment` with `amount` (a decimal string),
`currency`, `direction` (`to_us`, `from_us`), `state` and `counterparty`. When the owner confirms it, a `paid` one
becomes a `payment:` row (dated `paid_at` when you give it, else `due_at`), an `expected` one an `invoice:`, which
needs a `person:` or `organization:` counterparty, and a `cancelled` one voids the invoice it `supersedes`. A paid
one that settles an expected one names that `invoice:` in `supersedes`. `memo invoices list` and
`memo payments list` show the rows; `memo projects status` sums the confirmed ones per currency under `finance`.
Only the owner confirms money, in `memo review kind:invoice,payment`.
A source's export (a payment sheet, a bank statement) comes in with `memo records check <file> --account <a>` first,
which writes nothing, then `memo records import` once the owner agrees; its invoices and payments wait for the owner.
An invoice or payment whose party is a record of the source (`organization:client`) waits until the owner says which
entry it is: show `memo records list waiting:true --account <provider>:<account>` and leave
`memo records link` to the owner.
