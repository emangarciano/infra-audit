# Define the dates shown in the queue and history

Type: grilling
Status: resolved

## Question

If a Monday suspension is saved on Thursday after a Tuesday checklist edit, which date should the queue show as the latest action date? Decide how the history orders and labels the two events so users can see both the real action date and the server recording time and follow the accepted state transitions. See FR-02, FR-07, §4.5, and AC-07.

## Answer

- Set the queue's latest action date to the actual action date of the latest recorded workflow movement. Use the registration movement on creation. Checklist edits and ordinary corrections appear in audit history and leave the movement date as it was.
- Give the history an accepted sequence using server recording order, with a stable order when timestamps tie. Display both the actual action date and recording timestamp. Evaluate workflow transitions against the current accepted status.
- A suspension that took place on Monday and was recorded on Thursday appears in history after the Tuesday checklist edit. Its queue date is Monday, its recording timestamp is Thursday, and the status becomes Suspended when the server accepts the action.

For AC-07, verify the example above and check that entering an older actual date leaves past events in their recorded sequence.
