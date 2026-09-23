@cds.persistence.skip
service CommonMasterDataService {

    @cds.persistence.skip
    entity PurchasingGroups {
        key ID : UUID;
        purchasingGroupCode : String(40);
        purchasingGroupName : String(180);
        isActive : Boolean;
    }

    @cds.persistence.skip
    entity PurchasingOrganizations {
        key ID : UUID;
        purchasingOrganizationCode : String(40);
        purchasingOrganizationName : String(180);
        isActive : Boolean;
    }

    @cds.persistence.skip
    entity Incoterms {
        key ID : UUID;
        incotermsCode : String(40);
        incotermsDescription : String(180);
        isActive : Boolean;
    }

    @cds.persistence.skip
    entity Vendors {
        key ID : UUID;
        vendorCode : String(40);
        vendorName : String(180);
        vendorEmail : String(255);
        isActive : Boolean;
    }

    @cds.persistence.skip
    entity Users {
        key ID : UUID;
        referenceNumber : String(30);
        userPrincipalName : String(255);
        displayName : String(160);
        email : String(255);
        azureObjectId : String(100);
        department : String(100);
        manager : Association to Users;
        isActive : Boolean;
    }

    @cds.persistence.skip
    entity ApplicableTaxes {
        key ID : UUID;
        taxCode : String(40);
        taxDescription : String(180);
        isActive : Boolean;
    }
}
