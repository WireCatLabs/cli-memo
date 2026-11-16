### Security

- **The contexts around a CRM deal name none a CRM user may not read**: `organizations context`, `context` of a person,
  `deals` and `leads` `context`, `people review` and `relationships list` leave out the deals and leads of a copy
  assigned to another CRM user, and the relationships whose end is one, as the deal lists already did. When a copy's
  sync named no user, these answers say why and carry `complete: false`.
