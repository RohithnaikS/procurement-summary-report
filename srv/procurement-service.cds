using psr as psr from '../db/schema.cds';
using { CommonMasterDataService as common } from './external/common-master';


@requires: 'authenticated-user'
service ProcurementService {

  // "*" keeps every existing field; the two extra lines flatten
  // requester.name / requester.email onto the entity itself so the UI
  // can bind "requesterName" directly without needing $expand.
  entity ProcurementRequests as projection on psr.ProcurementRequests {
    *,
    requester.name  as requesterName,
    requester.email as requesterEmail
  };

  entity Requesters as projection on psr.Requesters;
  entity Attachments as projection on psr.Attachments;
  entity Approvers as projection on psr.Approvers;
  entity VendorRiskAssessments as projection on psr.VendorRiskAssessments;
  entity BusinessProcessFlags as projection on psr.BusinessProcessFlags;
  entity TaxCodes as projection on common.ApplicableTaxes {
    key taxCode as code,
    taxDescription as name,
    taxDescription as descr,
    isActive
  };
  entity PurchasingGroups as projection on common.PurchasingGroups {
    key purchasingGroupCode as code,
    purchasingGroupName as name,
    purchasingGroupName as descr,
    isActive
  };
  entity PurchasingOrganizations as projection on common.PurchasingOrganizations {
    key purchasingOrganizationCode as code,
    purchasingOrganizationName as name,
    purchasingOrganizationName as descr,
    isActive
  };
  entity Incoterms as projection on common.Incoterms {
    key incotermsCode as code,
    incotermsDescription as name,
    incotermsDescription as descr,
    isActive
  };
  
  // Unbound function the front end can call as soon as the app loads
  // (e.g. GET /odata/v4/procurement/getCurrentUser()) to populate the
  // header's "Requester" field before any ProcurementRequests row exists.
  // It looks up (and, if needed, creates) the Requesters row for whoever
  // is currently logged in.
  function getCurrentUser() returns Requesters;

  function getApprovers() returns many {
    id         : UUID;
    name       : String(160);
    email      : String(255);
    department : String(100);
    userPrincipalName : String(255);
};
  function getVendors() returns many {
    ID         : String(36);
    vendorCode : String(40);
    vendorName : String(180);
    vendorEmail: String(255);
  };

  // Called by the read-only review screen. The service validates that the
  // logged-in user is the next assigned approver before changing any status.


  action startApprovalProcess(
        requestID : UUID
    ) returns String;

  action decideApproval(
    requestID : UUID,
    decision  : String(20)
  ) returns ProcurementRequests;
}
