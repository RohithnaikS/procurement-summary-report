# Getting Started

Welcome to your new CAP project.

It contains these folders and files, following our recommended project layout:

File or Folder | Purpose
---------|----------
`app/` | content for UI frontends goes here
`db/` | your domain models and data go here
`srv/` | your service models and code go here
`readme.md` | this getting started guide

## Next Steps

- Open a new terminal and run `cds watch`
- (in VS Code simply choose _**Terminal** > Run Task > cds watch_)
- Start with your domain model, in a CDS file in `db/`

## Approval mail integration (BPA)

Each saved report receives a display reference such as `PSR-550e8400-e29b-41d4-a716-446655440000`; the underlying `ID` remains a UUID for OData navigation.

In the BPA approval e-mail, make **Click here** point to the deployed UI route below, replacing `<request-id>` with the report's technical `ID`:

```
https://<your-app-host>/index.html#/main/<request-id>
```

The link opens the report read-only. Only the next selected approver sees the Approve and Reject buttons; the backend enforces this too, so the decision cannot be forged by calling the service directly.

Configure `BPA_SUBMISSION_WEBHOOK_URL` on the CAP service with the BPA endpoint that starts the approval-mail automation. On submission, CAP sends the report reference, requester e-mail, and selected approver list. BPA can use the first approver's e-mail and the link above to send its first mail.

To let BPA send the requester-decision e-mail, configure its endpoint as `BPA_DECISION_WEBHOOK_URL`. When the final approver decides, CAP POSTs this JSON payload to that endpoint:

```json
{
  "event": "PSR_APPROVAL_DECIDED",
  "requestID": "<uuid>",
  "requestNumber": "PSR-<uuid>",
  "procurementName": "...",
  "decision": "APPROVED or REJECTED",
  "requesterEmail": "...",
  "decidedBy": "...",
  "decidedAt": "<ISO timestamp>"
}
```

Use `requesterEmail`, `decision`, and `requestNumber` in the BPA mail to the requester. No BPA URL or credentials are stored in source control.

## Learn More

Learn more at <https://cap.cloud.sap>.
