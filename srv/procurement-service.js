const cds = require('@sap/cds')

module.exports = class ProcurementService extends cds.ApplicationService { init() {

  const {
    ProcurementRequests,
    Attachments,
    Approvers,
    VendorRiskAssessments,
    Requesters,
    TaxCodes
  } = cds.entities('ProcurementService')

  // ---------------------------------------------------------------------
  // Makes sure a Requesters row exists (and is up to date) for whoever is
  // currently logged in, keyed on their user ID - the same ID that CAP's
  // `managed` aspect automatically writes into `createdBy` on insert.
  // The `requester` association on ProcurementRequests is resolved by
  // matching `requester.userID = createdBy`, so as long as this row
  // exists, the association - and the flattened `requesterName` /
  // `requesterEmail` fields exposed on the service - will resolve.
  // ---------------------------------------------------------------------
async function ensureRequester(req) {

    const oUser = req.user

    if (!oUser || oUser.id === 'anonymous') {
        return null
    }

    const sUserID = oUser.id

    const sName =
        oUser.attr &&
        (oUser.attr.given_name || oUser.attr.family_name)
            ? [
                oUser.attr.given_name,
                oUser.attr.family_name
            ]
                .filter(Boolean)
                .join(' ')
            : sUserID

    const sEmail =
        (oUser.attr && oUser.attr.email) || sUserID

    // Use the transaction associated with the current request
    const tx = cds.tx(req)

    const oExisting = await tx.run(
        SELECT.one
            .from(Requesters)
            .where({ userID: sUserID })
    )

    if (oExisting) {

        if (
            oExisting.name !== sName ||
            oExisting.email !== sEmail
        ) {

            await tx.run(
                UPDATE(Requesters)
                    .set({
                        name: sName,
                        email: sEmail
                    })
                    .where({ userID: sUserID })
            )

            oExisting.name = sName
            oExisting.email = sEmail
        }

        return oExisting
    }

    await tx.run(
        INSERT.into(Requesters).entries({
            userID: sUserID,
            name: sName,
            email: sEmail
        })
    )

    return await tx.run(
        SELECT.one
            .from(Requesters)
            .where({ userID: sUserID })
    )
}



  // Lets the UI fetch/create the current user's requester record before a
  // ProcurementRequests row even exists (e.g. to show it in the header
  // while the form is being filled in).
  this.on('getCurrentUser', async (req) => {
    return await ensureRequester(req)
  })



 this.on('getVendors', async (req) => {

    const sUrl =
        'http://localhost:4020/odata/v4/flowmate-common/Vendors';

    const sUsername =
        process.env.COMMON_USER || 'ca.requester@flowmate.demo';

    const sPassword =
        process.env.COMMON_PASSWORD || 'FlowmateCAUser1!';

    const sAuth = Buffer
        .from(`${sUsername}:${sPassword}`)
        .toString('base64');

    try {

        const oResponse = await fetch(sUrl, {
            headers: {
                Authorization: `Basic ${sAuth}`,
                Accept: 'application/json'
            }
        });

        if (!oResponse.ok) {

            const sError = await oResponse.text();

            req.error(
                oResponse.status,
                `Unable to retrieve vendors from Common Master Data: ${sError}`
            );

            return;
        }

        const oData = await oResponse.json();

        return (oData.value || [])
            .filter(function (oVendor) {
                return oVendor.isActive === true;
            })
            .map(function (oVendor) {
                return {
                    ID: oVendor.ID,
                    vendorCode: oVendor.vendorCode,
                    vendorName: oVendor.vendorName,
                    vendorEmail: oVendor.vendorEmail || ''
                };
            });

    } catch (oError) {

        console.error(
            'Failed to load vendors from Common:',
            oError
        );

        req.error(
            502,
            'Unable to connect to Common Master Data service.'
        );
    }
});


  this.before(['CREATE', 'UPDATE'], ProcurementRequests, async (req) => {

    // requester is derived from createdBy and must never be set directly
    // by a client - strip it defensively even though the unmanaged
    // association already makes it non-writable via OData.
    delete req.data.requester
    delete req.data.requester_ID
    delete req.data.requesterName
    delete req.data.requesterEmail

    // Guarantee the Requesters row backing this user exists so the
    // association resolves as soon as the request is saved.
    await ensureRequester(req)

    console.log('Before CREATE/UPDATE ProcurementRequests', req.data)
  })


  this.on('getApprovers', async (req) => {

    const sUrl =
        'http://localhost:4020/odata/v4/flowmate-common/Users';

    const sUsername =
        process.env.COMMON_USER || 'ca.requester@flowmate.demo';

    const sPassword =
        process.env.COMMON_PASSWORD || 'FlowmateCAUser1!';

    const sAuth = Buffer
        .from(`${sUsername}:${sPassword}`)
        .toString('base64');

    const oResponse = await fetch(sUrl, {
        headers: {
            Authorization: `Basic ${sAuth}`,
            Accept: 'application/json'
        }
    });

    if (!oResponse.ok) {
        const sError = await oResponse.text();

        req.error(
            oResponse.status,
            `Unable to retrieve users from Common Master Data: ${sError}`
        );
    }

    const oData = await oResponse.json();

    return (oData.value || [])
        .filter(function (oUser) {
            return oUser.isActive === true;
        })
        .map(function (oUser) {
            return {
                id: oUser.ID,
                name: oUser.displayName,
                email: oUser.email,
                department: oUser.department,
                userPrincipalName: oUser.userPrincipalName
            };
        });
});





  this.after('READ', ProcurementRequests, async (procurementRequests, req) => {
    console.log('After READ ProcurementRequests', procurementRequests)
  })

  this.before(['CREATE', 'UPDATE'], Attachments, async (req) => {
    console.log('Before CREATE/UPDATE Attachments', req.data)
  })
  this.after('READ', Attachments, async (attachments, req) => {
    console.log('After READ Attachments', attachments)
  })

  this.before(['CREATE', 'UPDATE'], Approvers, async (req) => {
    console.log('Before CREATE/UPDATE Approvers', req.data)
  })
  this.after('READ', Approvers, async (approvers, req) => {
    console.log('After READ Approvers', approvers)
  })

  this.before(['CREATE', 'UPDATE'], VendorRiskAssessments, async (req) => {
    console.log('Before CREATE/UPDATE VendorRiskAssessments', req.data)
  })
  this.after('READ', VendorRiskAssessments, async (vendorRiskAssessments, req) => {
    console.log('After READ VendorRiskAssessments', vendorRiskAssessments)
  })

  this.before(['CREATE', 'UPDATE'], Requesters, async (req) => {
    console.log('Before CREATE/UPDATE Requesters', req.data)
  })
  this.after('READ', Requesters, async (requesters, req) => {
    console.log('After READ Requesters', requesters)
  })


  return super.init()
}}