# Define corrections and duplicate voiding

Type: grilling
Status: resolved

## Question

Which project and transaction fields count as non-final and may still be corrected after certification? When an already Audited transaction is found to be a duplicate, how should the void appear in search and history while preserving the original certification, the issued slips, and Audited as the final audit workflow status? See FR-06, FR-07, and AC-06–AC-07.

## Answer

- Auditor and supervisor corrections after certification can cover descriptive project details, the transaction's reference/title, its user-entered received date, and its notes. Record the actor, both dates, and before/after values. Keep the transaction type and project association fixed after certification because they define what was audited.
- Record later checklist changes with attribution under the checklist rules. Keep original audit events, issued slip snapshots, and the certification record intact, including the certifier, original amount, and certification dates.
- An auditor or supervisor can void an identified duplicate with a required reason, including after certification. Show **Voided** as a record marker alongside the preserved audit status. Exclude the record from the active queue and allow it to be found by transaction-reference search. Record the void in movement history and reserve its reason for audit roles.

For AC-06 and AC-07, certify a transaction, correct its reference, then void it as a duplicate. Verify the prior value and void are traceable, the record can be located by reference, and the original certification and slips can still be read.
