namespace psr;

using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';

entity ProcurementRequests : cuid, managed {
  // Keep the UUID as the technical key, but expose a readable reference in
  // the UI and workflow e-mails (for example: PSR-550e8400-...).
  requestNumber              : String(40) @cds.unique;
  approvalStatus             : String(20) default 'Draft';
  approvalDecisionAt         : DateTime;
  approvalDecisionBy         : String(255);
  virtual canCurrentUserDecide : Boolean;
  procurementName            : String(500);
  procurementObjective        : LargeString;
  procurementType             : Association to ProcurementTypes;
  recommendation               : LargeString;
  currency                     : Association to Currencies;
  procurementValueExclTax      : Decimal(15,2);
  procurementValueInclTax      : Decimal(15,2);
  ticApproval                  : Association to YesNo;
  technicalEvaluationSummary   : LargeString;
  commercialEvaluationSummary  : LargeString;
  numberOfVendorsSelected      : Association to VendorSelectionTypes;
  selectedVendorsName          : LargeString;
  selectedVendorsCode          : LargeString;
  paymentTerms                 : Association to PaymentTerms;
  paymentTermDescription       : LargeString;
  paymentMilestone             : LargeString;
  paymentMode                  : Association to PaymentModes;
  priceValidityFrom          : Date;
  priceValidityTo            : Date;
  performanceBond               : LargeString;
  warranty                      : LargeString;
  termsOfDelivery                : LargeString;
  liquidatedDamages              : LargeString;
  applicableTaxes                : Association to TaxCodes;
  expenseType                     : Association to ExpenseTypes;
  businessProcessFlag             : Association to BusinessProcessFlags;
  purchasingOrganization           : String(180);
  purchasingGroup                  : String(180);
  incoTerms                        : String(180);
  incoLocation                     : LargeString;
  otherConditions                  : LargeString;
  requesterRemarks                 : LargeString;
  attachments                      : Composition of many Attachments on attachments.request = $self;
  approvers                        : Composition of many Approvers on approvers.request = $self;
  vendorRiskAssessment             : Composition of one VendorRiskAssessments on vendorRiskAssessment.request = $self;

  // Not a stored foreign key: resolved at read-time by matching the
  // "createdBy" technical field (from the `managed` aspect, filled
  // automatically from the logged-in user) against a Requesters row.
  // Because it's an unmanaged ("on"-condition) association, the client
  // cannot set or override it - it is effectively read-only.
  requester                        : Association to Requesters
                                        on requester.userID = createdBy @readonly;
}


entity Requesters : cuid {
  userID      : String(50)  @cds.unique;   // matches req.user.id / createdBy
  name        : String(200);
  email       : String(200);
}


entity Attachments : cuid {
  request      : Association to ProcurementRequests;
  slotNumber   : Integer;
  fileName     : String(255);
  mimeType     : String(100);
  content      : LargeBinary @Core.MediaType: mimeType;
  uploadedAt   : DateTime @cds.on.insert: $now;
}


entity Approvers : cuid {
  request       : Association to ProcurementRequests;
  loaLevel      : Integer;
  approverID    : String(50);
  approverName  : String(200);
  approverEmail : String(200);
  status        : String(20) default 'Pending';
  actionedAt    : DateTime;
  comments      : LargeString;
}


entity VendorRiskAssessments : cuid {
  request                     : Association to ProcurementRequests;
  dataAccessType               : Association to DataAccessTypes;
  hasPIIAccess                 : Association to YesNo;
  hasPaymentCardAccess         : Association to YesNo;
  hasInfraAccess                : Association to YesNo;
  isDialogDataHostedOnSupplier  : Association to YesNo;
  riskRating                    : String(20);
}



entity ProcurementTypes : CodeList {
  key code : String(20);
}

entity Currencies : CodeList {
  key code : String(3);
}

entity YesNo : CodeList {
  key code : String(3);
}

entity VendorSelectionTypes : CodeList {
  key code : String(10);
}

entity PaymentTerms : CodeList {
  key code        : String(10);
      description : String(500);
}

entity PaymentModes : CodeList {
  key code : String(2);
}


@cds.autoexpose: false
entity TaxCodes : CodeList {
  key code : String(10);
      rate : Decimal(5,2);
      name : String(100);
      descr : String(500);
}

@cds.autoexpose: false
entity PurchasingGroups : CodeList {
  key code : String(40);
    name : String(180);
    descr : String(500);
}

@cds.autoexpose: false
entity PurchasingOrganizations : CodeList {
  key code : String(40);
    name : String(180);
    descr : String(500);
}

@cds.autoexpose: false
entity Incoterms : CodeList {
  key code : String(40);
    name : String(180);
    descr : String(500);
}


entity ExpenseTypes : CodeList {
  key code : String(20);
}

entity DataAccessTypes : CodeList {
  key code : String(20);
}

entity BusinessProcessFlags : CodeList {
    key code : String(20);
}
